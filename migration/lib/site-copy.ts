// migration/lib/site-copy.ts
//
// The legacy site's own words, mapped from GlobalResources.resx keys to the
// place each one belongs on the new site.
//
// WHY THIS FILE EXISTS SEPARATELY
// migration/extract-resources.py pulls all 267 resource keys out of the two
// .resx files without deciding anything. This is where the deciding happens,
// and it is a data file so the decisions can be read in one place and argued
// with — rather than being buried in a seed script as a series of lookups.
//
// The migration assessment marks GlobalResources.resx PARTIAL, and this is the
// honest version of that: keys naming PAGE COPY become CMS content the client
// can edit, keys naming INTERFACE CHROME become messages/*.json, and the rest
// are dropped with a reason. The regression is real but narrow — an
// administrator could previously edit interface strings live, and now cannot.

/** One bilingual string, as it comes out of the two .resx files. */
export interface Bilingual {
  en: string;
  ar: string;
}

export type ResourceBundle = Record<
  string,
  { kind: string; en: string; ar: string; missing: string[] }
>;

/** Read a key from the extracted bundle, or empty strings. */
export function copy(bundle: ResourceBundle, key: string): Bilingual {
  const entry = bundle[key];
  return { en: entry?.en?.trim() ?? '', ar: entry?.ar?.trim() ?? '' };
}

/**
 * Prefer English, fall back to Arabic, then to a supplied default.
 *
 * Used for values that are not per-locale at all — a phone number, a social
 * URL. The legacy files duplicate those across both bundles, and occasionally
 * only one of the two is filled in.
 */
export function either(bundle: ResourceBundle, key: string, fallback = ''): string {
  const value = copy(bundle, key);
  return value.en || value.ar || fallback;
}

/**
 * The three home page slides.
 *
 * Each legacy slide had four image slots — desktop and mobile, per locale —
 * plus, on slides two and three, a separate foreground graphic composited over
 * the background. The new `slider` block has one image per slide.
 *
 * The DESKTOP image is taken and the mobile crop is dropped, and that is a
 * deliberate loss rather than an oversight: `next/image` serves a responsive
 * srcset from one source, so a phone gets a correctly sized file without a
 * second asset. What is genuinely lost is art direction — a crop composed for
 * a narrow screen — which is worth flagging to the client and not worth
 * inventing a second image field for.
 *
 * The foreground graphics (`…Var…`) are dropped: they were absolutely
 * positioned over the background by hand-written CSS per slide, and there is no
 * honest way to express that in a slider block.
 */
export const HOME_SLIDES = [
  {
    imageKey: { en: 'FirstSliderImagePostedImageDecEN', ar: 'FirstSliderImagePostedImageDecEN' },
    /** The legacy slide 1 button linked to Who We Are. */
    buttonTextKey: 'Index_Slider1ActionButton',
    href: 'who-we-are',
    textKey: 'index_FirstSliderText',
  },
  {
    imageKey: { en: 'SecondSliderImagePostedImageDec', ar: 'SecondSliderImagePostedImageDec' },
    buttonTextKey: 'Index_Discover',
    href: 'what-we-do',
    textKey: 'IndexSlider2text',
  },
  {
    imageKey: { en: 'ThirdSliderImagePostedImageDecEN', ar: 'ThirdSliderImagePostedImageDecEN' },
    buttonTextKey: 'Index_Discover',
    href: 'advanced-services',
    textKey: 'IndexSlider3text',
  },
] as const;

/**
 * The seven offices on the Who We Are page.
 *
 * `descriptionKey` points at a resource whose value is the literal word
 * "Description" in English and "الوصف" in Arabic for all seven — the legacy CMS
 * shipped with the placeholder text never filled in. The seeder therefore omits
 * the description rather than publishing "Description" seven times, and the
 * client can write them in the block editor.
 */
export const OFFICES = [
  { titleKey: 'whoweareAmmanTitel', descriptionKey: 'whoweareAmmanDescription', imageKey: 'WhoWeAmmanPostedImageDesc' },
  { titleKey: 'whoweareRiyadhTitle', descriptionKey: 'whoweareRiyadhDescription', imageKey: 'WhoWeRiyadhPostedImageDesc' },
  { titleKey: 'whoweareDubaiTitle', descriptionKey: 'whoweareDubaiDescription', imageKey: 'WhoWeDubaiPostedImageDesc' },
  { titleKey: 'whoweareKuwaitTitle', descriptionKey: 'whoweareKuwaitDescription', imageKey: 'WhoWeKuwaitPostedImageDesc' },
  { titleKey: 'whoweareDohaTitel', descriptionKey: 'whoweareDohaDescription', imageKey: 'WhoWeDohaPostedImageDesc' },
  { titleKey: 'whoweareIstanbulTitle', descriptionKey: 'whoweareIstanbulDescription', imageKey: 'WhoWeIstanbulPostedImageDesc' },
  { titleKey: 'whoweareArizonaTitel', descriptionKey: 'whoweareArezonaDescription', imageKey: 'WhoWeArizonaPostedImageDec' },
] as const;

