// lib/import-export/registry.ts
import { z } from 'zod';

/**
 * What each entity puts in a spreadsheet, and how a row comes back.
 *
 * Declarative on purpose. The route, the template, the dry run and the apply
 * step are all generic; an entity contributes columns and two functions. Adding
 * one should never mean touching the pipeline, which is how the other lists in
 * this codebase drifted apart.
 */

export interface ColumnDef {
  /** Spreadsheet header. Also the key in a parsed row. */
  key: string;
  labelEn: string;
  labelAr: string;
  /** Rejected when blank. */
  required?: boolean;
  /** Shown in the template's example row. */
  example?: string;
  /** Longer note for the person filling it in. */
  hintEn?: string;
}

export interface EntityDef {
  id: string;
  labelEn: string;
  labelAr: string;
  /**
   * The column that identifies an existing row. A re-import matches on it and
   * UPDATES; without one, importing the same file twice would duplicate
   * everything.
   *
   * `null` means export-only — orders and customers are records of things that
   * happened, not settings to be edited in Excel and pushed back.
   */
  naturalKey: string | null;
  columns: ColumnDef[];
  /** Row-level shape check. Cross-row rules live in the importer. */
  rowSchema: z.ZodTypeAny;
}

const text = (max = 255) => z.string().trim().max(max);
const optionalText = (max = 255) => text(max).optional().or(z.literal(''));

/** Money arrives as "129.000", "129", or "1,290.50" depending on the locale. */
const decimal = z
  .string()
  .trim()
  .regex(/^-?[\d,]*\.?\d+$/, 'must be a number');

const integer = z.string().trim().regex(/^\d+$/, 'must be a whole number');
const boolean = z
  .string()
  .trim()
  .regex(/^(true|false|yes|no|1|0|نعم|لا)$/i, 'must be yes or no');

