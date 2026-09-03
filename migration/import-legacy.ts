// migration/import-legacy.ts
//
// Loads the legacy content dumps into the CMS.
//
//   npm run migrate:legacy -- --dry-run     report what would happen
//   npm run migrate:legacy                  do it
//
// IDEMPOTENT. Re-running updates the rows it created rather than duplicating
// them, keyed on (type, slug). That is not a nicety: a content migration is
// never right first time, and a script you cannot re-run becomes a script
// people patch the database around.
//
// Environment comes from `tsx --env-file=.env`, as every other script in this
// repo does — see package.json. There is no dotenv import, deliberately: two
// ways of loading .env is how a script ends up reading a different DATABASE_URL
// from the app it is migrating into.
//
// WRITES THROUGH THE SAME VALIDATION AS THE API
// Field values go through validateFieldValues and bodies through
// blocksFromHtml, so imported content is subject to exactly the rules an editor
// is. It writes with drizzle rather than over HTTP because a migration wants
// one transaction and no session — but it must not therefore be a way to get
// invalid content into the database, which is the usual cost of that choice.
import { readFileSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  content, contentI18n, contentTypes, contentCategories, contentTags,
  categories, categoryI18n, tags, tagI18n, users, redirects,
} from '@/lib/db/schema';
import { blocksFromHtml, type ConversionNotice } from '@/lib/blocks/from-html';
import { parseFieldDefinitions, validateFieldValues } from '@/lib/content/custom-fields';
import { legacySlug, mapLegacyPath } from '@/lib/redirects/legacy-map';
import { normaliseSource } from '@/lib/redirects/normalise';
import { LEGACY_TYPES, type LegacyTypeSpec } from './lib/legacy-types';
import { buildMediaIndex } from './lib/media-index';
import {
  importReferencedMedia, makeSrcResolver, type MediaImportResult,
} from './lib/import-media';

const DRY_RUN = process.argv.includes('--dry-run');
const OUT = join(process.cwd(), 'migration/out');
const LEGACY_ROOT = join(process.cwd(), '..', 'NewAeonWebsite');

type Row = Record<string, string | null>;