/**
 * The main menu, in the legacy side-drawer's order.
 *
 * Labels come from the `MasterLinkName*` resources, so the menu reads exactly
 * as it does today in both languages. `url` is the NEW address in every case —
 * these are the destinations the redirect rule sends the old URLs to.
 */
export const HEADER_NAV = [
  { labelKey: 'MasterLinkNameHome', path: '' },
  { labelKey: 'MasterLinkNameHowWeAre', path: 'who-we-are' },
  { labelKey: 'MasterLinkNameWhatWeDo', path: 'what-we-do' },
  { labelKey: 'MasterLinkNameAdvancedServices', path: 'advanced-services' },
  { labelKey: 'MasterLinkNameAchievement', path: 'achievements' },
  { labelKey: 'MasterLinkNameProtfolio', path: 'portfolio' },
  { labelKey: 'MasterLinkNameCareer', path: 'careers' },
  { labelKey: 'TraningPage', path: 'training' },
  { labelKey: 'MasterLinkNameContactUs', path: 'contact' },
] as const;

export const FOOTER_NAV = [
  { labelKey: 'MasterLinkNamePrivacy', path: 'privacy-policy' },
  { labelKey: 'MasterLinkNameContactUs', path: 'contact' },
  { labelKey: 'MasterLinkNameCareer', path: 'careers' },
] as const;

/**
 * The New Aeon palette, read off the legacy stylesheet.
 *
 * MyLayout/layout/css/style.css, by frequency: #6a2a80 / #6b2b7f is the brand
 * purple (`.main-color`, `.bg-main`), #eb3149 the red accent used on numbers
 * and buttons (`.slider-num`, `.btn-more`), and #ffc419 / #fcc51d the yellow
 * on call-to-action buttons (`.bg-yellow`).
 *
 * Mapped onto the CMS's ROLE-named slots rather than added as new colours —
 * "accent" survives a rebrand, "purple" does not. Purple takes `accent`
 * because it is the brand mark; the yellow becomes the CTA treatment through
 * `accent` on buttons in the legacy design, so it is kept as the announcement
 * and highlight colour via `warning`, which is where the theme already uses a
 * saturated yellow.
 */
export const NEW_AEON_THEME = {
  accent: '#6a2a80',
  'accent-hover': '#84417c',
  // White on purple. #130c0e — the CMS default — fails contrast on this hue.
  'accent-ink': '#ffffff',

  surface: '#ffffff',
  'surface-raised': '#f7f5f8',
  // The legacy `.bg-main` sections: purple, not near-black.
  'surface-inverted': '#4b266b',
  line: '#e4dfe7',

  ink: '#1c1420',
  'ink-muted': '#6b6270',
  'ink-inverted': '#ffffff',

  success: '#15803d',
  // The legacy yellow, in the slot that already holds a saturated warning hue.
  warning: '#c8890a',
  // The legacy red accent.
  danger: '#eb3149',

  price: '#1c1420',
  'price-sale': '#eb3149',
  'in-stock': '#15803d',
  'out-of-stock': '#eb3149',

  radius: '8px',
} as const;

/**
 * Tracking ids lifted from the legacy _MasterLayout.cshtml.
 *
 * Carried over rather than left blank so historical reporting is continuous —
 * a new property id would restart every metric on launch day. They are settings
 * the client can change, not code.
 */
export const TRACKING = {
  gtmId: 'GTM-KXKHG3X',
  metaPixelId: '4573635502731004',
} as const;

/**
 * Resource keys deliberately not carried over, with the reason.
 *
 * Written into the migration report, so the losses are stated rather than
 * discovered.
 */
export const DROPPED_RESOURCES: { pattern: string; reason: string }[] = [
  {
    pattern: '*_Metakeywords / *MetaKeywordsAr',
    reason: 'meta keywords have carried no ranking signal since 2009; the new schema has no field',
  },
  {
    pattern: '*PostedImageMob* / *PostedImageVar*',
    reason:
      'mobile crops and composited foreground graphics — next/image serves a responsive srcset ' +
      'from one source, and the foreground layers were positioned by per-slide hand-written CSS',
  },
  {
    pattern: 'whoweare*Description (all seven offices)',
    reason:
      'the legacy value is the literal placeholder "Description" in both locales — never filled ' +
      'in, so there is nothing to migrate',
  },
  {
    pattern: 'indexOurClient1-5, index*ServiceImg',
    reason:
      'hardcoded /MyLayout paths to sample logos and numbered service icons; the real client ' +
      'logos come from the imported Clients catalogue instead',
  },
  {
    pattern: 'Index_Slider1href / Index_Slider2href',
    reason: 'both point at http://dev.new-aeon.com, a staging host that no longer resolves',
  },
];
