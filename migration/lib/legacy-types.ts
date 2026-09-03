// migration/lib/legacy-types.ts
//
// The four legacy catalogues, described as content types on the new CMS.
//
// This file is the migration's central decision: which legacy column becomes
// which new thing. It is data rather than code so the mapping can be read and
// argued with in one place, instead of being spread through an import script.
//
// ROUTE PREFIXES MUST MATCH THE REDIRECT RULE
// Each `routePrefix` below is the exact destination segment that
// lib/redirects/legacy-map.ts produces for that section. If the two ever
// disagree, every one of that section's legacy URLs 308s to a 404 — which is
// the single worst outcome of this migration. tests/migration/mapping.test.ts
// asserts the agreement.
import type { FieldDefinition, FieldDisplay } from '@/lib/content/custom-fields';

export interface LegacyColumnMap {
  /** Primary key column, used for stable logging and ordering. */
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  bodyEn: string;
  bodyAr: string;
  metaTitleEn: string;
  metaTitleAr: string;
  metaDescriptionEn: string;
  metaDescriptionAr: string;
  featuredImage: string;
  /** Manual ordering column. See `order` handling in the importer. */
  order?: string;
}

export interface LegacyTypeSpec {
  /** The dumped JSON file, and the table it came from. */
  table: string;
  /** `content_types.slug` — the type's key. */
  slug: string;
  /** `content_types.routePrefix` — the URL segment. */
  routePrefix: string;
  name: { en: string; ar: string };
  description: string;
  hasCategories: boolean;
  hasTags: boolean;
  columns: LegacyColumnMap;
  /**
   * Extra legacy columns that become custom fields.
   *
   * Each entry names the field AND the column it is filled from, so the
   * definition and the import cannot drift apart.
   */
  fields: (FieldDefinition & { from: string })[];
}

/**
 * The extra image slots, as custom fields.
 *
 * The migration assessment lists these as a BUILD item: "no second image slot
 * exists". They are `image` fields rather than body blocks because they are not
 * content — they are art direction. `we_GifImage` is the animated state a
 * service card shows on hover, and `we_MobileImage` is the same picture cropped
 * for a phone. Neither belongs in the reading order of the page, which is what
 * a block is.
 */
function imageSlot(
  key: string,
  from: string,
  en: string,
  ar: string,
  /**
   * Where it renders. Defaults to `hidden`, which is right for most of these.
   *
   * The mobile crops and hover animations are real data an editor may want to
   * change, and they are NOT sections of the page — a detail page that stacked
   * five variants of the same picture would be nonsense. Only the inner/detail
   * image is content, and it is passed `banner` explicitly.
   */
  display: FieldDisplay = 'hidden',
  help?: { en: string; ar: string }
): FieldDefinition & { from: string } {
  return {
    key,
    from,
    kind: 'image',
    label: { en, ar },
    required: false,
    display,
    ...(help ? { help } : {}),
  };
}