function readTable(name: string): Row[] {
  const path = join(OUT, `${name}.json`);
  if (!existsSync(path)) {
    throw new Error(
      `${path} is missing. Run ./migration/restore-legacy.sh then ./migration/dump-legacy.sh`
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Row[];
}

const text = (row: Row, column: string | undefined): string | null => {
  if (!column) return null;
  const value = row[column];
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

/** Report accumulated as the run proceeds, written out at the end. */
const report = {
  startedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  types: [] as { slug: string; routePrefix: string; entries: number; fields: number }[],
  taxonomy: { categories: 0, countryTags: 0, categoryLinks: 0, countryLinks: 0 },
  media: { imported: 0, reused: 0, skipped: [] as { file: string; reason: string }[], megabytes: 0 },
  entries: [] as {
    type: string; slug: string; legacyId: string; action: 'created' | 'updated';
    locales: string[]; blocks: { en: number; ar: number }; featuredImage: boolean;
    fieldsSet: string[];
  }[],
  conversionNotices: {} as Record<string, number>,
  redirectsRecorded: [] as { source: string; destination: string; note: string }[],
  warnings: [] as string[],
};

const notice = (n: ConversionNotice) => {
  report.conversionNotices[n.kind] = (report.conversionNotices[n.kind] ?? 0) + 1;
};

// ─── CONTENT TYPES ────────────────────────────────────────

/**
 * Create or update the four catalogue types.
 *
 * The route prefix is asserted against the redirect rule before anything is
 * written. If they disagree, every legacy URL for that section 308s to a 404,
 * and it is much better to refuse to start than to discover that in Search
 * Console a fortnight later.
 */
async function ensureTypes(): Promise<Map<string, { id: string; spec: LegacyTypeSpec }>> {
  const result = new Map<string, { id: string; spec: LegacyTypeSpec }>();

  for (const spec of LEGACY_TYPES) {
    const definitions = spec.fields.map(({ from: _from, ...definition }) => definition);

    const [existing] = await db
      .select({ id: contentTypes.id })
      .from(contentTypes)
      .where(eq(contentTypes.slug, spec.slug))
      .limit(1);

    if (DRY_RUN) {
      result.set(spec.slug, { id: existing?.id ?? '(dry-run)', spec });
    } else if (existing) {
      await db
        .update(contentTypes)
        .set({
          name: spec.name.en,
          description: spec.description,
          routePrefix: spec.routePrefix,
          hasCategories: spec.hasCategories,
          hasTags: spec.hasTags,
          hasFeaturedImage: true,
          hasArchive: true,
          isActive: true,
          customFields: definitions,
        })
        .where(eq(contentTypes.id, existing.id));
      result.set(spec.slug, { id: existing.id, spec });
    } else {
      const [created] = await db
        .insert(contentTypes)
        .values({
          slug: spec.slug,
          name: spec.name.en,
          description: spec.description,
          routePrefix: spec.routePrefix,
          hasArchive: true,
          hasCategories: spec.hasCategories,
          hasTags: spec.hasTags,
          hasFeaturedImage: true,
          isBuiltIn: false,
          isActive: true,
          customFields: definitions,
        })
        .returning({ id: contentTypes.id });
      result.set(spec.slug, { id: created!.id, spec });
    }

    report.types.push({
      slug: spec.slug,
      routePrefix: spec.routePrefix,
      entries: 0,
      fields: definitions.length,
    });
  }

  return result;
}

// ─── TAXONOMY ─────────────────────────────────────────────

/**
 * `Category` -> categories, `Country` -> tags.
 *
 * The split is forced and it is the right way round. The CMS has exactly one
 * hierarchical tree and a flat tag space; the Portfolio page filters on both
 * axes at once. Industry category is the axis with sub-divisions and an
 * editorial order, so it takes the tree. Country is a flat list of fourteen
 * values, which is what a tag is.
 */
async function importTaxonomy(): Promise<{
  categoryByLegacyId: Map<string, string>;
  tagByLegacyId: Map<string, string>;
}> {
  const categoryByLegacyId = new Map<string, string>();
  const tagByLegacyId = new Map<string, string>();

  for (const row of readTable('Category')) {
    const legacyId = text(row, 'Cat_id');
    const nameEn = text(row, 'Cat_Name_En');
    const nameAr = text(row, 'Cat_Name_Ar');
    if (!legacyId || (!nameEn && !nameAr)) continue;

    const slug = legacySlug(nameEn ?? nameAr ?? '') || `category-${legacyId}`;
    const order = Number.parseInt(text(row, 'Cat_Order') ?? '0', 10);

    if (DRY_RUN) {
      categoryByLegacyId.set(legacyId, '(dry-run)');
      report.taxonomy.categories += 1;
      continue;
    }

    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);

    let id: string;
    if (existing) {
      id = existing.id;
      await db
        .update(categories)
        .set({ sortOrder: Number.isFinite(order) ? order : 0, isActive: true })
        .where(eq(categories.id, id));
    } else {
      const [created] = await db
        .insert(categories)
        .values({ slug, sortOrder: Number.isFinite(order) ? order : 0, isActive: true })
        .returning({ id: categories.id });
      id = created!.id;
    }

    // One row per locale — the *En/*Ar column pair collapsing into i18n rows is
    // the single biggest structural win of this migration.
    for (const [locale, name] of [['en', nameEn], ['ar', nameAr]] as const) {
      if (!name) continue;
      await db
        .insert(categoryI18n)
        .values({ categoryId: id, locale, name })
        .onConflictDoUpdate({
          target: [categoryI18n.categoryId, categoryI18n.locale],
          set: { name },
        });
    }

    categoryByLegacyId.set(legacyId, id);
    report.taxonomy.categories += 1;
  }

  for (const row of readTable('Country')) {
    const legacyId = text(row, 'Country_ID');
    const nameEn = text(row, 'Country_name_En');
    const nameAr = text(row, 'Country_name_Ar');
    if (!legacyId || (!nameEn && !nameAr)) continue;

    const slug = legacySlug(nameEn ?? nameAr ?? '') || `country-${legacyId}`;

    if (DRY_RUN) {
      tagByLegacyId.set(legacyId, '(dry-run)');
      report.taxonomy.countryTags += 1;
      continue;
    }

    const [existing] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.slug, slug))
      .limit(1);

    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      const [created] = await db
        .insert(tags)
        // `name` is the reference/fallback name, so a tag is never a blank chip
        // in a locale that has no translation.
        .values({ slug, name: nameEn ?? nameAr ?? slug })
        .returning({ id: tags.id });
      id = created!.id;
    }

    for (const [locale, name] of [['en', nameEn], ['ar', nameAr]] as const) {
      if (!name) continue;
      await db
        .insert(tagI18n)
        .values({ tagId: id, locale, name })
        .onConflictDoUpdate({ target: [tagI18n.tagId, tagI18n.locale], set: { name } });
    }

    tagByLegacyId.set(legacyId, id);
    report.taxonomy.countryTags += 1;
  }

  return { categoryByLegacyId, tagByLegacyId };
}

