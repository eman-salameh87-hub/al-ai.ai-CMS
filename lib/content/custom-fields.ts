// lib/content/custom-fields.ts
//
// The field system `contentTypes.customFields` always implied and never had.
//
// The column existed in the schema and NOTHING read or wrote it — no editor UI,
// no validation, no renderer. Four real requirements needed it, and each one had
// been quietly deferred:
//
//   - a client's country, alongside its category;
//   - an advanced service's video link (as_VideoLink in the legacy schema);
//   - the four extra image slots per entry (we_GifImage, we_InnerImage,
//     we_MobileImage, we_MobileGifImage, we_MobileInnerImage);
//   - a training course's department.
//
// The alternative was forcing each into blocks and taxonomies. That works for
// country — a hierarchy the site genuinely filters on — and is wrong for the
// rest: a video URL is one fact about a service, not a section of its page, and
// an editor should find it in a labelled box rather than have to remember to add
// a video block in the right position.
//
// SHAPE, AND WHY IT IS NARROW
// Six field kinds, no nesting, no repeaters, no conditional logic. A field
// system grows without limit if you let it, and every kind added is one the
// editor, the validator, the renderer and the importer all have to handle. These
// six cover every column the legacy schema actually has. Adding a seventh is a
// deliberate act with four places to touch, which is the correct amount of
// friction.
import { z } from 'zod';

/** Field kinds the editor can define. */
export const FIELD_KINDS = [
  'text',
  'textarea',
  'url',
  'number',
  'boolean',
  'image',
  'select',
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

/**
 * Where a field's value appears on the public page.
 *
 * Declared on the field rather than inferred from its name. The alternative —
 * a renderer that special-cases `innerImage` and `videoLink` — means the
 * meaning of a field lives in a component instead of in its definition, and an
 * editor who adds `bannerImage` gets nothing and no explanation.
 *
 *  - `banner`   a full-width image above the body. At most one is used; a
 *               second is ignored rather than stacked.
 *  - `inline`   a labelled row in a details block under the body. A `url`
 *               pointing at YouTube or Vimeo renders as an embed instead.
 *  - `hidden`   stored and editable, never rendered. This is the right home
 *               for the legacy mobile crops: they are real data an editor may
 *               want, and they are not content.
 */
export const FIELD_DISPLAYS = ['banner', 'inline', 'hidden'] as const;

export type FieldDisplay = (typeof FIELD_DISPLAYS)[number];

/**
 * A field key. Same shape as a slug, because it becomes a JSON object key that
 * templates read by name — `entry.fields.videoLink` has to be writable in code.
 */
export const fieldKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z][a-zA-Z0-9]*$/,
    'Use a camelCase key starting with a letter, e.g. videoLink'
  );

/**
 * One field definition, as stored in `contentTypes.customFields`.
 *
 * `label` is per-locale from the start. The alternative — one label, translated
 * later — is how the legacy schema ended up with 40 *En/*Ar column pairs: the
 * bilingual requirement is not a phase two.
 */
export const fieldDefinitionSchema = z
  .object({
    key: fieldKeySchema,
    kind: z.enum(FIELD_KINDS),
    label: z.object({
      en: z.string().trim().min(1).max(120),
      ar: z.string().trim().min(1).max(120),
    }),
    /** Shown under the input. Optional, per-locale. */
    help: z
      .object({
        en: z.string().trim().max(300).optional(),
        ar: z.string().trim().max(300).optional(),
      })
      .optional(),
    required: z.boolean().default(false),
    /**
     * Defaults to `inline`, which is the safe answer: a field an editor bothered
     * to fill in should be visible somewhere unless they said otherwise.
     */
    display: z.enum(FIELD_DISPLAYS).default('inline'),
    /**
     * Options for `select`. Ignored by every other kind — validated as
     * present-and-non-empty only when the kind needs it, below.
     */
    options: z
      .array(
        z.object({
          value: z.string().trim().min(1).max(64),
          label: z.object({
            en: z.string().trim().min(1).max(120),
            ar: z.string().trim().min(1).max(120),
          }),
        })
      )
      .max(100)
      .optional(),
  })
  .superRefine((field, ctx) => {
    if (field.kind === 'select' && !field.options?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'A dropdown needs at least one option.',
      });
    }
  });

export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

/**
 * The whole definition list for a type.
 *
 * Capped at 24. Not an arbitrary number: past roughly that many, the honest
 * answer is that the type wants splitting, and an uncapped array is a way for
 * one bad paste to make an editor screen unusable.
 */
export const fieldDefinitionsSchema = z
  .array(fieldDefinitionSchema)
  .max(24)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    for (const [index, field] of fields.entries()) {
      if (seen.has(field.key)) {
        // Two fields with one key means the second silently overwrites the
        // first on save. Refused rather than resolved.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'key'],
          message: `Duplicate field key "${field.key}".`,
        });
      }
      seen.add(field.key);
    }
  });

/**
 * Read a type's definitions out of the jsonb column.
 *
 * Never throws. The column is jsonb written by earlier versions of this code
 * and, before this system existed, by nothing at all — so anything in it that
 * does not parse is treated as "no fields" rather than breaking the editor for
 * every entry of that type.
 */
