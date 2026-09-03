// lib/db/catalogue.ts
//
// Queries for the blocks that filter a catalogue in the browser.
//
// WHY THESE ARE NOT IN archives.ts
// The helpers there answer "give me a page of this archive" — one query, server
// side, already narrowed. These answer "give me everything the visitor can
// filter, and what each item is tagged with", because the Portfolio page's
// filtering happens WITHOUT a page load. That is a different shape: it needs the
// join rows shipped alongside the entries, and it needs the axes themselves so
// the controls can render with counts.
//
// The whole set is fetched once rather than a query per filter change. For 96
// clients across 19 categories and 14 countries that is a few kilobytes, and it
// is what makes the filter instant — the behaviour the legacy page had.
import 'server-only';
import { db } from './index';
import {
  content, contentI18n, contentTypes, contentCategories, contentTags,
  categories, categoryI18n, tags, tagI18n,
} from './schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

const published = eq(content.status, 'published');

export interface CatalogueEntry {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  featuredImage: string | null;
  /** Category slugs this entry belongs to. */
  categorySlugs: string[];
  /** Tag slugs — country, for the client catalogue. */
  tagSlugs: string[];
}

export interface FilterOption {
  slug: string;
  /** Translated name, falling back to the reference name. */
  name: string;
  /** How many entries carry it, so a zero-count control is never rendered. */
  count: number;
}

export interface CatalogueData {
  entries: CatalogueEntry[];
  categories: FilterOption[];
  tags: FilterOption[];
}

/**
 * Everything the two-axis filter needs, for one content type.
 *
 * Three queries, not N+1: the entries, then their category rows, then their tag
 * rows, stitched in memory. Doing it as one join would multiply each entry by
 * its category count times its tag count and need de-duplicating anyway.
 */
export async function getCatalogue(
  typeSlug: string,
  locale: 'ar' | 'en'
): Promise<CatalogueData> {
  const rows = await db
    .select({
      id: content.id,
      slug: content.slug,
      title: contentI18n.title,
      excerpt: contentI18n.excerpt,
      featuredImage: content.featuredImage,
    })
    .from(content)
    .innerJoin(contentTypes, eq(contentTypes.id, content.typeId))
    // innerJoin: an entry with no translation in this locale has nothing to
    // show, so it is excluded rather than rendered title-less.
    .innerJoin(
      contentI18n,
      and(eq(content.id, contentI18n.contentId), eq(contentI18n.locale, locale))
    )
    .where(and(published, eq(contentTypes.slug, typeSlug)))
    .orderBy(desc(content.publishedAt));

  if (!rows.length) return { entries: [], categories: [], tags: [] };

  const ids = rows.map((row) => row.id);

  const [categoryRows, tagRows] = await Promise.all([
    db
      .select({
        contentId: contentCategories.contentId,
        slug: categories.slug,
        name: categoryI18n.name,
        sortOrder: categories.sortOrder,
      })
      .from(contentCategories)
      .innerJoin(categories, eq(categories.id, contentCategories.categoryId))
      .leftJoin(
        categoryI18n,
        and(eq(categoryI18n.categoryId, categories.id), eq(categoryI18n.locale, locale))
      )
      .where(and(inArray(contentCategories.contentId, ids), eq(categories.isActive, true)))
      .orderBy(asc(categories.sortOrder), asc(categories.slug)),

    db
      .select({
        contentId: contentTags.contentId,
        slug: tags.slug,
        // `tags.name` is the reference name and the fallback, so a tag never
        // renders as a blank chip in a locale with no translation.
        name: sql<string>`coalesce(${tagI18n.name}, ${tags.name})`,
      })
      .from(contentTags)
      .innerJoin(tags, eq(tags.id, contentTags.tagId))
      .leftJoin(tagI18n, and(eq(tagI18n.tagId, tags.id), eq(tagI18n.locale, locale)))
      .where(inArray(contentTags.contentId, ids))
      .orderBy(asc(tags.slug)),
  ]);

  const categoriesByContent = new Map<string, string[]>();
  const categoryNames = new Map<string, { name: string; order: number }>();
  for (const row of categoryRows) {
    const list = categoriesByContent.get(row.contentId);
    if (list) list.push(row.slug);
    else categoriesByContent.set(row.contentId, [row.slug]);
    if (!categoryNames.has(row.slug)) {
      categoryNames.set(row.slug, { name: row.name ?? row.slug, order: row.sortOrder ?? 0 });
    }
  }

  const tagsByContent = new Map<string, string[]>();
  const tagNames = new Map<string, string>();
  for (const row of tagRows) {
    const list = tagsByContent.get(row.contentId);
    if (list) list.push(row.slug);
    else tagsByContent.set(row.contentId, [row.slug]);
    if (!tagNames.has(row.slug)) tagNames.set(row.slug, row.name ?? row.slug);
  }

  const entries: CatalogueEntry[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    featuredImage: row.featuredImage,
    categorySlugs: categoriesByContent.get(row.id) ?? [],
    tagSlugs: tagsByContent.get(row.id) ?? [],
  }));

  /**
   * Counts are computed from the entries actually being shipped, not with a
   * separate COUNT query. A control reading "Banking (0)" — because the count
   * came from a different WHERE clause than the list — is worse than no count.
   */
  const countBy = (pick: (entry: CatalogueEntry) => string[]) => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const slug of pick(entry)) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return counts;
  };

  const categoryCounts = countBy((entry) => entry.categorySlugs);
  const tagCounts = countBy((entry) => entry.tagSlugs);

  return {
    entries,
    categories: [...categoryNames.entries()]
      .map(([slug, meta]) => ({ slug, name: meta.name, count: categoryCounts.get(slug) ?? 0 }))
      .filter((option) => option.count > 0)
      .sort(
        (a, b) =>
          (categoryNames.get(a.slug)?.order ?? 0) - (categoryNames.get(b.slug)?.order ?? 0) ||
          a.name.localeCompare(b.name, locale)
      ),
    tags: [...tagNames.entries()]
      .map(([slug, name]) => ({ slug, name, count: tagCounts.get(slug) ?? 0 }))
      .filter((option) => option.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name, locale)),
  };
}