export const ENTITIES: readonly EntityDef[] = [
  {
    id: 'products',
    labelEn: 'Products',
    labelAr: 'المنتجات',
    // SKU, not the product id: a shop knows its SKUs and does not know our
    // UUIDs, and a spreadsheet round-trip must survive being retyped.
    naturalKey: 'sku',
    columns: [
      { key: 'sku', labelEn: 'SKU', labelAr: 'رمز المنتج', required: true, example: 'AMBER-OUD-50' },
      { key: 'slug', labelEn: 'Slug', labelAr: 'الرابط', required: true, example: 'amber-oud' },
      { key: 'name_en', labelEn: 'Name (EN)', labelAr: 'الاسم (إنجليزي)', example: 'Amber Oud' },
      { key: 'name_ar', labelEn: 'Name (AR)', labelAr: 'الاسم (عربي)', example: 'عنبر وعود' },
      /**
       * The catalogue's own words. Absent from this template until now, so a
       * 51-product import arrived with no descriptions at all even though the
       * source file carried them — the same silent drop as image_url and
       * compare_at_price before it.
       *
       * Not cosmetic: this text is the Product schema's `description`, which
       * is what a search engine or an answer engine quotes. A product with an
       * empty one is a weaker citation.
       */
      {
        key: 'short_desc_en',
        labelEn: 'Short description (EN)',
        labelAr: 'وصف مختصر (إنجليزي)',
        example: 'A warm amber and oud blend.',
        hintEn: 'One line, shown on the shop card',
      },
      { key: 'short_desc_ar', labelEn: 'Short description (AR)', labelAr: 'وصف مختصر (عربي)', example: 'مزيج دافئ من العنبر والعود.' },
      {
        key: 'description_en',
        labelEn: 'Description (EN)',
        labelAr: 'الوصف (إنجليزي)',
        example: '',
        hintEn: 'The full text on the product page, and what search engines quote',
      },
      { key: 'description_ar', labelEn: 'Description (AR)', labelAr: 'الوصف (عربي)', example: '' },
      { key: 'brand', labelEn: 'Brand', labelAr: 'العلامة', example: 'Aeon Atelier' },
      {
        key: 'category',
        labelEn: 'Categories',
        labelAr: 'التصنيفات',
        example: 'perfumes|women|gifts',
        hintEn: 'One or more slugs separated by | — the first is the primary category',
      },
      {
        key: 'price',
        labelEn: 'Price',
        labelAr: 'السعر',
        required: true,
        example: '129.000',
        hintEn: 'In major units, e.g. 129.000 for 129 JOD',
      },
      { key: 'compare_at_price', labelEn: 'Compare-at price', labelAr: 'السعر قبل الخصم', example: '' },
      { key: 'stock', labelEn: 'Stock', labelAr: 'المخزون', required: true, example: '50' },
      { key: 'option_name', labelEn: 'Option name', labelAr: 'اسم الخيار', example: 'Size' },
      { key: 'option_value', labelEn: 'Option value', labelAr: 'قيمة الخيار', example: '50ml' },
      {
        key: 'image_url',
        labelEn: 'Image URL',
        labelAr: 'رابط الصورة',
        example: '/uploads/2026/08/amber.webp',
        hintEn: 'A path from the media library, or an absolute URL',
      },
      { key: 'active', labelEn: 'Active', labelAr: 'مفعّل', example: 'yes' },
    ],
    rowSchema: z.object({
      sku: text(100),
      slug: text().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes'),
      name_en: optionalText(),
      name_ar: optionalText(),
      short_desc_en: optionalText(500),
      short_desc_ar: optionalText(500),
      description_en: optionalText(20000),
      description_ar: optionalText(20000),
      brand: optionalText(),
      category: optionalText(),
      price: decimal,
      compare_at_price: decimal.optional().or(z.literal('')),
      stock: integer,
      option_name: optionalText(100),
      option_value: optionalText(),
      image_url: optionalText(2048),
      active: boolean.optional().or(z.literal('')),
    }),
  },

  {
    id: 'coupons',
    labelEn: 'Coupons',
    labelAr: 'الكوبونات',
    naturalKey: 'code',
    columns: [
      { key: 'code', labelEn: 'Code', labelAr: 'الرمز', required: true, example: 'WELCOME10' },
      {
        key: 'type',
        labelEn: 'Type',
        labelAr: 'النوع',
        required: true,
        example: 'percent',
        hintEn: 'percent or fixed',
      },
      { key: 'value', labelEn: 'Value', labelAr: 'القيمة', required: true, example: '10' },
      { key: 'min_subtotal', labelEn: 'Minimum subtotal', labelAr: 'أقل مجموع', example: '' },
      { key: 'max_uses', labelEn: 'Maximum uses', labelAr: 'أقصى استخدام', example: '100' },
      { key: 'expires_at', labelEn: 'Expires', labelAr: 'ينتهي في', example: '2026-12-31' },
      { key: 'active', labelEn: 'Active', labelAr: 'مفعّل', example: 'yes' },
    ],
    rowSchema: z.object({
      code: text(50),
      type: z.enum(['percent', 'fixed']),
      value: decimal,
      min_subtotal: decimal.optional().or(z.literal('')),
      max_uses: integer.optional().or(z.literal('')),
      expires_at: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
        .optional()
        .or(z.literal('')),
      active: boolean.optional().or(z.literal('')),
    }),
  },

  {
    id: 'categories',
    labelEn: 'Categories',
    labelAr: 'التصنيفات',
    naturalKey: 'slug',
    columns: [
      { key: 'slug', labelEn: 'Slug', labelAr: 'الرابط', required: true, example: 'fragrance' },
      { key: 'name_en', labelEn: 'Name (EN)', labelAr: 'الاسم (إنجليزي)', example: 'Fragrance' },
      { key: 'name_ar', labelEn: 'Name (AR)', labelAr: 'الاسم (عربي)', example: 'العطور' },
      { key: 'parent', labelEn: 'Parent slug', labelAr: 'التصنيف الأب', example: '' },
      { key: 'sort_order', labelEn: 'Sort order', labelAr: 'الترتيب', example: '1' },
      { key: 'active', labelEn: 'Active', labelAr: 'مفعّل', example: 'yes' },
    ],
    rowSchema: z.object({
      slug: text().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes'),
      name_en: optionalText(),
      name_ar: optionalText(),
      short_desc_en: optionalText(500),
      short_desc_ar: optionalText(500),
      description_en: optionalText(20000),
      description_ar: optionalText(20000),
      parent: optionalText(),
      sort_order: integer.optional().or(z.literal('')),
      active: boolean.optional().or(z.literal('')),
    }),
  },

  {
    id: 'brands',
    labelEn: 'Brands',
    labelAr: 'العلامات',
    naturalKey: 'slug',
    columns: [
      { key: 'slug', labelEn: 'Slug', labelAr: 'الرابط', required: true, example: 'aeon-atelier' },
      { key: 'name', labelEn: 'Name', labelAr: 'الاسم', required: true, example: 'Aeon Atelier' },
      { key: 'logo_url', labelEn: 'Logo URL', labelAr: 'رابط الشعار', example: '' },
      { key: 'sort_order', labelEn: 'Sort order', labelAr: 'الترتيب', example: '1' },
      { key: 'active', labelEn: 'Active', labelAr: 'مفعّل', example: 'yes' },
    ],
    rowSchema: z.object({
      slug: text().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes'),
      name: text(),
      logo_url: optionalText(2048),
      sort_order: integer.optional().or(z.literal('')),
      active: boolean.optional().or(z.literal('')),
    }),
  },

  {
    id: 'tags',
    labelEn: 'Tags',
    labelAr: 'الوسوم',
    naturalKey: 'slug',
    columns: [
      { key: 'slug', labelEn: 'Slug', labelAr: 'الرابط', required: true, example: 'announcements' },
      { key: 'name', labelEn: 'Name', labelAr: 'الاسم', required: true, example: 'Announcements' },
      { key: 'name_en', labelEn: 'Name (EN)', labelAr: 'الاسم (إنجليزي)', example: '' },
      { key: 'name_ar', labelEn: 'Name (AR)', labelAr: 'الاسم (عربي)', example: '' },
    ],
    rowSchema: z.object({
      slug: text().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes'),
      name: text(),
      name_en: optionalText(),
      name_ar: optionalText(),
      short_desc_en: optionalText(500),
      short_desc_ar: optionalText(500),
      description_en: optionalText(20000),
      description_ar: optionalText(20000),
    }),
  },

  {
    id: 'reviews',
    labelEn: 'Product reviews',
    labelAr: 'آراء العملاء',
    // (product, phone) is the pair the table already treats as one person's
    // review, so a re-import updates rather than duplicating.
    naturalKey: 'product_sku|phone',
    columns: [
      { key: 'product_sku', labelEn: 'Product SKU', labelAr: 'رمز المنتج', required: true, example: 'AMBER-OUD-50' },
      { key: 'author', labelEn: 'Author', labelAr: 'الاسم', required: true, example: 'Sara' },
      { key: 'phone', labelEn: 'Phone', labelAr: 'الهاتف', required: true, example: '0791234567' },
      { key: 'rating', labelEn: 'Rating', labelAr: 'التقييم', required: true, example: '5' },
      { key: 'body', labelEn: 'Review', labelAr: 'النص', example: 'Lovely scent.' },
      {
        key: 'status',
        labelEn: 'Status',
        labelAr: 'الحالة',
        example: 'pending',
        hintEn: 'pending, approved or rejected',
      },
    ],
    rowSchema: z.object({
      product_sku: text(100),
      author: text(),
      phone: text(50),
      rating: z.string().trim().regex(/^[1-5]$/, 'must be 1 to 5'),
      body: optionalText(2000),
      status: z.enum(['pending', 'approved', 'rejected']).optional().or(z.literal('')),
    }),
  },

  /**
   * Content — pages, posts, and every custom type's entries.
   *
   * The registry defined seven entities and NONE of them was content, which
   * meant the 96 client case studies, ten services, six advanced services, the
   * achievements and the whole blog had no bulk route in or out. That is the
   * gap this closes.
   *
   * THE KEY IS COMPOUND, AND HAS TO BE.
   * `content.slug` is not unique on its own — it is indexed, not constrained,
   * and two different types can legitimately both have a `stc` entry. Matching
   * on slug alone would have a spreadsheet row for a client silently overwrite
   * a page. `type|slug` is the real identity.
   *
   * BODIES TRAVEL AS HTML.
   * A spreadsheet cell cannot hold a block array, and nobody can edit
   * `[{"type":"rich-text",…}]` in Excel. Bodies export through
   * lib/blocks/to-html.ts and import back through lib/blocks/from-html.ts —
   * the same converter that brought the legacy content in. Blocks with no HTML
   * form (a slider, a filter, a form) export as a comment naming them, and the
   * importer leaves those bodies alone rather than flattening them.
   */
  {
    id: 'content',
    labelEn: 'Content',
    labelAr: 'المحتوى',
    naturalKey: 'type|slug',
    columns: [
      {
        key: 'type',
        labelEn: 'Type',
        labelAr: 'النوع',
        required: true,
        example: 'client',
        hintEn: "The content type's key, e.g. page, post, client, service.",
      },
      { key: 'slug', labelEn: 'Slug', labelAr: 'الرابط', required: true, example: 'stc' },
      {
        key: 'status',
        labelEn: 'Status',
        labelAr: 'الحالة',
        example: 'published',
        hintEn: 'draft, published or archived. Blank leaves an existing entry unchanged.',
      },
      { key: 'title_en', labelEn: 'Title (EN)', labelAr: 'العنوان (إنجليزي)', example: 'STC' },
      { key: 'title_ar', labelEn: 'Title (AR)', labelAr: 'العنوان (عربي)', example: 'إس تي سي' },
      { key: 'excerpt_en', labelEn: 'Excerpt (EN)', labelAr: 'المقدمة (إنجليزي)', example: '' },
      { key: 'excerpt_ar', labelEn: 'Excerpt (AR)', labelAr: 'المقدمة (عربي)', example: '' },
      {
        key: 'body_en',
        labelEn: 'Body (EN)',
        labelAr: 'المحتوى (إنجليزي)',
        example: '<p>Case study text.</p>',
        hintEn: 'HTML. Headings, paragraphs, lists, links, images and tables are converted to blocks.',
      },
      { key: 'body_ar', labelEn: 'Body (AR)', labelAr: 'المحتوى (عربي)', example: '' },
      { key: 'featured_image', labelEn: 'Featured image URL', labelAr: 'رابط الصورة', example: '' },
      { key: 'meta_title_en', labelEn: 'Meta title (EN)', labelAr: 'عنوان SEO (إنجليزي)', example: '' },
      { key: 'meta_title_ar', labelEn: 'Meta title (AR)', labelAr: 'عنوان SEO (عربي)', example: '' },
      { key: 'meta_description_en', labelEn: 'Meta description (EN)', labelAr: 'وصف SEO (إنجليزي)', example: '' },
      { key: 'meta_description_ar', labelEn: 'Meta description (AR)', labelAr: 'وصف SEO (عربي)', example: '' },
      {
        key: 'categories',
        labelEn: 'Category slugs',
        labelAr: 'التصنيفات',
        example: 'telecoms',
        hintEn: 'Comma separated. Unknown slugs are reported, never created silently.',
      },
      {
        key: 'tags',
        labelEn: 'Tag slugs',
        labelAr: 'الوسوم',
        example: 'saudi-arabia',
        hintEn: 'Comma separated. On the client catalogue these are countries.',
      },
      {
        key: 'custom_fields',
        labelEn: 'Custom fields (JSON)',
        labelAr: 'حقول مخصصة (JSON)',
        example: '{"videoLink":"https://youtu.be/x"}',
        hintEn: 'A JSON object. Validated against the type\'s own field definitions.',
      },
    ],
    rowSchema: z.object({
      type: text().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes'),
      slug: text().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes'),
      status: z
        .enum(['draft', 'published', 'archived'])
        .optional()
        .or(z.literal('')),
      title_en: optionalText(),
      title_ar: optionalText(),
      excerpt_en: optionalText(1000),
      excerpt_ar: optionalText(1000),
      // Generous: a case study body is prose, and the legacy corpus tops out
      // around 2.5 KB per locale. 100 KB is room to grow without being a way
      // to post a megabyte into a cell.
      body_en: optionalText(100_000),
      body_ar: optionalText(100_000),
      featured_image: optionalText(2048),
      meta_title_en: optionalText(),
      meta_title_ar: optionalText(),
      meta_description_en: optionalText(500),
      meta_description_ar: optionalText(500),
      categories: optionalText(1000),
      tags: optionalText(1000),
      custom_fields: optionalText(4000),
    }),
  },

  {
    id: 'customers',
    labelEn: 'Customers',
    labelAr: 'العملاء',
    /**
     * Export only.
     *
     * Customers are created by placing an order; the phone number is the merge
     * key that decides whether two orders are one person. Letting a spreadsheet
     * rewrite that would silently split or merge people's order histories, and
     * it is personal data besides.
     */
    naturalKey: null,
    columns: [
      { key: 'name', labelEn: 'Name', labelAr: 'الاسم' },
      { key: 'phone', labelEn: 'Phone', labelAr: 'الهاتف' },
      { key: 'email', labelEn: 'Email', labelAr: 'البريد' },
      { key: 'orders', labelEn: 'Orders', labelAr: 'الطلبات' },
      { key: 'total_spent', labelEn: 'Total spent', labelAr: 'إجمالي الإنفاق' },
      { key: 'first_order', labelEn: 'First order', labelAr: 'أول طلب' },
      { key: 'last_order', labelEn: 'Last order', labelAr: 'آخر طلب' },
    ],
    rowSchema: z.object({}),
  },
] as const;

export const findEntity = (id: string) => ENTITIES.find((e) => e.id === id);

export const isImportable = (entity: EntityDef) => entity.naturalKey !== null;

/** The header row for an entity's file. */
export const headersFor = (entity: EntityDef) => entity.columns.map((c) => c.key);

/**
 * A blank template with one example row.
 *
 * The example is what stops "what goes in this column?" — a header alone
 * leaves the format of a price or a date to guesswork, and guesswork is what
 * the dry run then has to reject.
 */
export function templateFor(entity: EntityDef) {
  return {
    headers: headersFor(entity),
    rows: [entity.columns.map((c) => c.example ?? '')],
  };
}
