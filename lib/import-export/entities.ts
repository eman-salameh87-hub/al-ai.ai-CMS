// lib/import-export/entities.ts
import 'server-only';
import { and, asc, count, eq, inArray, sql, sum } from 'drizzle-orm';
import { db } from '@/lib/db';
import { setProductCategories } from '@/lib/commerce/product-categories';
import {
  brands,
  productImages,
  categories,
  productCategories,
  categoryI18n,
  coupons,
  customers,
  orders,
  productI18n,
  productOptions,
  productReviews,
  productVariants,
  products,
  tagI18n,
  tags,
  content,
  contentI18n,
  contentTypes,
  contentCategories,
  contentTags,
} from '@/lib/db/schema';
import { blocksToHtml, hasUnexportableBlocks } from '@/lib/blocks/to-html';
import { blocksFromHtml } from '@/lib/blocks/from-html';
import { parseFieldDefinitions, validateFieldValues } from '@/lib/content/custom-fields';
import { asContentBlocks } from '@/lib/blocks/content-schema';
import { getSettings } from '@/lib/db/queries';
import { minorUnitExponent } from '@/lib/money';
import { normalisePhone } from '@/lib/commerce/phone';
import { getStoreCountry } from '@/lib/commerce/regions';
import { headersFor, type EntityDef } from './registry';
import { fromMinorUnits, parseBoolean, toMinorUnits, type ImportPlan } from './plan';
import type { Table } from './table';

/**
 * The database half of import/export.
 *
 * Everything here is per-entity and boring on purpose: reading rows out, and
 * applying a plan the caller has already validated. The sorting, validation and
 * dry-run logic live in plan.ts, where they can be tested without a database.
 */

const yesNo = (value: boolean | null) => (value ? 'yes' : 'no');
const currencyExponent = async () => minorUnitExponent((await getSettings())?.currency ?? 'JOD');

/** Rows for the export file, in the entity's own column order. */
export async function exportTable(entity: EntityDef): Promise<Table> {
  const headers = headersFor(entity);
  const dicts = await exportRows(entity);
  return { headers, rows: dicts.map((row) => headers.map((h) => row[h] ?? '')) };
}