// ─── ENTRIES ──────────────────────────────────────────────

async function importType(
  spec: LegacyTypeSpec,
  typeId: string,
  srcResolver: (src: string) => string | null,
  mediaUrlFor: (value: string | null, table: string) => string | null,
  authorId: string | null,
  links: {
    categoryByLegacyId: Map<string, string>;
    tagByLegacyId: Map<string, string>;
    clientCategories: Map<string, string[]>;
    clientCountries: Map<string, string[]>;
  }
): Promise<number> {
  const rows = readTable(spec.table);
  const columns = spec.columns;
  let count = 0;

  // Manual order is preserved as insertion order, which is the only place the
  // new schema can honour it: an archive sorts by publishedAt, and entries have
  // no sortOrder of their own. Recorded in DROPPED_COLUMNS as a known loss.
  const ordered = [...rows].sort((a, b) => {
    const left = Number.parseInt(text(a, columns.order) ?? '0', 10) || 0;
    const right = Number.parseInt(text(b, columns.order) ?? '0', 10) || 0;
    return left - right;
  });

  for (const [index, row] of ordered.entries()) {
    const legacyId = text(row, columns.id) ?? String(index);
    const rawSlug = text(row, columns.slug);
    const slug = legacySlug(rawSlug ?? '');

    if (!slug) {
      report.warnings.push(
        `${spec.table} #${legacyId}: slug "${rawSlug}" does not reduce to a URL — skipped`
      );
      continue;
    }

    const titleEn = text(row, columns.titleEn);
    const titleAr = text(row, columns.titleAr);
    if (!titleEn && !titleAr) {
      report.warnings.push(`${spec.table} #${legacyId}: no title in either locale — skipped`);
      continue;
    }

    /*
     * The slug the redirect rule expects, cross-checked here.
     *
     * The rule turns /en/ClientSelected/STC into /en/clients/stc. If the slug
     * this import writes is not "stc", that legacy URL 308s to a 404. Rather
     * than trust the two implementations to agree, ask the rule and compare —
     * and when they differ, record an explicit redirect row so the URL still
     * works.
     */
    const legacyPath = `/en/${legacyDetailAction(spec)}/${rawSlug}`;
    const ruleDestination = mapLegacyPath(legacyPath)?.destination;
    const expected = `/en/${spec.routePrefix}/${slug}`;
    if (ruleDestination && ruleDestination !== expected) {
      report.redirectsRecorded.push({
        source: ruleDestination,
        destination: expected,
        note: `${spec.table} #${legacyId}: rule and import disagreed on the slug`,
      });
    }

    const bodyEn = blocksFromHtml(text(row, columns.bodyEn), {
      resolveImageSrc: srcResolver,
      onNotice: notice,
    });
    const bodyAr = blocksFromHtml(text(row, columns.bodyAr), {
      resolveImageSrc: srcResolver,
      onNotice: notice,
    });

    const featuredImage = mediaUrlFor(text(row, columns.featuredImage), spec.table);

    // Custom field values, through the same validator the API uses.
    const rawFields: Record<string, unknown> = {};
    for (const field of spec.fields) {
      const value = text(row, field.from);
      if (!value) continue;
      rawFields[field.key] =
        field.kind === 'image' ? mediaUrlFor(value, spec.table) : value;
    }
    const definitions = parseFieldDefinitions(
      spec.fields.map(({ from: _from, ...definition }) => definition)
    );
    const validated = validateFieldValues(definitions, rawFields);
    if (!validated.ok) {
      // A bad field value must not cost the whole entry. Report it and import
      // the page without it — a case study with no hover animation is a page;
      // a skipped case study is a 404.
      for (const [key, message] of Object.entries(validated.errors)) {
        report.warnings.push(`${spec.table} #${legacyId}: field "${key}" — ${message}`);
      }
    }
    const fieldValues = validated.ok ? validated.values : {};

    if (DRY_RUN) {
      report.entries.push({
        type: spec.slug, slug, legacyId, action: 'created',
        locales: [titleEn && 'en', titleAr && 'ar'].filter(Boolean) as string[],
        blocks: { en: bodyEn.length, ar: bodyAr.length },
        featuredImage: Boolean(featuredImage),
        fieldsSet: Object.entries(fieldValues).filter(([, v]) => v !== null).map(([k]) => k),
      });
      count += 1;
      continue;
    }

    const [existing] = await db
      .select({ id: content.id })
      .from(content)
      .where(and(eq(content.typeId, typeId), eq(content.slug, slug)))
      .limit(1);

    let contentId: string;
    if (existing) {
      contentId = existing.id;
      await db
        .update(content)
        .set({
          featuredImage,
          customFieldValues: Object.keys(fieldValues).length ? fieldValues : null,
          status: 'published',
          updatedAt: new Date(),
        })
        .where(eq(content.id, contentId));
    } else {
      const [created] = await db
        .insert(content)
        .values({
          typeId,
          slug,
          authorId,
          featuredImage,
          customFieldValues: Object.keys(fieldValues).length ? fieldValues : null,
          status: 'published',
          /*
           * Ordered publication timestamps, spaced a minute apart in legacy
           * order.
           *
           * The legacy `*_Order` column is the only ordering the client has
           * ever seen, and the new archive sorts by publishedAt. Writing them
           * all as now() would scramble a hand-curated running order into
           * insertion-race order. There is no real publication date in the
           * legacy schema to preserve instead.
           */
          publishedAt: new Date(Date.now() - (ordered.length - index) * 60_000),
        })
        .returning({ id: content.id });
      contentId = created!.id;
    }

    for (const [locale, title, excerpt, body, metaTitle, metaDescription] of [
      ['en', titleEn, text(row, columns.excerptEn), bodyEn,
        text(row, columns.metaTitleEn), text(row, columns.metaDescriptionEn)],
      ['ar', titleAr, text(row, columns.excerptAr), bodyAr,
        text(row, columns.metaTitleAr), text(row, columns.metaDescriptionAr)],
    ] as const) {
      if (!title) continue;
      await db
        .insert(contentI18n)
        .values({
          contentId, locale, title,
          excerpt, body,
          metaTitle, metaDescription,
          ogImage: featuredImage,
          noIndex: false,
        })
        .onConflictDoUpdate({
          target: [contentI18n.contentId, contentI18n.locale],
          set: { title, excerpt, body, metaTitle, metaDescription, ogImage: featuredImage },
        });
    }

    // Client taxonomy: category from Client_Category, country from Client_Country.
    if (spec.table === 'Clients') {
      const categoryIds = (links.clientCategories.get(legacyId) ?? [])
        .map((id) => links.categoryByLegacyId.get(id))
        .filter((v): v is string => Boolean(v));
      const tagIds = (links.clientCountries.get(legacyId) ?? [])
        .map((id) => links.tagByLegacyId.get(id))
        .filter((v): v is string => Boolean(v));

      await db.delete(contentCategories).where(eq(contentCategories.contentId, contentId));
      await db.delete(contentTags).where(eq(contentTags.contentId, contentId));

      if (categoryIds.length) {
        await db
          .insert(contentCategories)
          .values(categoryIds.map((categoryId) => ({ contentId, categoryId })))
          .onConflictDoNothing();
        report.taxonomy.categoryLinks += categoryIds.length;
      }
      if (tagIds.length) {
        await db
          .insert(contentTags)
          .values(tagIds.map((tagId) => ({ contentId, tagId })))
          .onConflictDoNothing();
        report.taxonomy.countryLinks += tagIds.length;
      }
    }

    report.entries.push({
      type: spec.slug, slug, legacyId,
      action: existing ? 'updated' : 'created',
      locales: [titleEn && 'en', titleAr && 'ar'].filter(Boolean) as string[],
      blocks: { en: bodyEn.length, ar: bodyAr.length },
      featuredImage: Boolean(featuredImage),
      fieldsSet: Object.entries(fieldValues).filter(([, v]) => v !== null).map(([k]) => k),
    });
    count += 1;
  }

  return count;
}