export const LEGACY_TYPES: LegacyTypeSpec[] = [
  {
    table: 'WhatWeDo',
    slug: 'service',
    routePrefix: 'what-we-do',
    name: { en: 'Service', ar: 'خدمة' },
    description: 'The core service catalogue — legacy /WhatWeDo.',
    hasCategories: false,
    hasTags: false,
    columns: {
      id: 'we_Id',
      slug: 'we_UrlName',
      titleEn: 'we_NameEn',
      titleAr: 'we_NameAr',
      excerptEn: 'we_ShortDescEn',
      excerptAr: 'we_ShortDescAr',
      bodyEn: 'we_DescEn',
      bodyAr: 'we_DescAr',
      metaTitleEn: 'we_MetaTitle',
      metaTitleAr: 'we_MetaTitleAr',
      metaDescriptionEn: 'we_MetaDescription',
      metaDescriptionAr: 'we_MetaDescriptionAr',
      featuredImage: 'we_Image',
      order: 'we_Order',
    },
    fields: [
      imageSlot('hoverImage', 'we_GifImage', 'Hover animation', 'صورة متحركة عند المرور', 'hidden', {
        en: 'Shown when a visitor hovers the card on the home page.',
        ar: 'تظهر عند تمرير المؤشر على البطاقة في الصفحة الرئيسية.',
      }),
      imageSlot('innerImage', 'we_InnerImage', 'Inner page image', 'صورة الصفحة الداخلية', 'banner'),
      imageSlot('mobileImage', 'we_MobileImage', 'Mobile image', 'صورة الجوال'),
      imageSlot('mobileHoverImage', 'we_MobileGifImage', 'Mobile animation', 'صورة متحركة للجوال'),
      imageSlot('mobileInnerImage', 'we_MobileInnerImage', 'Mobile inner image', 'صورة داخلية للجوال'),
    ],
  },
  {
    table: 'AdvancedServicesList',
    slug: 'advanced-service',
    routePrefix: 'advanced-services',
    name: { en: 'Advanced service', ar: 'خدمة متقدمة' },
    description: 'The advanced/AI service catalogue — legacy /AdvancedService.',
    hasCategories: false,
    hasTags: false,
    columns: {
      id: 'as_Id',
      slug: 'as_UrlName',
      titleEn: 'as_NameEn',
      titleAr: 'as_NameAr',
      excerptEn: 'as_ShortDescEn',
      excerptAr: 'as_ShortDescAr',
      bodyEn: 'as_DescEn',
      bodyAr: 'as_DescAr',
      metaTitleEn: 'as_MetaTitle',
      metaTitleAr: 'as_MetaTitleAr',
      metaDescriptionEn: 'as_MetaDescription',
      metaDescriptionAr: 'as_MetaDescriptionAr',
      featuredImage: 'as_Image',
      order: 'as_Order',
    },
    fields: [
      {
        key: 'videoLink',
        from: 'as_VideoLink',
        kind: 'url',
        /*
         * The legacy page's own words — GlobalResources
         * `AdvancedServicesSelected_Watch`, in both locales.
         *
         * This label is what a VISITOR reads above the embed, not just what
         * the editor sees in the admin, so "Video link" would be the CMS
         * describing its own field on a public page.
         */
        label: { en: 'Watch the video', ar: 'شاهد الان' },
        required: false,
        // The legacy page had a "Watch the video" call to action, so this is
        // content and renders as an embed under the body.
        display: 'inline',
        help: {
          en: 'YouTube or Vimeo URL shown on the service page.',
          ar: 'رابط يوتيوب أو فيميو يظهر في صفحة الخدمة.',
        },
      },
      imageSlot('hoverImage', 'we_GifImage', 'Hover animation', 'صورة متحركة عند المرور'),
      imageSlot('innerImage', 'we_InnerImage', 'Inner page image', 'صورة الصفحة الداخلية', 'banner'),
      imageSlot('mobileImage', 'as_MobailImage', 'Mobile image', 'صورة الجوال'),
      imageSlot('mobileHoverImage', 'we_MobailGifImage', 'Mobile animation', 'صورة متحركة للجوال'),
      imageSlot('mobileInnerImage', 'we_MobailInnerImage', 'Mobile inner image', 'صورة داخلية للجوال'),
      imageSlot('sliderImage', 'as_SliderImage', 'Slider image', 'صورة السلايدر'),
    ],
  },
  {
    table: 'Clients',
    slug: 'client',
    routePrefix: 'clients',
    name: { en: 'Client case study', ar: 'دراسة حالة عميل' },
    description: 'Client work — legacy /ClientSelected. 96 entries.',
    /**
     * Both, and this is the point of the Portfolio page: clients filter by
     * category AND country together. Category is the hierarchy; country
     * becomes tags, because the CMS has exactly one hierarchical tree and
     * industry has the better claim on it.
     */
    hasCategories: true,
    hasTags: true,
    columns: {
      id: 'clnt_Id',
      slug: 'clnt_UrlName',
      titleEn: 'clnt_NameEn',
      titleAr: 'clnt_NameAr',
      excerptEn: 'clnt_ShortDescEn',
      excerptAr: 'clnt_ShortDescAr',
      bodyEn: 'clnt_DescEn',
      bodyAr: 'clnt_DescAr',
      metaTitleEn: 'clnt_MetaTitle',
      metaTitleAr: 'clnt_MetaTitleAr',
      metaDescriptionEn: 'clnt_MetaDescription',
      metaDescriptionAr: 'clnt_MetaDescriptionAr',
      featuredImage: 'clnt_Image',
      order: 'clnt_Order',
    },
    fields: [
      imageSlot('mobileImage', 'clnt_MobailImage', 'Mobile logo', 'شعار الجوال'),
    ],
  },
  {
    table: 'Achivements',
    slug: 'achievement',
    // The legacy table name is misspelled ("Achivements") and the legacy URL is
    // not ("/Achievement"). The new slug and prefix both use the correct
    // spelling; the misspelling is confined to the `table` field above, which
    // is the only place it is a fact rather than a choice.
    routePrefix: 'achievements',
    name: { en: 'Achievement', ar: 'إنجاز' },
    description: 'Awards and milestones — legacy /Achievement.',
    hasCategories: false,
    hasTags: false,
    columns: {
      id: 'Ach_Id',
      slug: 'Ach_UrlName',
      titleEn: 'Ach_NameEn',
      titleAr: 'Ach_NameAr',
      excerptEn: 'Ach_ShortDescEn',
      excerptAr: 'Ach_ShortDescAr',
      bodyEn: 'Ach_DescEn',
      bodyAr: 'Ach_DescAr',
      metaTitleEn: 'Ach_MetaTitle',
      metaTitleAr: 'Ach_MetaTitleAr',
      metaDescriptionEn: 'Ach_MetaDescription',
      metaDescriptionAr: 'Ach_MetaDescriptionAr',
      featuredImage: 'Ach_Image',
      order: 'Ach_Order',
    },
    fields: [
      imageSlot('detailImage', 'Ach_ImageDetails', 'Detail image', 'صورة التفاصيل', 'banner'),
      imageSlot('mobileImage', 'Ach_MobailImage', 'Mobile image', 'صورة الجوال'),
      imageSlot('mobileDetailImage', 'Ach_MobailImageDetails', 'Mobile detail image', 'صورة تفاصيل الجوال'),
    ],
  },
];

/**
 * Columns deliberately NOT imported, and why. Referenced by the report so the
 * losses are stated rather than discovered later.
 */
export const DROPPED_COLUMNS: { column: string; reason: string }[] = [
  {
    column: '*_MetaKeywords / *_MetaKeywordsAr',
    reason:
      'meta keywords have carried no ranking signal since 2009, and the new schema has no field for them',
  },
  {
    column: '*_Order',
    reason:
      'types and categories have sortOrder; individual entries do not. Imported into the entry ' +
      'ordering where it can be honoured, otherwise dropped — an archive cannot be hand-ordered',
  },
];