async function exportRows(entity: EntityDef): Promise<Record<string, string>[]> {
  switch (entity.id) {
    case 'products': {
      const exponent = await currencyExponent();
      const rows = await db
        .select({
          sku: productVariants.sku,
          slug: products.slug,
          price: productVariants.price,
          compareAt: productVariants.compareAtPrice,
          stock: productVariants.stock,
          active: productVariants.isActive,
          brand: brands.slug,
          // Every category the product is in, primary first, pipe-joined —
          // the same shape the importer reads back. Exporting only one would
          // round-trip as a silent deletion of the rest.
          category: sql<string>`(
            select string_agg(c.slug, '|' order by pc.is_primary desc, c.slug)
            from ${productCategories} pc
            join ${categories} c on c.id = pc.category_id
            where pc.product_id = ${products.id}
          )`,
          productId: products.id,
          variantId: productVariants.id,
        })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .leftJoin(brands, eq(products.brandId, brands.id))
        .orderBy(asc(products.slug), asc(productVariants.sku));

      if (rows.length === 0) return [];

      const productIds = [...new Set(rows.map((r) => r.productId))];

      const images = await db
        .select({ productId: productImages.productId, url: productImages.url })
        .from(productImages)
        .where(inArray(productImages.productId, productIds))
        .orderBy(asc(productImages.sortOrder));

      // First image only: the sheet has one column, and exporting the second
      // into it would round-trip as a reordering nobody asked for.
      const imageOf = new Map<string, string>();
      for (const image of images) {
        if (!imageOf.has(image.productId)) imageOf.set(image.productId, image.url);
      }

      const names = await db
        .select({
          productId: productI18n.productId,
          locale: productI18n.locale,
          name: productI18n.name,
          shortDesc: productI18n.shortDesc,
          description: productI18n.description,
        })
        .from(productI18n)
        .where(inArray(productI18n.productId, productIds));

      const nameOf = new Map<string, string>();
      const shortOf = new Map<string, string>();
      const descOf = new Map<string, string>();
      for (const n of names) {
        const key = `${n.productId}|${n.locale}`;
        nameOf.set(key, n.name);
        if (n.shortDesc) shortOf.set(key, n.shortDesc);
        if (n.description) descOf.set(key, n.description);
      }

      return rows.map((row) => ({
        sku: row.sku,
        slug: row.slug,
        name_en: nameOf.get(`${row.productId}|en`) ?? '',
        name_ar: nameOf.get(`${row.productId}|ar`) ?? '',
        short_desc_en: shortOf.get(`${row.productId}|en`) ?? '',
        short_desc_ar: shortOf.get(`${row.productId}|ar`) ?? '',
        description_en: descOf.get(`${row.productId}|en`) ?? '',
        description_ar: descOf.get(`${row.productId}|ar`) ?? '',
        brand: row.brand ?? '',
        category: row.category ?? '',
        price: fromMinorUnits(row.price, exponent),
        compare_at_price: row.compareAt === null ? '' : fromMinorUnits(row.compareAt, exponent),
        stock: String(row.stock ?? 0),
        // Options are exported blank rather than wrong: a variant can carry
        // several, and collapsing them into one pair would round-trip as a
        // silent data loss.
        option_name: '',
        option_value: '',
        image_url: imageOf.get(row.productId) ?? '',
        active: yesNo(row.active),
      }));
    }

    case 'coupons': {
      const exponent = await currencyExponent();
      const rows = await db.select().from(coupons).orderBy(asc(coupons.code));
      return rows.map((c) => ({
        code: c.code,
        type: c.type,
        // A percent coupon's value is a percentage, not money — converting it
        // through the currency would turn 10% into 0.010.
        value: c.type === 'percent' ? String(c.value) : fromMinorUnits(c.value, exponent),
        min_subtotal: c.minSubtotal ? fromMinorUnits(c.minSubtotal, exponent) : '',
        max_uses: c.usageLimit === null ? '' : String(c.usageLimit),
        expires_at: c.endsAt ? c.endsAt.toISOString().slice(0, 10) : '',
        active: yesNo(c.isActive),
      }));
    }

    case 'categories': {
      const rows = await db
        .select({
          slug: categories.slug,
          parentId: categories.parentId,
          sortOrder: categories.sortOrder,
          active: categories.isActive,
          id: categories.id,
        })
        .from(categories)
        .orderBy(asc(categories.slug));

      const names = await db.select().from(categoryI18n);
      const nameOf = new Map(names.map((n) => [`${n.categoryId}|${n.locale}`, n.name]));
      const slugOf = new Map(rows.map((r) => [r.id, r.slug]));

      return rows.map((row) => ({
        slug: row.slug,
        name_en: nameOf.get(`${row.id}|en`) ?? '',
        name_ar: nameOf.get(`${row.id}|ar`) ?? '',
        parent: row.parentId ? (slugOf.get(row.parentId) ?? '') : '',
        sort_order: String(row.sortOrder ?? 0),
        active: yesNo(row.active),
      }));
    }

    case 'brands': {
      const rows = await db.select().from(brands).orderBy(asc(brands.slug));
      return rows.map((b) => ({
        slug: b.slug,
        name: b.name,
        logo_url: b.logoUrl ?? '',
        sort_order: String(b.sortOrder ?? 0),
        active: yesNo(b.isActive),
      }));
    }

    case 'tags': {
      const rows = await db.select().from(tags).orderBy(asc(tags.slug));
      const names = await db.select().from(tagI18n);
      const nameOf = new Map(names.map((n) => [`${n.tagId}|${n.locale}`, n.name]));
      return rows.map((tag) => ({
        slug: tag.slug,
        name: tag.name,
        name_en: nameOf.get(`${tag.id}|en`) ?? '',
        name_ar: nameOf.get(`${tag.id}|ar`) ?? '',
      }));
    }

    case 'reviews': {
      const rows = await db
        .select({
          sku: productVariants.sku,
          author: productReviews.customerName,
          phone: productReviews.phone,
          rating: productReviews.rating,
          body: productReviews.body,
          status: productReviews.status,
        })
        .from(productReviews)
        .innerJoin(products, eq(productReviews.productId, products.id))
        // A review belongs to a product; the sheet keys on a SKU, so the
        // product's first variant stands for it.
        .innerJoin(productVariants, eq(productVariants.productId, products.id))
        .orderBy(asc(productReviews.createdAt));

      const seen = new Set<string>();
      return rows
        .filter((r) => {
          const key = `${r.phone}|${r.author}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((r) => ({
          product_sku: r.sku,
          author: r.author,
          phone: r.phone,
          rating: String(r.rating),
          body: r.body,
          status: r.status,
        }));
    }

    case 'content': {
      const rows = await db
        .select({
          id: content.id,
          slug: content.slug,
          status: content.status,
          featuredImage: content.featuredImage,
          customFieldValues: content.customFieldValues,
          typeSlug: contentTypes.slug,
        })
        .from(content)
        .innerJoin(contentTypes, eq(contentTypes.id, content.typeId))
        .orderBy(asc(contentTypes.slug), asc(content.slug));

      if (!rows.length) return [];

      const ids = rows.map((row) => row.id);

      // Three flat queries stitched in memory, rather than a join that would
      // multiply each entry by its translations times its categories times its
      // tags and need de-duplicating afterwards.
      const [translations, categoryLinks, tagLinks] = await Promise.all([
        db.select().from(contentI18n).where(inArray(contentI18n.contentId, ids)),
        db
          .select({ contentId: contentCategories.contentId, slug: categories.slug })
          .from(contentCategories)
          .innerJoin(categories, eq(categories.id, contentCategories.categoryId))
          .where(inArray(contentCategories.contentId, ids)),
        db
          .select({ contentId: contentTags.contentId, slug: tags.slug })
          .from(contentTags)
          .innerJoin(tags, eq(tags.id, contentTags.tagId))
          .where(inArray(contentTags.contentId, ids)),
      ]);

      const i18nOf = new Map(translations.map((t) => [`${t.contentId}|${t.locale}`, t]));
      const groupBy = (links: { contentId: string; slug: string }[]) => {
        const map = new Map<string, string[]>();
        for (const link of links) {
          const list = map.get(link.contentId);
          if (list) list.push(link.slug);
          else map.set(link.contentId, [link.slug]);
        }
        return map;
      };
      const categoriesOf = groupBy(categoryLinks);
      const tagsOf = groupBy(tagLinks);

      return rows.map((row) => {
        const en = i18nOf.get(`${row.id}|en`);
        const ar = i18nOf.get(`${row.id}|ar`);

        return {
          type: row.typeSlug,
          slug: row.slug,
          status: row.status ?? 'draft',
          title_en: en?.title ?? '',
          title_ar: ar?.title ?? '',
          excerpt_en: en?.excerpt ?? '',
          excerpt_ar: ar?.excerpt ?? '',
          body_en: blocksToHtml(asContentBlocks(en?.body)),
          body_ar: blocksToHtml(asContentBlocks(ar?.body)),
          featured_image: row.featuredImage ?? '',
          meta_title_en: en?.metaTitle ?? '',
          meta_title_ar: ar?.metaTitle ?? '',
          meta_description_en: en?.metaDescription ?? '',
          meta_description_ar: ar?.metaDescription ?? '',
          categories: (categoriesOf.get(row.id) ?? []).join(', '),
          tags: (tagsOf.get(row.id) ?? []).join(', '),
          custom_fields: row.customFieldValues ? JSON.stringify(row.customFieldValues) : '',
        };
      });
    }

    case 'customers': {
      const exponent = await currencyExponent();
      const rows = await db
        .select({
          name: customers.name,
          phone: customers.phone,
          email: customers.email,
          orderCount: count(orders.id),
          spent: sum(orders.total),
          first: sql<string | null>`min(${orders.createdAt})`,
          last: sql<string | null>`max(${orders.createdAt})`,
        })
        .from(customers)
        .leftJoin(orders, eq(orders.customerId, customers.id))
        .groupBy(customers.id, customers.name, customers.phone, customers.email)
        .orderBy(asc(customers.name));

      return rows.map((c) => ({
        name: c.name,
        phone: c.phone,
        email: c.email ?? '',
        orders: String(c.orderCount ?? 0),
        total_spent: fromMinorUnits(Number(c.spent ?? 0), exponent),
        first_order: c.first ? String(c.first).slice(0, 10) : '',
        last_order: c.last ? String(c.last).slice(0, 10) : '',
      }));
    }

    default:
      return [];
  }
}

/** The natural keys already in the database, so the plan knows create vs update. */
export async function existingKeys(entity: EntityDef): Promise<Set<string>> {
  const rows = await exportRows(entity);
  const keys = new Set<string>();
  if (!entity.naturalKey) return keys;

  for (const row of rows) {
    const parts = entity.naturalKey.split('|').map((k) => (row[k] ?? '').trim().toLowerCase());
    if (parts.every((p) => p !== '')) keys.add(parts.join('|'));
  }
  return keys;
}

export interface ApplyResult {
  created: number;
  updated: number;
  failed: { key: string; message: string }[];
}

/**
 * Applies a plan.
 *
 * Per row rather than one transaction for the file: a 500-row import that
 * fails on row 400 should leave 399 products updated and tell you which one
 * broke, not roll back an afternoon's work. The dry run has already rejected
 * anything malformed, so what fails here is a genuine database conflict.
 */
export async function applyPlan(entity: EntityDef, plan: ImportPlan): Promise<ApplyResult> {
  const result: ApplyResult = { created: 0, updated: 0, failed: [] };
  const rows = [...plan.create, ...plan.update.map((u) => u.values)];

  for (const row of rows) {
    try {
      const created = await upsert(entity, row);
      if (created) result.created++;
      else result.updated++;
    } catch (error) {
      result.failed.push({
        key: entity.naturalKey ? (row[entity.naturalKey.split('|')[0]!] ?? '') : '',
        message: error instanceof Error ? error.message : 'failed',
      });
    }
  }

  return result;
}

/** Returns true when a new record was created. */
async function upsert(entity: EntityDef, row: Record<string, string>): Promise<boolean> {
  switch (entity.id) {
    case 'products':
      return upsertProduct(row);
    case 'coupons':
      return upsertCoupon(row);
    case 'categories':
      return upsertCategory(row);
    case 'brands':
      return upsertBrand(row);
    case 'tags':
      return upsertTag(row);
    case 'reviews':
      return upsertReview(row);
    case 'content':
      return upsertContent(row);
    default:
      throw new Error(`${entity.id} cannot be imported`);
  }
}

async function upsertProduct(row: Record<string, string>): Promise<boolean> {
  const exponent = await currencyExponent();
  const price = toMinorUnits(row.price ?? '', exponent);
  if (price === null) throw new Error('price is not a number');
  const compareAt = row.compare_at_price ? toMinorUnits(row.compare_at_price, exponent) : null;

  const brandId = row.brand ? await lookupId(brands, brands.slug, row.brand) : null;
  /**
   * `category` accepts several slugs separated by | — "perfumes|women|gifts".
   * The first is the primary one.
   *
   * A single slug was why importing the Juman catalogue dropped 50 category
   * assignments: its products belong to up to four at once, and one column
   * holding one value could only keep the first.
   *
   * An unknown slug is an error rather than a silent skip. Skipping it would
   * file the product under nothing and report success.
   */
  const categorySlugs = (row.category ?? '')
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);

  const categoryIds: string[] = [];
  for (const slug of categorySlugs) {
    const found = await lookupId(categories, categories.slug, slug);
    if (!found) throw new Error(`unknown category "${slug}"`);
    categoryIds.push(found);
  }

  const [existingProduct] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, row.slug!))
    .limit(1);

  let productId = existingProduct?.id;
  if (!productId) {
    const [created] = await db
      .insert(products)
      .values({
        slug: row.slug!,
        brandId,
        basePrice: price,
        compareAtPrice: compareAt,
        isActive: parseBoolean(row.active ?? ''),
      })
      .returning({ id: products.id });
    productId = created!.id;
  } else {
    await db
      .update(products)
      .set({
        brandId,
        basePrice: price,
        /**
         * Both of these were written to the VARIANT only, and the storefront
         * reads them from the PRODUCT — listShopProducts and getShopProduct
         * both select products.compareAtPrice and filter products.isActive.
         *
         * So an import reported "53 updated", wrote 53 variant rows, and
         * changed nothing a shopper could see: 51 discounts imported and no
         * strikethrough appeared anywhere. Deactivating a product likewise
         * deactivated its variant and left the product on the shop grid.
         *
         * A blank compare-at clears the discount rather than preserving it.
         * The importer rejects a file missing this column, so blank is a
         * deliberate "no discount", not an absence of information.
         */
        compareAtPrice: compareAt,
        isActive: parseBoolean(row.active ?? ''),
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));
  }

  // Replaces the whole set, so removing a slug from the sheet removes the link.
  // Only when the column carried something: a blank cell on a partial sheet
  // must not silently unfile a product.
  if (categorySlugs.length > 0) await setProductCategories(productId, categoryIds);

  const perLocale = [
    { locale: 'en' as const, name: row.name_en, shortDesc: row.short_desc_en, description: row.description_en },
    { locale: 'ar' as const, name: row.name_ar, shortDesc: row.short_desc_ar, description: row.description_ar },
  ];

  for (const t of perLocale) {
    if (!t.name) continue;

    const [existing] = await db
      .select({ id: productI18n.id })
      .from(productI18n)
      .where(and(eq(productI18n.productId, productId), eq(productI18n.locale, t.locale)))
      .limit(1);

    /**
     * A blank cell leaves the stored value alone rather than erasing it.
     *
     * The opposite of the compare-at rule, and deliberately so: a price is a
     * fact with one current value, while a description someone wrote in the
     * admin should not be wiped by a stock-update sheet that simply has no
     * column for it. `undefined` here means "not mentioned".
     */
    const values = {
      name: t.name,
      shortDesc: t.shortDesc || undefined,
      description: t.description || undefined,
    };

    if (existing) await db.update(productI18n).set(values).where(eq(productI18n.id, existing.id));
    else await db.insert(productI18n).values({ productId, locale: t.locale, ...values });
  }

  if (row.image_url) {
    // One primary image per product, replaced rather than appended: re-running
    // an import would otherwise stack a duplicate on every pass.
    const [existingImage] = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(and(eq(productImages.productId, productId), eq(productImages.sortOrder, 0)))
      .limit(1);

    if (existingImage) {
      await db
        .update(productImages)
        .set({ url: row.image_url, alt: row.name_en || row.name_ar || null })
        .where(eq(productImages.id, existingImage.id));
    } else {
      await db.insert(productImages).values({
        productId,
        url: row.image_url,
        alt: row.name_en || row.name_ar || null,
        sortOrder: 0,
      });
    }
  }

  const [existingVariant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.sku, row.sku!))
    .limit(1);

  const stock = Number(row.stock ?? 0);
  if (existingVariant) {
    await db
      .update(productVariants)
      .set({ price, compareAtPrice: compareAt, stock, isActive: parseBoolean(row.active ?? '') })
      .where(eq(productVariants.id, existingVariant.id));
    return false;
  }

  const [variant] = await db
    .insert(productVariants)
    .values({
      productId,
      sku: row.sku!,
      price,
      compareAtPrice: compareAt,
      stock,
      isActive: parseBoolean(row.active ?? ''),
    })
    .returning({ id: productVariants.id });

  // The option pair is optional; a product with a single variant does not
  // need one, and inventing "Default" would show a pointless picker.
  if (row.option_name && row.option_value && variant) {
    const [option] = await db
      .insert(productOptions)
      .values({ productId, name: row.option_name })
      .onConflictDoNothing()
      .returning({ id: productOptions.id });

    const optionId =
      option?.id ??
      (
        await db
          .select({ id: productOptions.id })
          .from(productOptions)
          .where(and(eq(productOptions.productId, productId), eq(productOptions.name, row.option_name)))
          .limit(1)
      )[0]?.id;

    if (optionId) {
      await db
        .insert(variantOptionValuesTable)
        .values({ variantId: variant.id, optionId, value: row.option_value })
        .onConflictDoNothing();
    }
  }

  return true;
}

// Imported separately so the products branch reads without a long import list
// at the top competing for attention.
import { variantOptionValues as variantOptionValuesTable } from '@/lib/db/schema';

async function upsertCoupon(row: Record<string, string>): Promise<boolean> {
  const exponent = await currencyExponent();
  const type = row.type as 'percent' | 'fixed';
  const raw = row.value ?? '';
  const value = type === 'percent' ? Number(raw) : toMinorUnits(raw, exponent);
  if (value === null || !Number.isFinite(value)) throw new Error('value is not a number');

  const values = {
    code: row.code!.toUpperCase(),
    type,
    value,
    minSubtotal: row.min_subtotal ? (toMinorUnits(row.min_subtotal, exponent) ?? 0) : 0,
    usageLimit: row.max_uses ? Number(row.max_uses) : null,
    endsAt: row.expires_at ? new Date(`${row.expires_at}T23:59:59Z`) : null,
    isActive: parseBoolean(row.active ?? ''),
  };

  const [existing] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.code, values.code))
    .limit(1);

  if (existing) {
    await db.update(coupons).set(values).where(eq(coupons.id, existing.id));
    return false;
  }
  await db.insert(coupons).values(values);
  return true;
}

async function upsertCategory(row: Record<string, string>): Promise<boolean> {
  const parentId = row.parent ? await lookupId(categories, categories.slug, row.parent) : null;
  if (row.parent && !parentId) throw new Error(`parent category "${row.parent}" does not exist`);

  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, row.slug!))
    .limit(1);

  let id = existing?.id;
  const values = {
    slug: row.slug!,
    parentId,
    sortOrder: row.sort_order ? Number(row.sort_order) : 0,
    isActive: parseBoolean(row.active ?? ''),
  };

  if (id) {
    await db.update(categories).set(values).where(eq(categories.id, id));
  } else {
    const [created] = await db.insert(categories).values(values).returning({ id: categories.id });
    id = created!.id;
  }

  for (const [locale, name] of [['en', row.name_en], ['ar', row.name_ar]] as const) {
    if (!name) continue;
    const [existingName] = await db
      .select({ id: categoryI18n.id })
      .from(categoryI18n)
      .where(and(eq(categoryI18n.categoryId, id), eq(categoryI18n.locale, locale)))
      .limit(1);

    if (existingName) await db.update(categoryI18n).set({ name }).where(eq(categoryI18n.id, existingName.id));
    else await db.insert(categoryI18n).values({ categoryId: id, locale, name });
  }

  return !existing;
}

async function upsertBrand(row: Record<string, string>): Promise<boolean> {
  const values = {
    slug: row.slug!,
    name: row.name!,
    logoUrl: row.logo_url || null,
    sortOrder: row.sort_order ? Number(row.sort_order) : 0,
    isActive: parseBoolean(row.active ?? ''),
  };

  const [existing] = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, values.slug)).limit(1);
  if (existing) {
    await db.update(brands).set(values).where(eq(brands.id, existing.id));
    return false;
  }
  await db.insert(brands).values(values);
  return true;
}

async function upsertTag(row: Record<string, string>): Promise<boolean> {
  const [existing] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, row.slug!)).limit(1);

  let id = existing?.id;
  if (id) {
    await db.update(tags).set({ name: row.name! }).where(eq(tags.id, id));
  } else {
    const [created] = await db
      .insert(tags)
      .values({ slug: row.slug!, name: row.name! })
      .returning({ id: tags.id });
    id = created!.id;
  }

  for (const [locale, name] of [['en', row.name_en], ['ar', row.name_ar]] as const) {
    if (!name) continue;
    const [existingName] = await db
      .select({ id: tagI18n.id })
      .from(tagI18n)
      .where(and(eq(tagI18n.tagId, id), eq(tagI18n.locale, locale)))
      .limit(1);

    if (existingName) await db.update(tagI18n).set({ name }).where(eq(tagI18n.id, existingName.id));
    else await db.insert(tagI18n).values({ tagId: id, locale, name });
  }

  return !existing;
}

async function upsertReview(row: Record<string, string>): Promise<boolean> {
  const [variant] = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.sku, row.product_sku!))
    .limit(1);

  if (!variant) throw new Error(`no product with SKU "${row.product_sku}"`);

  // The same normalisation the checkout uses, so a review imported as "+962 7…"
  // belongs to the same person as one left as "07…".
  const phone = normalisePhone(row.phone!, await getStoreCountry());
  const values = {
    productId: variant.productId,
    customerName: row.author!,
    phone,
    rating: Number(row.rating),
    body: row.body || '',
    status: (row.status || 'pending') as 'pending' | 'approved' | 'rejected',
  };

  const [existing] = await db
    .select({ id: productReviews.id })
    .from(productReviews)
    .where(and(eq(productReviews.productId, variant.productId), eq(productReviews.phone, phone)))
    .limit(1);

  if (existing) {
    await db.update(productReviews).set(values).where(eq(productReviews.id, existing.id));
    return false;
  }
  await db.insert(productReviews).values(values);
  return true;
}

/** Slug → id, or null. */
async function lookupId(
  table: typeof brands | typeof categories,
  column: typeof brands.slug | typeof categories.slug,
  slug: string
): Promise<string | null> {
  const [found] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(column, slug.trim()))
    .limit(1);
  return found?.id ?? null;
}

/**
 * Create or update one content entry from a spreadsheet row.
 *
 * Matched on (type, slug), because `content.slug` is indexed rather than
 * unique and two types can legitimately share one. Matching on slug alone
 * would let a row for a client overwrite a page.
 */
async function upsertContent(row: Record<string, string>): Promise<boolean> {
  const typeSlug = (row.type ?? '').trim();
  const slug = (row.slug ?? '').trim();
  if (!typeSlug || !slug) throw new Error('type and slug are both required');

  const [type] = await db
    .select({ id: contentTypes.id, customFields: contentTypes.customFields })
    .from(contentTypes)
    .where(eq(contentTypes.slug, typeSlug))
    .limit(1);

  // Refused, not created. Inventing a content type from a typo in a
  // spreadsheet would give it no route prefix, no field definitions and no
  // screens — a type with rows and nowhere to live, which is exactly the
  // problem `routePrefix` exists to prevent.
  if (!type) throw new Error(`unknown content type "${typeSlug}"`);

  const [existing] = await db
    .select({ id: content.id })
    .from(content)
    .where(and(eq(content.typeId, type.id), eq(content.slug, slug)))
    .limit(1);

  /*
   * Custom fields, through the same validator the API and the importer use.
   *
   * A malformed JSON cell fails the row rather than being ignored: the person
   * meant to set something, and silently dropping it is how a "successful"
   * import turns out to have done nothing.
   */
  let fieldValues: Record<string, unknown> | undefined;
  if (row.custom_fields?.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.custom_fields);
    } catch {
      throw new Error('custom_fields is not valid JSON');
    }
    const definitions = parseFieldDefinitions(type.customFields);
    const checked = validateFieldValues(definitions, parsed);
    if (!checked.ok) {
      throw new Error(
        `custom_fields: ${Object.entries(checked.errors)
          .map(([key, message]) => `${key} — ${message}`)
          .join('; ')}`
      );
    }
    fieldValues = checked.values;
  }

  const status = (row.status ?? '').trim() as 'draft' | 'published' | 'archived' | '';

  let contentId: string;
  let created = false;

  if (existing) {
    contentId = existing.id;
    await db
      .update(content)
      .set({
        // A blank cell means "leave it alone". Coercing it to 'draft' would
        // unpublish every entry in a file where someone cleared the column.
        ...(status ? { status } : {}),
        ...(row.featured_image?.trim() ? { featuredImage: row.featured_image.trim() } : {}),
        ...(fieldValues ? { customFieldValues: fieldValues } : {}),
        updatedAt: new Date(),
      })
      .where(eq(content.id, contentId));
  } else {
    const [inserted] = await db
      .insert(content)
      .values({
        typeId: type.id,
        slug,
        // A new entry with no status named is a DRAFT. An import must not
        // publish something nobody has looked at.
        status: status || 'draft',
        featuredImage: row.featured_image?.trim() || null,
        customFieldValues: fieldValues ?? null,
        publishedAt: status === 'published' ? new Date() : null,
      })
      .returning({ id: content.id });
    contentId = inserted!.id;
    created = true;
  }

  for (const locale of ['en', 'ar'] as const) {
    const title = (row[`title_${locale}`] ?? '').trim();
    const bodyHtml = (row[`body_${locale}`] ?? '').trim();
    const excerpt = (row[`excerpt_${locale}`] ?? '').trim();
    const metaTitle = (row[`meta_title_${locale}`] ?? '').trim();
    const metaDescription = (row[`meta_description_${locale}`] ?? '').trim();

    // Nothing supplied for this locale: leave whatever is there. A file that
    // only fills in English must not blank the Arabic translation.
    if (!title && !bodyHtml && !excerpt && !metaTitle && !metaDescription) continue;

    const [current] = await db
      .select({ title: contentI18n.title, body: contentI18n.body })
      .from(contentI18n)
      .where(and(eq(contentI18n.contentId, contentId), eq(contentI18n.locale, locale)))
      .limit(1);

    /*
     * A body that HTML cannot represent is NOT overwritten.
     *
     * Blocks like a slider or an application form export as a comment, so a
     * round trip would come back as an empty body and destroy the page. The
     * row still updates its title, excerpt and SEO — only the body is held
     * back, and the failure is loud rather than silent.
     */
    let body = current?.body ?? null;
    if (bodyHtml) {
      if (hasUnexportableBlocks(asContentBlocks(current?.body))) {
        throw new Error(
          `${locale} body contains blocks that cannot round-trip through HTML ` +
          '(a slider, form or filter) — edit this entry in the CMS instead'
        );
      }
      body = blocksFromHtml(bodyHtml, {
        // Image sources are taken as written. The spreadsheet author is staff,
        // and the URLs they paste are the ones they mean — unlike the legacy
        // import, where three different broken roots had to be rewritten.
        resolveImageSrc: (src) => src,
      });
    }

    const resolvedTitle = title || current?.title;
    if (!resolvedTitle) {
      // contentI18n.title is NOT NULL, so a new translation must have one.
      throw new Error(`title_${locale} is required to create the ${locale} translation`);
    }

    await db
      .insert(contentI18n)
      .values({
        contentId,
        locale,
        title: resolvedTitle,
        excerpt: excerpt || null,
        body,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
      })
      .onConflictDoUpdate({
        target: [contentI18n.contentId, contentI18n.locale],
        set: {
          title: resolvedTitle,
          ...(excerpt ? { excerpt } : {}),
          ...(bodyHtml ? { body } : {}),
          ...(metaTitle ? { metaTitle } : {}),
          ...(metaDescription ? { metaDescription } : {}),
        },
      });
  }

  await linkTaxonomy(contentId, row.categories, row.tags);
  return created;
}

/**
 * Attach categories and tags by slug.
 *
 * An unknown slug FAILS the row rather than being created. A category invented
 * from a typo would appear in the site's navigation and in every filter, and
 * nobody would know where it came from — the opposite of what a bulk import
 * should be allowed to do quietly.
 *
 * A blank cell leaves existing links alone; an explicit `-` clears them, which
 * is the only way a spreadsheet can express "remove all".
 */
async function linkTaxonomy(
  contentId: string,
  categoryCell: string | undefined,
  tagCell: string | undefined
): Promise<void> {
  await linkOne(contentId, categoryCell, 'category');
  await linkOne(contentId, tagCell, 'tag');
}

/**
 * One axis of taxonomy.
 *
 * Written as two explicit branches rather than a loop over a table/column
 * tuple: drizzle's insert values are typed per table, and threading them
 * through one generic call needed a cast that would have hidden a real mistake
 * — inserting a category id into content_tags type-checks fine when the types
 * are erased.
 */
async function linkOne(
  contentId: string,
  cell: string | undefined,
  kind: 'category' | 'tag'
): Promise<void> {
  const raw = (cell ?? '').trim();
  // Blank leaves existing links alone. A file that does not mention categories
  // must not strip them from every row.
  if (!raw) return;

  // `-` is the only way a spreadsheet can say "remove all".
  const slugs =
    raw === '-'
      ? []
      : raw
          .split(',')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean);

  if (kind === 'category') {
    const ids = slugs.length ? await resolveCategoryIds(slugs) : [];
    await db.delete(contentCategories).where(eq(contentCategories.contentId, contentId));
    if (ids.length) {
      await db
        .insert(contentCategories)
        .values(ids.map((categoryId) => ({ contentId, categoryId })))
        .onConflictDoNothing();
    }
    return;
  }

  const ids = slugs.length ? await resolveTagIds(slugs) : [];
  await db.delete(contentTags).where(eq(contentTags.contentId, contentId));
  if (ids.length) {
    await db
      .insert(contentTags)
      .values(ids.map((tagId) => ({ contentId, tagId })))
      .onConflictDoNothing();
  }
}

/**
 * Slugs to ids, failing on the first unknown one.
 *
 * An unknown slug is NOT created. A category invented from a typo would appear
 * in the site navigation and in every filter control, and nobody would know
 * where it came from — which is not something a bulk import should be able to
 * do quietly.
 */
async function resolveCategoryIds(slugs: string[]): Promise<string[]> {
  const found = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(inArray(categories.slug, slugs));

  const bySlug = new Map(found.map((row) => [row.slug.toLowerCase(), row.id]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length) throw new Error(`unknown category: ${missing.join(', ')}`);
  return slugs.map((slug) => bySlug.get(slug)!);
}

async function resolveTagIds(slugs: string[]): Promise<string[]> {
  const found = await db
    .select({ id: tags.id, slug: tags.slug })
    .from(tags)
    .where(inArray(tags.slug, slugs));

  const bySlug = new Map(found.map((row) => [row.slug.toLowerCase(), row.id]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length) throw new Error(`unknown tag: ${missing.join(', ')}`);
  return slugs.map((slug) => bySlug.get(slug)!);
}