export function parseFieldDefinitions(raw: unknown): FieldDefinition[] {
  if (!raw) return [];
  const parsed = fieldDefinitionsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** The value type each kind stores. */
export type FieldValue = string | number | boolean | null;

/**
 * Validate submitted values against a type's definitions.
 *
 * Returns the CLEANED map, containing only keys the type declares. That
 * filtering is the point: `customFieldValues` is jsonb, so without it an API
 * caller could store arbitrary keys of arbitrary size on a content row, and the
 * column would rot into a junk drawer within a release.
 */
export function validateFieldValues(
  definitions: FieldDefinition[],
  input: unknown
): { ok: true; values: Record<string, FieldValue> } | { ok: false; errors: Record<string, string> } {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const values: Record<string, FieldValue> = {};
  const errors: Record<string, string> = {};

  for (const field of definitions) {
    const supplied = raw[field.key];
    const isBlank =
      supplied === undefined ||
      supplied === null ||
      (typeof supplied === 'string' && supplied.trim() === '');

    if (isBlank) {
      if (field.required && field.kind !== 'boolean') {
        errors[field.key] = `${field.label.en} is required.`;
      }
      // A blank optional field is stored as null, not omitted. An explicit null
      // is how the renderer tells "the editor cleared this" from "the field is
      // new and has never been filled in".
      values[field.key] = field.kind === 'boolean' ? false : null;
      continue;
    }

    switch (field.kind) {
      case 'text':
      case 'textarea': {
        const text = String(supplied).trim();
        const max = field.kind === 'text' ? 500 : 5000;
        if (text.length > max) {
          errors[field.key] = `${field.label.en} is too long (max ${max} characters).`;
          break;
        }
        values[field.key] = text;
        break;
      }

      case 'url': {
        const text = String(supplied).trim();
        // A site-relative path is a legitimate answer — an internal link, or an
        // uploaded file under /uploads. Only absolute URLs are scheme-checked.
        if (text.startsWith('/')) {
          values[field.key] = text;
          break;
        }
        let parsed: URL;
        try {
          parsed = new URL(text);
        } catch {
          errors[field.key] = `${field.label.en} must be a URL or a path starting with "/".`;
          break;
        }
        // http/https only. `javascript:` and `data:` in a field the renderer
        // puts into an href is a stored XSS, and this is the cheapest place to
        // refuse it.
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          errors[field.key] = `${field.label.en} must be an http or https URL.`;
          break;
        }
        values[field.key] = parsed.toString();
        break;
      }

      case 'number': {
        const value = typeof supplied === 'number' ? supplied : Number(String(supplied).trim());
        if (!Number.isFinite(value)) {
          errors[field.key] = `${field.label.en} must be a number.`;
          break;
        }
        values[field.key] = value;
        break;
      }

      case 'boolean':
        // Accepts the string forms an HTML form sends as well as real booleans.
        values[field.key] =
          supplied === true || supplied === 'true' || supplied === 'on' || supplied === 1;
        break;

      case 'image': {
        const text = String(supplied).trim();
        // Stored as a URL, exactly like `content.featuredImage`, so the media
        // picker that already exists can fill it in with no new plumbing.
        if (!text.startsWith('/') && !/^https?:\/\//i.test(text)) {
          errors[field.key] = `${field.label.en} must be an uploaded image path or an http(s) URL.`;
          break;
        }
        values[field.key] = text;
        break;
      }

      case 'select': {
        const text = String(supplied).trim();
        if (!field.options?.some((option) => option.value === text)) {
          errors[field.key] = `${field.label.en} is not one of the allowed options.`;
          break;
        }
        values[field.key] = text;
        break;
      }
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values };
}

/**
 * Read one field off a content row, typed, for use in a template.
 *
 * Deliberately forgiving: a template asking for a field the type no longer
 * declares gets null, not a crash. A field definition being deleted must not
 * take a page down with it.
 */
export function fieldValue(
  values: unknown,
  key: string
): FieldValue {
  if (!values || typeof values !== 'object') return null;
  const value = (values as Record<string, unknown>)[key];
  if (value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

/** The label for a field in a locale, falling back to English. */
export function fieldLabel(field: FieldDefinition, locale: string): string {
  return locale === 'ar' ? field.label.ar || field.label.en : field.label.en;
}

/**
 * The fields to render, split by where they go.
 *
 * Blank values are dropped here rather than in the component, so a renderer
 * never has to decide whether `null` means "empty" or "not applicable" — it
 * only ever receives fields that have something to show.
 */
export function displayableFields(
  definitions: FieldDefinition[],
  values: unknown
): { banner: FieldDefinition | null; inline: { field: FieldDefinition; value: FieldValue }[] } {
  let banner: FieldDefinition | null = null;
  const inline: { field: FieldDefinition; value: FieldValue }[] = [];

  for (const field of definitions) {
    if (field.display === 'hidden') continue;

    const value = fieldValue(values, field.key);
    // A false boolean is a real answer, but not one worth a row of its own on
    // a public page — "Featured: No" tells a visitor nothing.
    if (value === null || value === '' || value === false) continue;

    if (field.display === 'banner') {
      // First one wins. Two banners stacked above a body is a layout accident,
      // not a design, so the second is ignored.
      if (!banner) banner = field;
      continue;
    }
    inline.push({ field, value });
  }

  return { banner, inline };
}

/** A `url` value that a video block can embed, or null. */
export function embeddableVideo(value: FieldValue): string | null {
  if (typeof value !== 'string') return null;
  return /(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(value) ? value : null;
}
