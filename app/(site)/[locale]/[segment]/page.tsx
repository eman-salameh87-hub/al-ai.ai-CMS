// app/(site)/[locale]/[segment]/page.tsx
import type { Metadata } from 'next';

import { getContentBySlug } from '@/lib/db/queries';
import { ContentRenderer } from '@/components/site/content-renderer';
import { asContentBlocks } from '@/lib/blocks/content-schema';
import { buildMetadata } from '@/lib/seo/metadata';
import { getSettings } from '@/lib/db/queries';
import { locales, type Locale } from '@/lib/env';
import { isHeroBlock } from '@/lib/blocks/layout';
import { TypeArchive, archiveMetadata } from './type-archive';

interface Params {
  params: Promise<{ locale: string; segment: string }>;
}

/**
 * One segment under a locale, which can be two different things.
 *
 * A published page at that slug, or the index of an admin-created content type
 * whose address is that word. Both live here because Next allows only ONE
 * dynamic name per path level — a sibling [prefix] beside [slug] is a build
 * error, not a routing choice.
 *
 * A page wins when both exist. It is the older meaning of the URL and the one
 * that may already be linked; a type whose archive would be shadowed is
 * refused at creation time instead, where the person can still do something
 * about it.
 */
async function load(localeParam: string, segment: string) {
  if (!locales.includes(localeParam as Locale)) return null;
  const locale = localeParam as Locale;

  const record = await getContentBySlug(segment, locale);

  // Drafts and archived content must not be reachable by URL guessing.
  if (!record || record.content.status !== 'published') return null;

  return { record, locale };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, segment } = await params;
  const loaded = await load(locale, segment);
  if (!loaded) return archiveMetadata(locale, segment);

  const { i18n } = loaded.record;
  const settings = await getSettings();

  return buildMetadata({
    locale: loaded.locale,
    path: `/${segment}`,
    title: i18n?.metaTitle || i18n?.title || segment,
    description: i18n?.metaDescription || i18n?.excerpt,
    image: i18n?.ogImage ?? settings?.logo,
    // Editorial content, so a share renders as an article rather than a site.
    type: 'article',
    noIndex: i18n?.noIndex ?? false,
    siteName: settings?.siteName,
    // A page's own generateMetadata replaces the layout's `icons` field
    // entirely rather than inheriting it — without this, every content page
    // silently lost the favicon the layout set.
    icon: settings?.favicon,
  });
}

export default async function ContentPage({ params }: Params) {
  const { locale, segment } = await params;
  const loaded = await load(locale, segment);

  // No page by that slug — it may be a content type's index instead.
  if (!loaded) return <TypeArchive locale={locale} prefix={segment} />;

  const { i18n } = loaded.record;
  const blocks = asContentBlocks(i18n?.body);

  /**
   * Same fix as the home page (app/(site)/[locale]/page.tsx) for the same
   * reason: a band block in the first position (slider/video-hero/custom)
   * IS the hero. Rendering the generic title+excerpt header on top of it
   * put a plain text banner above the thing built to be the banner — every
   * one of the al-ai.ai detail pages leads with a `slider` block for
   * exactly this reason, and until this check existed they all rendered a
   * dark title bar directly above their own hero image, duplicating the
   * same heading twice on screen.
   */
  const leadsWithHero = isHeroBlock(blocks[0]?.type ?? '');

  /*
   * A hero-led page is one of the al-ai.ai literal-markup pages (see
   * ContentRenderer's `custom` case) — its body mixes plain blocks
   * (heading/paragraph/rich-text, rendered right here at max-w-4xl = 896px)
   * with `custom` blocks that FULL_BLEED escapes out to theme-black.css's
   * native `.tt-wrap` (max-width: 1282px). Capping this article at 896px
   * left the plain blocks narrower than — and not sharing an edge with —
   * every full-bleed section below them, which is the "not aligned" gap
   * the user saw on /about between the closing paragraphs and the
   * round-cta section. Matching the article's own cap to `.tt-wrap`'s
   * 1282px gives both the same left/right edge. A non-hero page has no
   * such blocks (it's plain prose end to end), so it keeps the narrower,
   * more readable 896px.
   */
  return (
    <article className={leadsWithHero ? 'mx-auto max-w-[1282px] px-4 pb-16' : 'mx-auto max-w-4xl px-4 py-16'}>
      {!leadsWithHero && (
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-site-ink">{i18n?.title ?? segment}</h1>
          {i18n?.excerpt && <p className="mt-2 text-lg text-site-ink-muted">{i18n.excerpt}</p>}
        </header>
      )}

      <ContentRenderer
        blocks={blocks}
        locale={loaded.locale}
        pageSlug={segment}
      />
    </article>
  );
}
