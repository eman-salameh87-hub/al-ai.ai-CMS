// app/(site)/[locale]/[segment]/[slug]/page.tsx
import type { Metadata } from 'next';
import { redirectOrNotFound } from '@/lib/redirects/guard';
import { db } from '@/lib/db';
import { content, contentI18n, contentTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { ContentRenderer } from '@/components/site/content-renderer';
import { asContentBlocks } from '@/lib/blocks/content-schema';
import { typeByPrefix } from '@/lib/content/types-admin';
import { buildMetadata } from '@/lib/seo/metadata';
import { getSettings } from '@/lib/db/queries';
import { locales, type Locale } from '@/lib/env';
import { parseFieldDefinitions } from '@/lib/content/custom-fields';
import { CustomFieldBanner, CustomFieldDetails } from '@/components/site/custom-fields';

interface Params {
  params: Promise<{ locale: string; segment: string; slug: string }>;
}

/**
 * An entry of an admin-created content type: /ar/case-studies/acme.
 *
 * This route is what made the content-type builder possible. `content_types`
 * always accepted new rows, but /[locale]/[slug] catches every bare path, so a
 * new type had rows, an editor, and nowhere to live.
 *
 * The least specific route on the site. Next matches static segments first, so
 * /shop, /products and the rest resolve before this runs — which is exactly why
 * a type may not claim one of those words as its address.
 */
async function load(localeParam: string, prefix: string, slug: string) {
  if (!locales.includes(localeParam as Locale)) return null;
  const locale = localeParam as Locale;

  const type = await typeByPrefix(prefix);
  if (!type) return null;

  const [row] = await db
    .select({
      status: content.status,
      title: contentI18n.title,
      excerpt: contentI18n.excerpt,
      body: contentI18n.body,
      metaTitle: contentI18n.metaTitle,
      metaDescription: contentI18n.metaDescription,
      ogImage: contentI18n.ogImage,
      noIndex: contentI18n.noIndex,
      // The entry's own field values, plus the definitions from its type, so
      // the page can render them. Both come from the same query the page
      // already runs.
      customFieldValues: content.customFieldValues,
      typeCustomFields: contentTypes.customFields,
    })
    .from(content)
    .innerJoin(contentTypes, eq(contentTypes.id, content.typeId))
    // LEFT JOIN, matching how the rest of the site treats a missing
    // translation: the entry resolves rather than 404ing.
    .leftJoin(
      contentI18n,
      and(eq(contentI18n.contentId, content.id), eq(contentI18n.locale, locale))
    )
    .where(and(eq(content.slug, slug), eq(contentTypes.id, type.id)))
    .limit(1);

  // Drafts and archived entries must not be reachable by guessing a URL.
  if (!row || row.status !== 'published') return null;
  return { row, locale };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, segment, slug } = await params;
  const loaded = await load(locale, segment, slug);
  if (!loaded) return {};

  const { row } = loaded;
  const settings = await getSettings();

  return buildMetadata({
    locale: loaded.locale,
    path: `/${segment}/${slug}`,
    title: row.metaTitle || row.title || slug,
    description: row.metaDescription || row.excerpt,
    image: row.ogImage ?? settings?.logo,
    type: 'article',
    noIndex: row.noIndex ?? false,
    siteName: settings?.siteName,
    // See app/(site)/[locale]/[segment]/page.tsx's matching comment — a
    // page's own generateMetadata replaces the layout's `icons` field
    // entirely rather than inheriting it.
    icon: settings?.favicon,
  });
}

export default async function CustomTypeEntry({ params }: Params) {
  const { locale, segment, slug } = await params;
  const loaded = await load(locale, segment, slug);
  // A recorded move wins over a 404. The rule in middleware has already had
  // its go; this is the table, for the slugs no rule could predict.
  /*
   * `return await`, not a bare await.
   *
   * redirectOrNotFound is Promise<never> and always throws, but TypeScript
   * only narrows `loaded` past this line if the branch RETURNS — an awaited
   * never is not a control-flow assertion. Returning it is also honest: this
   * function is finished either way.
   */
  if (!loaded) return await redirectOrNotFound(`/${locale}/${segment}/${slug}`);

  const { row } = loaded;
  const definitions = parseFieldDefinitions(row.typeCustomFields);

  return (
    <article className="mx-auto max-w-4xl px-4 py-16" data-test-id="type-entry">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-site-ink">{row.title ?? slug}</h1>
        {row.excerpt && <p className="mt-2 text-site-ink-muted">{row.excerpt}</p>}
      </header>

      {/* A field marked `banner` — the legacy inner-page image — above the
          body, which is where the old template put it. */}
      <CustomFieldBanner definitions={definitions} values={row.customFieldValues} />

      <ContentRenderer
        blocks={asContentBlocks(row.body)}
        locale={loaded.locale}
        // The full path, not just the slug: a submission from a client case
        // study should be traceable to that entry, and `stc` alone is
        // ambiguous across four catalogues.
        pageSlug={`${segment}/${slug}`}
      />

      {/* Fields marked `inline` — the advanced services' video, and anything an
          editor adds later — after the body. */}
      <CustomFieldDetails
        definitions={definitions}
        values={row.customFieldValues}
        locale={loaded.locale}
      />
    </article>
  );
}