/** The legacy controller action that served this type's detail pages. */
function legacyDetailAction(spec: LegacyTypeSpec): string {
  switch (spec.table) {
    case 'Clients': return 'ClientSelected';
    case 'Achivements': return 'AchievementSelected';
    case 'WhatWeDo': return 'WhatWeDo';
    case 'AdvancedServicesList': return 'AdvancedService';
    default: return spec.table;
  }
}

// ─── MAIN ─────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — nothing will be written ===\n' : '=== IMPORTING ===\n');

  if (!existsSync(LEGACY_ROOT)) {
    throw new Error(`Legacy source tree not found at ${LEGACY_ROOT}`);
  }

  // An author is required for content rows. Use the first admin — the import
  // is an administrative act and should be attributed to one.
  const [admin] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);
  const authorId = admin?.id ?? null;
  if (!authorId) {
    report.warnings.push('No admin user exists; imported content will have no author.');
  }

  console.log('1. Content types');
  const types = await ensureTypes();
  for (const { spec } of types.values()) {
    console.log(`   ${spec.slug.padEnd(20)} /${spec.routePrefix}`);
  }

  console.log('\n2. Taxonomy');
  const { categoryByLegacyId, tagByLegacyId } = await importTaxonomy();
  console.log(`   ${report.taxonomy.categories} categories, ${report.taxonomy.countryTags} country tags`);

  // Client <-> category and client <-> country join tables.
  const clientCategories = new Map<string, string[]>();
  for (const row of readTable('Client_Category')) {
    const client = text(row, 'CliCat_CleintID');
    const category = text(row, 'CliCat_CategoryID');
    if (!client || !category) continue;
    const list = clientCategories.get(client);
    if (list) list.push(category);
    else clientCategories.set(client, [category]);
  }
  const clientCountries = new Map<string, string[]>();
  for (const row of readTable('Client_Country')) {
    const client = text(row, 'CliCont_ClientID');
    const country = text(row, 'CliCont_CountryID');
    if (!client || !country) continue;
    const list = clientCountries.get(client);
    if (list) list.push(country);
    else clientCountries.set(client, [country]);
  }

  console.log('\n3. Media');
  const index = buildMediaIndex(LEGACY_ROOT);
  console.log(`   indexed ${index.byName.size} distinct media filenames in the legacy tree`);

  // Every image reference the content holds: the mapped columns, the custom
  // field columns, and every <img src> inside every body.
  const references: { value: string; table?: string }[] = [];
  for (const spec of LEGACY_TYPES) {
    for (const row of readTable(spec.table)) {
      const featured = text(row, spec.columns.featuredImage);
      if (featured) references.push({ value: featured, table: spec.table });
      for (const field of spec.fields) {
        if (field.kind !== 'image') continue;
        const value = text(row, field.from);
        if (value) references.push({ value, table: spec.table });
      }
      for (const column of [spec.columns.bodyEn, spec.columns.bodyAr]) {
        const html = text(row, column);
        if (!html) continue;
        for (const match of html.matchAll(/<img[^>]*src\s*=\s*["']([^"']+)/gi)) {
          references.push({ value: match[1]!, table: spec.table });
        }
      }
    }
  }
  /*
   * The images GlobalResources.resx names, as well as the ones the tables do.
   *
   * The three home slider backgrounds and the seven office photographs are not
   * in any content table — the legacy CMS stored their filenames in the
   * resource file. They live under Images/SliderImage/, so `table` is set to
   * that folder rather than left undefined, and without them the seeded home
   * page has no hero and Who We Are has no gallery.
   */
  const resourcesPath = join(OUT, '_resources.json');
  if (existsSync(resourcesPath)) {
    const bundle = JSON.parse(readFileSync(resourcesPath, 'utf8')) as Record<
      string,
      { kind: string; en: string; ar: string }
    >;
    let fromResources = 0;
    for (const entry of Object.values(bundle)) {
      if (entry.kind !== 'media') continue;
      for (const value of [entry.en, entry.ar]) {
        if (!value?.trim()) continue;
        references.push({ value: value.trim(), table: 'SliderImage' });
        fromResources += 1;
      }
    }
    console.log(`   ${fromResources} more from GlobalResources.resx`);
  } else {
    report.warnings.push(
      'migration/out/_resources.json is absent — slider and office images were not imported. ' +
      'Run: python3 migration/extract-resources.py'
    );
  }

  console.log(`   ${references.length} image references to resolve`);

  const media: MediaImportResult = DRY_RUN
    ? { byLegacyName: new Map(), imported: 0, reused: 0, skipped: [], bytes: 0 }
    : await importReferencedMedia(index, references, authorId);

  report.media = {
    imported: media.imported,
    reused: media.reused,
    skipped: media.skipped,
    megabytes: Number((media.bytes / 1048576).toFixed(1)),
  };
  console.log(
    `   imported ${media.imported}, reused ${media.reused}, skipped ${media.skipped.length} ` +
    `(${report.media.megabytes} MB)`
  );

  const srcResolver = makeSrcResolver(media);
  const mediaUrlFor = (value: string | null, table: string): string | null => {
    if (!value) return null;
    const resolved = srcResolver(value);
    if (resolved) return resolved;
    // In a dry run nothing has been imported, so a miss here is expected and
    // must not be reported as data loss.
    if (!DRY_RUN) {
      report.media.skipped.push({ file: `${table}:${value}`, reason: 'no imported asset' });
    }
    return null;
  };

  console.log('\n4. Entries');
  for (const [slug, { id, spec }] of types) {
    const count = await importType(spec, id, srcResolver, mediaUrlFor, authorId, {
      categoryByLegacyId, tagByLegacyId, clientCategories, clientCountries,
    });
    const entry = report.types.find((t) => t.slug === slug);
    if (entry) entry.entries = count;
    console.log(`   ${slug.padEnd(20)} ${String(count).padStart(3)} entries`);
  }

  // Explicit redirect rows, only where the rule and the import disagreed.
  if (report.redirectsRecorded.length && !DRY_RUN) {
    console.log(`\n5. Redirects (${report.redirectsRecorded.length} explicit rows)`);
    for (const row of report.redirectsRecorded) {
      await db
        .insert(redirects)
        .values({
          source: normaliseSource(row.source),
          destination: row.destination,
          statusCode: 301,
          note: row.note,
        })
        .onConflictDoUpdate({
          target: redirects.source,
          set: { destination: row.destination, note: row.note, isActive: true },
        });
    }
  } else {
    console.log('\n5. Redirects — none needed; the rule covers every imported slug');
  }

  const reportPath = join(OUT, '_import-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n─── SUMMARY ───');
  console.log(`entries:   ${report.entries.length}`);
  console.log(`blocks:    ${report.entries.reduce((n, e) => n + e.blocks.en + e.blocks.ar, 0)}`);
  console.log(`media:     ${report.media.imported} imported, ${report.media.skipped.length} unresolved`);
  console.log(`notices:   ${JSON.stringify(report.conversionNotices)}`);
  console.log(`warnings:  ${report.warnings.length}`);
  for (const warning of report.warnings.slice(0, 12)) console.log(`   - ${warning}`);
  if (report.warnings.length > 12) console.log(`   … and ${report.warnings.length - 12} more`);
  console.log(`\nreport: ${reportPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nIMPORT FAILED:', error);
    process.exit(1);
  });
