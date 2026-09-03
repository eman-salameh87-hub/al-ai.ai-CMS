// components/site/blocks/legacy-blocks.tsx
//
// Server wrappers for the five blocks added for the new-aeon.com rebuild.
//
// Each one queries what its interactive half needs and hands it down as props.
// The split is the point: the filtering, the marquee and the file picker are
// browser concerns and live in 'use client' modules, while the database access
// stays on the server. Doing it the other way — a client component fetching
// from an API route — would mean a loading state on a page that has no reason
// to have one.
//
// These are async Server Components rendered from BlockRenderer, which is
// synchronous. That works: React awaits an async child on its own, and the
// parent does not become async because of it.
import { getCatalogue, getBlogStrip, getLogos, getRoutePrefix } from '@/lib/db/catalogue';
import { listByType } from '@/lib/db/archives';
import { ClientFilter } from './client-filter';
import { BlogStrip } from './blog-strip';
import { LogoCarousel } from './logo-carousel';
import { VideoHero } from './video-hero';
import { ApplicationForm } from './application-form';
import type { ContentBlock } from '@/lib/blocks/types';

type Block<K extends ContentBlock['type']> = Extract<ContentBlock, { type: K }>;

interface WithLocale {
  locale: 'ar' | 'en';
}

/**
 * Site-chrome strings these blocks need but the block itself does not carry.
 *
 * Not in messages/*.json: those are loaded through next-intl's request config
 * for the page, and a Server Component rendered from BlockRenderer has no
 * useTranslations. A small local map is honest about the scope — five blocks,
 * a handful of words — where plumbing a translator through the renderer would
 * be a larger change for the same result.
 */
const UI = {
  ar: {
    all: 'الكل',
    noResults: 'لا نتائج مطابقة. جرّب تصفية أخرى.',
    loadMore: 'عرض المزيد',
    categories: 'التصنيفات',
    countries: 'الدول',
    skip: 'تخطَّ',
  },
  en: {
    all: 'All',
    noResults: 'Nothing matches those filters. Try another combination.',
    loadMore: 'Show more',
    categories: 'Categories',
    countries: 'Countries',
    skip: 'Skip',
  },
} as const;

export function VideoHeroBlock({ block, locale }: { block: Block<'video-hero'> } & WithLocale) {
  // A hero with no video and no poster has nothing to show. Rendering a black
  // 100vh box would push the whole page down for no reason.
  if (!block.src && !block.poster) return null;

  return (
    <VideoHero
      src={block.src}
      poster={block.poster}
      eyebrow={block.eyebrow}
      title={block.title}
      text={block.text}
      buttonText={block.buttonText}
      buttonUrl={block.buttonUrl}
      skipLabel={block.skipLabel || UI[locale].skip}
      loop={block.loop ?? true}
      height={block.height}
    />
  );
}

export async function LogoCarouselBlock({
  block,
  locale,
}: { block: Block<'logo-carousel'> } & WithLocale) {
  let logos = block.logos;

  /*
   * Pulled from a content type when the editor named one.
   *
   * This is what keeps the home page's client strip in step with the client
   * catalogue: publishing a new case study puts its logo here with no second
   * edit. The legacy page had the same behaviour and this is the block that
   * reproduces it.
   */
  if (block.fromContentType) {
    const prefix = await getRoutePrefix(block.fromContentType);
    logos = await getLogos(block.fromContentType, locale, prefix);
  }

  return (
    <LogoCarousel
      title={block.title}
      logos={logos}
      speedSeconds={block.speedSeconds}
      grayscale={block.grayscale ?? false}
    />
  );
}

export async function BlogStripBlock({
  block,
  locale,
}: { block: Block<'blog-strip'> } & WithLocale) {
  /*
   * Fetch more than `count`, so filtering has something to filter.
   *
   * `count` is how many are SHOWN per view. If only that many were fetched, a
   * category filter would narrow an already-short list to one or two posts and
   * look broken. Four times the count, capped, is enough for the categories in
   * play without shipping the whole blog.
   */
  const { posts, categories } = await getBlogStrip(
    locale,
    Math.min(48, block.count * 4),
    block.categories
  );

  return (
    <BlogStrip
      posts={posts}
      categories={categories}
      locale={locale}
      title={block.title}
      count={block.count}
      layout={block.layout}
      allLabel={block.showAllLabel || UI[locale].all}
    />
  );
}

export async function ClientFilterBlock({
  block,
  locale,
}: { block: Block<'client-filter'> } & WithLocale) {
  const [{ entries, categories, tags }, routePrefix] = await Promise.all([
    getCatalogue(block.contentType, locale),
    getRoutePrefix(block.contentType),
  ]);

  // An empty catalogue renders nothing rather than a page of filter controls
  // over a blank grid.
  if (!entries.length) return null;

  return (
    <ClientFilter
      entries={entries}
      categories={categories}
      tags={tags}
      locale={locale}
      routePrefix={routePrefix}
      title={block.title}
      text={block.text}
      categoryLabel={block.categoryLabel || UI[locale].categories}
      countryLabel={block.countryLabel || UI[locale].countries}
      allLabel={UI[locale].all}
      emptyLabel={UI[locale].noResults}
      moreLabel={UI[locale].loadMore}
      columns={block.columns}
      pageSize={block.pageSize}
    />
  );
}

export async function ApplicationFormBlock({
  block,
  locale,
  pageSlug,
}: { block: Block<'application-form'>; pageSlug?: string } & WithLocale) {
  /*
   * The open roles or available courses, when the editor pointed at a type.
   *
   * Titles rather than ids are submitted, because the value ends up in a
   * form_submissions payload that a recruiter reads. A uuid there would be
   * correct and useless.
   */
  const positions = block.positionsFrom
    ? (await listByType(block.positionsFrom, locale, 60)).map((entry) => ({
        slug: entry.slug,
        title: entry.title,
      }))
    : [];

  return (
    <ApplicationForm
      kind={block.kind}
      locale={locale}
      pageSlug={pageSlug}
      title={block.title}
      text={block.text}
      positions={positions}
      submitLabel={block.submitLabel}
      successMessage={block.successMessage}
      attachmentRequired={block.attachmentRequired ?? true}
    />
  );
}
