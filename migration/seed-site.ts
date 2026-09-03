// migration/seed-site.ts
//
// Builds the pages, menus and settings that make the CMS look like
// new-aeon.com.
//
//   npm run migrate:site -- --dry-run
//   npm run migrate:site
//
// Run AFTER migration/import-legacy.ts: the home page's logo strip and the
// portfolio's filter both point at the `client` content type, and the office
// images come from the media library the import populates.
//
// EVERYTHING HERE IS CONTENT, NOT CODE
// The six singleton pages are `page` entries with block bodies, not hand-built
// templates. That is the whole point of the exercise — the client asked for the
// same site on a CMS backend, and a hardcoded Who We Are page would be the same
// site on a different framework. Every heading, paragraph and image below is
// editable in the admin after this runs.
//
// IDEMPOTENT. Re-running rewrites the same rows, so a copy fix is a re-run
// rather than a hand-edit in Postgres.
import { readFileSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  content, contentI18n, contentTypes, navigation, navigationI18n, settings,
  users, mediaAssets,
} from '@/lib/db/schema';
import { blocksFromHtml } from '@/lib/blocks/from-html';
import type { ContentBlock } from '@/lib/blocks/types';
import {
  copy, either, type Bilingual, type ResourceBundle,
  HOME_SLIDES, OFFICES, HEADER_NAV, FOOTER_NAV, NEW_AEON_THEME, TRACKING,
  DROPPED_RESOURCES,
} from './lib/site-copy';

const DRY_RUN = process.argv.includes('--dry-run');
const OUT = join(process.cwd(), 'migration/out');

const report = {
  startedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  pages: [] as { slug: string; blocks: { en: number; ar: number }; action: string }[],
  navigation: { header: 0, footer: 0 },
  settingsApplied: [] as string[],
  mediaResolved: 0,
  mediaMissing: [] as string[],
  droppedResources: DROPPED_RESOURCES,
  warnings: [] as string[],
};