export interface StripPost {
  slug: string;
  title: string;
  excerpt: string | null;
  featuredImage: string | null;
  publishedAt: Date | null;
  categorySlugs: string[];
}

/**
 * Posts plus their categories, for the home page's filterable blog strip.
 *
 * `limit` is applied per the whole set rather than per category: the strip shows
 * one row and filters it in place, so fetching each category separately would
 * ship the same post several times over.
 */
export async function getBlogStrip(
  locale: 'ar' | 'en',
  limit = 12,
  categorySlugs?: string[]
): Promise<{ posts: StripPost[]; categories: FilterOption[] }> {
  const rows = await db
    .select({
      id: content.id,
      slug: content.slug,
      title: contentI18n.title,
      excerpt: contentI18n.excerpt,
      featuredImage: content.featuredImage,
      publishedAt: content.publishedAt,
    })
    .from(content)
    .innerJoin(contentTypes, eq(contentTypes.id, content.typeId))
    .innerJoin(
      contentI18n,
      and(eq(content.id, contentI18n.contentId), eq(contentI18n.locale, locale))
    )
    .where(and(published, eq(contentTypes.slug, 'post')))
    .orderBy(desc(content.publishedAt))
    .limit(Math.max(1, Math.min(60, limit)));

  if (!rows.length) return { posts: [], categories: [] };

  const categoryRows = await db
    .select({
      contentId: contentCategories.contentId,
      slug: categories.slug,
      name: categoryI18n.name,
      sortOrder: categories.sortOrder,
    })
    .from(contentCategories)
    .innerJoin(categories, eq(categories.id, contentCategories.categoryId))
    .leftJoin(
      categoryI18n,
      and(eq(categoryI18n.categoryId, categories.id), eq(categoryI18n.locale, locale))
    )
    .where(
      and(
        inArray(
          contentCategories.contentId,
          rows.map((row) => row.id)
        ),
        eq(categories.isActive, true)
      )
    )
    .orderBy(asc(categories.sortOrder));

  const byContent = new Map<string, string[]>();
  const names = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const row of categoryRows) {
    // An editor may have pinned the strip to specific categories; anything else
    // is then not a filter, though the post still appears under "All".
    if (categorySlugs?.length && !categorySlugs.includes(row.slug)) continue;
    const list = byContent.get(row.contentId);
    if (list) list.push(row.slug);
    else byContent.set(row.contentId, [row.slug]);
    if (!names.has(row.slug)) names.set(row.slug, row.name ?? row.slug);
    counts.set(row.slug, (counts.get(row.slug) ?? 0) + 1);
  }

  return {
    posts: rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      featuredImage: row.featuredImage,
      publishedAt: row.publishedAt,
      categorySlugs: byContent.get(row.id) ?? [],
    })),
    categories: [...names.entries()].map(([slug, name]) => ({
      slug,
      name,
      count: counts.get(slug) ?? 0,
    })),
  };
}

export interface LogoEntry {
  src: string;
  alt: string;
  url: string;
}

/**
 * Featured images of a content type's published entries, as logos.
 *
 * Entries with no image are dropped rather than rendered as an empty frame —
 * a logo strip with gaps in it reads as a broken page, and 2 of the 9
 * achievements in the legacy data have no image at all.
 */
export async function getLogos(
  typeSlug: string,
  locale: 'ar' | 'en',
  routePrefix: string | null,
  limit = 60
): Promise<LogoEntry[]> {
  const rows = await db
    .select({
      slug: content.slug,
      title: contentI18n.title,
      featuredImage: content.featuredImage,
    })
    .from(content)
    .innerJoin(contentTypes, eq(contentTypes.id, content.typeId))
    .innerJoin(
      contentI18n,
      and(eq(content.id, contentI18n.contentId), eq(contentI18n.locale, locale))
    )
    .where(and(published, eq(contentTypes.slug, typeSlug)))
    .orderBy(desc(content.publishedAt))
    .limit(Math.max(1, Math.min(200, limit)));

  return rows.flatMap((row) =>
    row.featuredImage
      ? [
          {
            src: row.featuredImage,
            // The entry's own title. A logo's alt text is the organisation's
            // name, which is exactly what this is.
            alt: row.title,
            url: routePrefix ? `/${locale}/${routePrefix}/${row.slug}` : '',
          },
        ]
      : []
  );
}

/** A content type's public URL segment, or null if it has no public presence. */
export async function getRoutePrefix(typeSlug: string): Promise<string | null> {
  const [row] = await db
    .select({ routePrefix: contentTypes.routePrefix })
    .from(contentTypes)
    .where(eq(contentTypes.slug, typeSlug))
    .limit(1);
  return row?.routePrefix ?? null;
}