function readBundle(): ResourceBundle {
  const path = join(OUT, '_resources.json');
  if (!existsSync(path)) {
    throw new Error(`${path} missing. Run: python3 migration/extract-resources.py`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as ResourceBundle;
}

/**
 * A legacy image filename -> the URL it has in the media library now.
 *
 * The import kept the legacy GUID as the stored filename precisely so this
 * lookup is possible. A miss is recorded rather than guessed: an office card
 * with no photo is a card, but one pointing at a 404 is a broken page.
 */
async function mediaLookup(): Promise<(filename: string) => string | null> {
  const rows = await db
    .select({ filename: mediaAssets.filename, url: mediaAssets.url })
    .from(mediaAssets);

  const byName = new Map(rows.map((row) => [row.filename.toLowerCase(), row.url]));

  return (filename: string) => {
    if (!filename) return null;
    const bare = filename.split('/').pop()?.toLowerCase() ?? '';
    // The importer lowercases and strips non-URL characters, so a legacy name
    // with Arabic in it will not match verbatim. Try the GUID prefix too.
    const direct = byName.get(bare);
    if (direct) {
      report.mediaResolved += 1;
      return direct;
    }
    const guid = bare.match(/^[0-9a-f-]{36}/)?.[0];
    if (guid) {
      for (const [name, url] of byName) {
        if (name.startsWith(guid)) {
          report.mediaResolved += 1;
          return url;
        }
      }
    }
    if (!report.mediaMissing.includes(filename)) report.mediaMissing.push(filename);
    return null;
  };
}

// ─── BLOCK HELPERS ────────────────────────────────────────

const heading = (text: string, level: 1 | 2 | 3 | 4 = 2): ContentBlock => ({
  type: 'heading', level, text,
});

const paragraph = (text: string): ContentBlock => ({ type: 'paragraph', text });

/**
 * Legacy copy that contains markup, as real blocks.
 *
 * Several resource values are HTML — `<strong>About IMC</strong>`, and body
 * copy wrapped in `<br>`-separated pseudo-paragraphs. They go through the same
 * converter the content import uses, so a heading with a `<strong>` in it
 * becomes a rich-text block rather than a paragraph with visible tags in it.
 */
function fromLegacyHtml(html: string): ContentBlock[] {
  return blocksFromHtml(html, {
    // Resource copy contains no images; anything that turns up is dropped and
    // recorded rather than pointed at a legacy path.
    resolveImageSrc: () => null,
  });
}

/** Blocks for one locale, or nothing when the copy is absent. */
type LocalePair = { en: ContentBlock[]; ar: ContentBlock[] };

function pair(build: (locale: 'en' | 'ar') => ContentBlock[]): LocalePair {
  return { en: build('en'), ar: build('ar') };
}

const pick = (value: Bilingual, locale: 'en' | 'ar') => value[locale] || value.en || value.ar;

// ─── PAGES ────────────────────────────────────────────────

interface PageSpec {
  slug: string;
  title: Bilingual;
  excerpt: Bilingual;
  metaTitle?: Bilingual;
  metaDescription?: Bilingual;
  body: LocalePair;
}

function buildPages(
  bundle: ResourceBundle,
  media: (filename: string) => string | null
): PageSpec[] {
  const c = (key: string) => copy(bundle, key);

  /* ── HOME ──
   *
   * The legacy home page, section for section: a full-screen autoplay video,
   * then a three-slide hero, then the services carousel, then the client logo
   * strip, then the blog strip. Four of those five are the new blocks; the
   * services row is `recent-posts` pointed at the service type.
   */
  const homeBody = pair((locale) => {
    const blocks: ContentBlock[] = [];

    // The legacy landing video, copied to public/brand/main.mp4.
    blocks.push({
      type: 'video-hero',
      src: '/brand/main.mp4',
      // The first hero slide doubles as the poster: it is the right size, it
      // is on-brand, and it means the reduced-motion presentation is a real
      // designed frame rather than a still grabbed from the video.
      poster: media(c(HOME_SLIDES[0].imageKey[locale]).en) ?? '/brand/logo-dark.png',
      title: pick(c('whoweareSliderTitle'), locale),
      text: pick(c('whoweareSliderDesc'), locale),
      skipLabel: locale === 'ar' ? 'تخطَّ المقدمة' : 'Skip intro',
      loop: true,
      height: 'viewport',
    });

    const slides = HOME_SLIDES.flatMap((slide) => {
      const src = media(pick(c(slide.imageKey[locale]), 'en'));
      if (!src) return [];
      const buttonText = pick(c(slide.buttonTextKey), locale);
      return [
        {
          kind: 'image' as const,
          src,
          alt: pick(c(slide.textKey), locale) || 'New Aeon',
          title: pick(c(slide.textKey), locale) || undefined,
          ...(buttonText
            ? { buttonText, buttonUrl: `/${locale}/${slide.href}` }
            : {}),
        },
      ];
    });

    if (slides.length) {
      blocks.push({
        type: 'slider',
        variant: 'main',
        slides,
        autoplay: true,
        intervalMs: 6000,
        height: 'tall',
      });
    }

    // "What we do" — the services row. The legacy page showed a Swiper
    // carousel of the ten WhatWeDo entries here.
    const weDoDesc = pick(c('indexWeDoDesc'), locale);
    if (weDoDesc) blocks.push(paragraph(weDoDesc));

    blocks.push({
      type: 'recent-posts',
      title: pick(c('indexWeDoTitle'), locale) || 'What We Do',
      // The imported service catalogue, not posts. Ten entries, so all of
      // them fit — the legacy carousel showed the same set.
      contentType: 'service',
      count: 10,
      layout: 'grid',
    });

    blocks.push({
      type: 'logo-carousel',
      title: pick(c('indexOurClientHeader'), locale) || undefined,
      logos: [],
      // Pulled from the imported client catalogue, so publishing a case study
      // adds its logo here with no second edit — the legacy behaviour.
      fromContentType: 'client',
      speedSeconds: 45,
      grayscale: true,
    });

    blocks.push({
      type: 'blog-strip',
      title: pick(c('BlogsTitle'), locale) || undefined,
      count: 6,
      layout: 'grid',
    });

    blocks.push({
      type: 'cta',
      title: pick(c('Index_LetTalkBusiness'), locale) || 'Let’s Talk Business',
      text: pick(c('contactusIntro'), locale),
      button: {
        text: pick(c('MasterLinkNameContactUs'), locale) || 'Contact us',
        url: `/${locale}/contact`,
      },
    });

    return blocks;
  });

  /* ── WHO WE ARE ── */
  const whoBody = pair((locale) => {
    const blocks: ContentBlock[] = [];

    const back = media(pick(c('WhoWeAreBackPostedImageDesc'), 'en'));
    if (back) {
      blocks.push({
        type: 'slider',
        variant: 'inner',
        slides: [
          {
            kind: 'image',
            src: back,
            alt: pick(c('WhoWeAre_Title'), locale),
            title: pick(c('whoweareSliderTitle'), locale) || undefined,
            text: pick(c('whoweareSliderDesc'), locale) || undefined,
          },
        ],
        autoplay: false,
        intervalMs: 6000,
        height: 'medium',
      });
    }

    // "About New-Aeon" / "About IMC" — the legacy page's two tabs.
    blocks.push({
      type: 'tabs',
      items: [
        {
          label: pick(c('whoweareNewAeonTab'), locale) || 'About New Aeon',
          content: fromLegacyHtml(pick(c('whoweareAboutNewAeonDetails'), locale)),
        },
        {
          label: stripTags(pick(c('whoweareAboutIMCDigital'), locale)) || 'About IMC',
          content: fromLegacyHtml(pick(c('whoweareAboutIMCDigitalDetails'), locale)),
        },
      ].filter((tab) => tab.content.length > 0),
    });

    for (const [titleKey, detailKey] of [
      ['whoweareOurVision', 'whoweareOurVisionDetails'],
      ['whoweareOurMission', 'whoweareOurMissionDetails'],
    ] as const) {
      const title = stripTags(pick(c(titleKey), locale));
      const detail = fromLegacyHtml(pick(c(detailKey), locale));
      if (!title && !detail.length) continue;
      if (title) blocks.push(heading(title));
      blocks.push(...detail);
    }

    // The seven offices. A gallery, not a feature-grid: these are photographs
    // of places, and the legacy descriptions were never written (see
    // DROPPED_RESOURCES), so a grid of title-plus-empty-body would look unfinished.
    const accordionTitle = pick(c('whoweareAccordionTitle'), locale);
    if (accordionTitle) blocks.push(heading(accordionTitle));

    const officeImages = OFFICES.flatMap((office) => {
      const src = media(pick(c(office.imageKey), 'en'));
      return src ? [{ src, alt: pick(c(office.titleKey), locale) }] : [];
    });
    if (officeImages.length) {
      blocks.push({ type: 'gallery', images: officeImages, layout: 'grid' });
    }

    // The office names as text, so they are readable and indexable rather than
    // only being alt attributes on a gallery.
    const names = OFFICES.map((office) => pick(c(office.titleKey), locale)).filter(Boolean);
    if (names.length) blocks.push(paragraph(names.join(' · ')));

    return blocks;
  });

  /* ── CONTACT ── */
  const contactBody = pair((locale) => {
    const blocks: ContentBlock[] = [];
    const intro = pick(c('contactusIntro'), locale);
    if (intro) blocks.push(heading(intro));
    const data = pick(c('contactusData'), locale);
    if (data) blocks.push(...fromLegacyHtml(data));

    blocks.push({
      type: 'contact-form',
      fields: ['name', 'email', 'phone', 'subject', 'message'],
      submitLabel: locale === 'ar' ? 'إرسال' : 'Send message',
    });

    blocks.push({
      type: 'feature-grid',
      columns: 2,
      items: [
        {
          title: locale === 'ar' ? 'البريد الإلكتروني' : 'Email',
          description: either(bundle, 'contactusEmail', 'info@new-aeon.com'),
        },
        {
          title: locale === 'ar' ? 'الهاتف' : 'Phone',
          description: either(bundle, 'contactusPhone', ''),
        },
      ].filter((item) => item.description),
    });

    blocks.push({
      type: 'social-links',
      platforms: ['facebook', 'instagram', 'twitter'],
      style: 'icons',
    });

    return blocks;
  });

  /* ── PORTFOLIO ──
   *
   * The block carries NO title or text.
   *
   * Every page route already renders the entry's own title and excerpt in a
   * <header> above the blocks, so setting them on the block as well printed
   * "Our Clients" and its paragraph twice on the page. The page header is the
   * right owner of both — it is what the <h1> and the meta description come
   * from.
   */
  const portfolioBody = pair((locale) => [
    {
      type: 'client-filter',
      contentType: 'client',
      categoryLabel: pick(c('Portfolio_Categories'), locale) || undefined,
      countryLabel: pick(c('Portfolio_Countries'), locale) || undefined,
      columns: 4,
      pageSize: 24,
    },
  ]);

  /* ── CAREERS ── */
  const careersBody = pair((locale) => {
    const blocks: ContentBlock[] = [];

    // The legacy page's three counters.
    const stats = [
      ['CareerFirstColTitle', 'CareerFirstColHint'],
      ['CareerSecondColTitle', 'CareerSecondColHint'],
      ['CareerThirdColTitle', 'CareerThirdColHint'],
    ] as const;

    const items = stats.flatMap(([valueKey, labelKey]) => {
      const value = pick(c(valueKey), locale);
      const label = pick(c(labelKey), locale);
      return value && label ? [{ value, label }] : [];
    });
    if (items.length) blocks.push({ type: 'stats', items });

    const paragraphKey = pick(c('CareerParagraph'), locale) || pick(c('Career_Paragraph'), locale);
    if (paragraphKey) blocks.push(...fromLegacyHtml(paragraphKey));

    blocks.push({
      type: 'application-form',
      kind: 'career',
      title: pick(c('CareerFindJobButton'), locale) || undefined,
      // The open roles come from the AvailableJobs table, which is imported as
      // a content type only if it has rows. Left unset rather than pointing at
      // a type that may not exist — the applicant then types the role.
      submitLabel: pick(c('Apply'), locale) || undefined,
      attachmentRequired: true,
    });

    return blocks;
  });

  /* ── TRAINING ── */
  const trainingBody = pair((locale) => {
    const blocks: ContentBlock[] = [];
    const header = pick(c('Training_Apply'), locale);
    if (header) blocks.push(heading(header));

    blocks.push({
      type: 'application-form',
      kind: 'training',
      submitLabel: pick(c('Apply'), locale) || undefined,
      attachmentRequired: true,
    });

    return blocks;
  });

  /* ── PRIVACY POLICY ──
   *
   * The legacy resource value is the literal string "this is resource for
   * Privacy Policy" — a placeholder that has been live on new-aeon.com. It is
   * NOT copied over: publishing it would put obvious filler on a legal page.
   * The page is created with a clear note instead, so the client knows it needs
   * writing rather than finding it missing.
   */
  const privacyBody = pair((locale) => [
    paragraph(
      locale === 'ar'
        ? 'هذه الصفحة بحاجة إلى نص سياسة الخصوصية. النص في الموقع القديم كان نصاً مؤقتاً ولم يُنقل.'
        : 'This page needs its privacy policy text. The legacy site carried placeholder copy, which was deliberately not migrated.'
    ),
  ]);

  return [
    {
      slug: 'home',
      title: c('MasterLinkNameHome'),
      excerpt: c('Index_Metadescription'),
      metaTitle: c('Index_Tilte'),
      metaDescription: c('Index_Metadescription'),
      body: homeBody,
    },
    {
      slug: 'who-we-are',
      title: c('WhoWeAre_Title'),
      excerpt: c('whoweareSliderDesc'),
      metaTitle: c('WhoWeAre_Title'),
      body: whoBody,
    },
    {
      slug: 'contact',
      title: c('contactusPrint'),
      excerpt: c('contactusIntro'),
      body: contactBody,
    },
    {
      slug: 'portfolio',
      title: c('Portfolio_Header2'),
      excerpt: c('Portfolio_Paragraph'),
      metaTitle: c('Portfolio_BrowserTitle'),
      body: portfolioBody,
    },
    {
      slug: 'careers',
      title: c('MasterLinkNameCareer'),
      excerpt: c('CareerFindJobButton'),
      body: careersBody,
    },
    {
      slug: 'training',
      title: c('TraningPage'),
      excerpt: c('Training_Apply'),
      metaTitle: c('Training_BrowserTitle'),
      body: trainingBody,
    },
    {
      slug: 'privacy-policy',
      title: c('MasterLinkNamePrivacy'),
      excerpt: { en: '', ar: '' },
      body: privacyBody,
    },
  ];
}

/** Legacy resource values sometimes wrap a word in <strong>. */
function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// ─── WRITE ────────────────────────────────────────────────

async function writePages(specs: PageSpec[], authorId: string | null) {
  const [pageType] = await db
    .select({ id: contentTypes.id })
    .from(contentTypes)
    .where(eq(contentTypes.slug, 'page'))
    .limit(1);

  if (!pageType) throw new Error('The built-in `page` content type is missing.');

  for (const spec of specs) {
    const enBlocks = spec.body.en;
    const arBlocks = spec.body.ar;

    if (!enBlocks.length && !arBlocks.length) {
      report.warnings.push(`${spec.slug}: no blocks in either locale — skipped`);
      continue;
    }

    if (DRY_RUN) {
      report.pages.push({
        slug: spec.slug,
        blocks: { en: enBlocks.length, ar: arBlocks.length },
        action: 'created',
      });
      continue;
    }

    const [existing] = await db
      .select({ id: content.id })
      .from(content)
      .where(and(eq(content.typeId, pageType.id), eq(content.slug, spec.slug)))
      .limit(1);

    let contentId: string;
    if (existing) {
      contentId = existing.id;
      await db
        .update(content)
        .set({ status: 'published', updatedAt: new Date() })
        .where(eq(content.id, contentId));
    } else {
      const [created] = await db
        .insert(content)
        .values({
          typeId: pageType.id,
          slug: spec.slug,
          authorId,
          status: 'published',
          publishedAt: new Date(),
        })
        .returning({ id: content.id });
      contentId = created!.id;
    }

    for (const locale of ['en', 'ar'] as const) {
      const blocks = locale === 'en' ? enBlocks : arBlocks;
      const title = spec.title[locale] || spec.title.en || spec.slug;

      await db
        .insert(contentI18n)
        .values({
          contentId,
          locale,
          title,
          excerpt: spec.excerpt[locale] || null,
          body: blocks,
          metaTitle: spec.metaTitle?.[locale] || null,
          metaDescription: spec.metaDescription?.[locale] || null,
          noIndex: false,
        })
        .onConflictDoUpdate({
          target: [contentI18n.contentId, contentI18n.locale],
          set: {
            title,
            excerpt: spec.excerpt[locale] || null,
            body: blocks,
            metaTitle: spec.metaTitle?.[locale] || null,
            metaDescription: spec.metaDescription?.[locale] || null,
          },
        });
    }

    report.pages.push({
      slug: spec.slug,
      blocks: { en: enBlocks.length, ar: arBlocks.length },
      action: existing ? 'updated' : 'created',
    });
  }
}

async function writeNavigation(bundle: ResourceBundle) {
  if (DRY_RUN) {
    report.navigation = { header: HEADER_NAV.length, footer: FOOTER_NAV.length };
    return;
  }

  /*
   * Replaced wholesale rather than merged.
   *
   * A menu is an ordered whole; merging by label would leave a stale item
   * behind whenever one is renamed, and the seeder is the source of truth for
   * this menu until someone edits it in the admin. Only the two locations this
   * seeder owns are cleared.
   */
  await db.delete(navigation).where(
    sql`${navigation.location} in ('header', 'footer')`
  );

  for (const [location, items] of [
    ['header', HEADER_NAV],
    ['footer', FOOTER_NAV],
  ] as const) {
    for (const [index, item] of items.entries()) {
      const label = copy(bundle, item.labelKey);
      // `navigation.label` is the reference/fallback name, so a menu item is
      // never label-less in a locale with no translation.
      const reference = label.en || label.ar || item.path || 'Home';

      const [row] = await db
        .insert(navigation)
        .values({
          label: reference,
          /*
           * Stored WITHOUT the locale segment.
           *
           * components/site/navbar.tsx prefixes `/${locale}` to any url that
           * is not absolute — see its `localized()` helper — so storing
           * `/en/who-we-are` here would render `/en/en/who-we-are`. The home
           * item is a bare `/`, which becomes `/en` and `/ar` correctly.
           */
          url: item.path ? `/${item.path}` : '/',
          order: index,
          location,
          isActive: true,
        })
        .returning({ id: navigation.id });

      if (!row) continue;

      for (const locale of ['en', 'ar'] as const) {
        const text = label[locale] || reference;
        await db
          .insert(navigationI18n)
          .values({ navigationId: row.id, locale, label: text })
          .onConflictDoUpdate({
            target: [navigationI18n.navigationId, navigationI18n.locale],
            set: { label: text },
          });
      }
    }
    report.navigation[location] = items.length;
  }
}

async function writeSettings(bundle: ResourceBundle) {
  const values = {
    siteName: either(bundle, 'New_Aeon', 'New Aeon'),
    siteDescription: copy(bundle, 'Index_Metadescription').en || null,
    logo: '/brand/logo-dark.png',
    favicon: '/brand/fav.ico',
    contactEmail: either(bundle, 'contactusEmail', 'info@new-aeon.com'),
    contactPhone: either(bundle, 'contactusPhone', ''),
    socialLinks: {
      facebook: either(bundle, 'SocialFacebook'),
      instagram: either(bundle, 'SocialInstagram'),
      twitter: either(bundle, 'SocialTwitter'),
    },
    gtmId: TRACKING.gtmId,
    metaPixelId: TRACKING.metaPixelId,
    theme: NEW_AEON_THEME,
    themeMode: 'light',
    // The legacy site had no dark variant, and inventing one would be a
    // redesign. Left null so the theme toggle does not render at all.
    themeDark: null,
    /*
     * Commerce stays OFF.
     *
     * new-aeon.com is an agency site with no shop, and the CMS hides every
     * commerce route and nav item behind this flag. Leaving it on would put a
     * Cart link in the header of an agency's website.
     */
    eCommerceEnabled: false,
    countryCode: 'JO',
    /*
     * The demo announcement bar is turned OFF and cleared.
     *
     * A fresh install seeds "Delivery across Jordan · luxury gift wrapping" as
     * sample copy, and it was rendering above the New Aeon navbar — a shipping
     * promise on a digital agency's site. Blanking the text as well as the flag
     * means turning the bar back on later starts from empty rather than
     * resurrecting the sample.
     */
    announcementActive: false,
    announcementAr: null,
    announcementEn: null,
  };

  report.settingsApplied = Object.keys(values);
  if (DRY_RUN) return;

  const [existing] = await db.select({ id: settings.id }).from(settings).limit(1);
  if (existing) {
    await db.update(settings).set(values).where(eq(settings.id, existing.id));
  } else {
    await db.insert(settings).values({ id: 1, ...values });
  }
}

// ─── MAIN ─────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — nothing will be written ===\n' : '=== SEEDING SITE ===\n');

  const bundle = readBundle();
  console.log(`resources: ${Object.keys(bundle).length} keys`);

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);
  if (!admin) report.warnings.push('No admin user; pages will have no author.');

  const media = await mediaLookup();

  console.log('\n1. Settings and theme');
  await writeSettings(bundle);
  console.log(`   ${report.settingsApplied.length} fields`);

  console.log('\n2. Navigation');
  await writeNavigation(bundle);
  console.log(`   header ${report.navigation.header}, footer ${report.navigation.footer}`);

  console.log('\n3. Pages');
  const specs = buildPages(bundle, media);
  await writePages(specs, admin?.id ?? null);
  for (const page of report.pages) {
    console.log(
      `   ${page.slug.padEnd(16)} ${page.action.padEnd(8)} ` +
      `en:${String(page.blocks.en).padStart(2)} ar:${String(page.blocks.ar).padStart(2)}`
    );
  }

  const path = join(OUT, '_site-seed-report.json');
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n─── SUMMARY ───');
  console.log(`pages:          ${report.pages.length}`);
  console.log(`media resolved: ${report.mediaResolved}`);
  console.log(`media missing:  ${report.mediaMissing.length}`);
  console.log(`warnings:       ${report.warnings.length}`);
  for (const warning of report.warnings) console.log(`   - ${warning}`);
  console.log(`\nreport: ${path}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nSEED FAILED:', error);
    process.exit(1);
  });
