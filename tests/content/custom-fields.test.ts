// tests/content/custom-fields.test.ts
import { describe, it, expect } from 'vitest';
import {
  fieldDefinitionsSchema,
  parseFieldDefinitions,
  validateFieldValues,
  fieldValue,
  fieldLabel,
  type FieldDefinition,
} from '@/lib/content/custom-fields';

/** The four fields the migration actually needs, as a fixture. */
const DEFINITIONS: FieldDefinition[] = [
  {
    key: 'country',
    kind: 'select',
    label: { en: 'Country', ar: 'الدولة' },
    required: false,
    display: 'inline',
    options: [
      { value: 'sa', label: { en: 'Saudi Arabia', ar: 'السعودية' } },
      { value: 'ae', label: { en: 'UAE', ar: 'الإمارات' } },
    ],
  },
  { key: 'videoLink', kind: 'url', label: { en: 'Video link', ar: 'رابط الفيديو' }, required: false, display: 'inline' },
  { key: 'innerImage', kind: 'image', label: { en: 'Inner image', ar: 'صورة داخلية' }, required: false, display: 'banner' },
  { key: 'sortWeight', kind: 'number', label: { en: 'Sort weight', ar: 'الترتيب' }, required: false, display: 'inline' },
];

describe('fieldDefinitionsSchema', () => {
  it('accepts the definitions the migration needs', () => {
    expect(fieldDefinitionsSchema.safeParse(DEFINITIONS).success).toBe(true);
  });

  it('requires a camelCase key', () => {
    const bad = [{ ...DEFINITIONS[1]!, key: 'Video-Link' }];
    expect(fieldDefinitionsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a duplicate key', () => {
    // Two fields with one key means the second silently overwrites the first.
    const dupe = [DEFINITIONS[1]!, { ...DEFINITIONS[1]! }];
    const result = fieldDefinitionsSchema.safeParse(dupe);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Duplicate field key');
    }
  });

  it('rejects a dropdown with no options', () => {
    const bad = [{ ...DEFINITIONS[0]!, options: [] }];
    expect(fieldDefinitionsSchema.safeParse(bad).success).toBe(false);
  });

  it('requires both locales on a label', () => {
    const bad = [{ key: 'x', kind: 'text', label: { en: 'X' }, required: false }];
    expect(fieldDefinitionsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('parseFieldDefinitions', () => {
  it('treats unusable column content as no fields rather than throwing', () => {
    // The column is jsonb that predates this system. A parse failure must not
    // break the editor for every entry of the type.
    expect(parseFieldDefinitions(null)).toEqual([]);
    expect(parseFieldDefinitions('nonsense')).toEqual([]);
    expect(parseFieldDefinitions([{ key: 'Bad-Key', kind: 'text' }])).toEqual([]);
  });

  it('returns valid definitions unchanged', () => {
    expect(parseFieldDefinitions(DEFINITIONS)).toHaveLength(4);
  });
});

describe('validateFieldValues', () => {
  it('keeps only the keys the type declares', () => {
    // THE reason this function returns a cleaned map: without it, jsonb is
    // free storage for any API caller.
    const result = validateFieldValues(DEFINITIONS, {
      country: 'sa',
      somethingElse: 'should not survive',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.values).sort()).toEqual([
        'country', 'innerImage', 'sortWeight', 'videoLink',
      ]);
      expect(result.values).not.toHaveProperty('somethingElse');
    }
  });

  it('stores a blank optional field as explicit null', () => {
    const result = validateFieldValues(DEFINITIONS, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.videoLink).toBeNull();
  });

  it('reports a missing required field', () => {
    const required: FieldDefinition[] = [
      { key: 'dept', kind: 'text', label: { en: 'Department', ar: 'القسم' }, required: true, display: 'inline' },
    ];
    const result = validateFieldValues(required, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.dept).toContain('required');
  });

  describe('url', () => {
    it('accepts an absolute http(s) URL', () => {
      const result = validateFieldValues(DEFINITIONS, { videoLink: 'https://youtu.be/abc' });
      expect(result.ok && result.values.videoLink).toBe('https://youtu.be/abc');
    });

    it('accepts a site-relative path', () => {
      const result = validateFieldValues(DEFINITIONS, { videoLink: '/uploads/clip.mp4' });
      expect(result.ok && result.values.videoLink).toBe('/uploads/clip.mp4');
    });

    it('refuses a javascript: URL', () => {
      // This value ends up in an href. Refusing it here is refusing a stored XSS.
      const result = validateFieldValues(DEFINITIONS, {
        videoLink: 'javascript:alert(document.cookie)',
      });
      expect(result.ok).toBe(false);
    });

    it('refuses a data: URL', () => {
      const result = validateFieldValues(DEFINITIONS, {
        videoLink: 'data:text/html,<script>alert(1)</script>',
      });
      expect(result.ok).toBe(false);
    });

    it('refuses something that is not a URL at all', () => {
      expect(validateFieldValues(DEFINITIONS, { videoLink: 'not a url' }).ok).toBe(false);
    });
  });

  describe('select', () => {
    it('accepts a declared option', () => {
      expect(validateFieldValues(DEFINITIONS, { country: 'ae' }).ok).toBe(true);
    });

    it('refuses a value that is not an option', () => {
      const result = validateFieldValues(DEFINITIONS, { country: 'zz' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.country).toContain('allowed options');
    });
  });

  describe('image', () => {
    it('accepts an upload path', () => {
      expect(validateFieldValues(DEFINITIONS, { innerImage: '/uploads/a.jpg' }).ok).toBe(true);
    });

    it('refuses a bare filename, which would resolve nowhere', () => {
      expect(validateFieldValues(DEFINITIONS, { innerImage: 'a.jpg' }).ok).toBe(false);
    });
  });

  describe('number', () => {
    it('coerces a numeric string, as a form sends one', () => {
      const result = validateFieldValues(DEFINITIONS, { sortWeight: '42' });
      expect(result.ok && result.values.sortWeight).toBe(42);
    });

    it('refuses a non-number', () => {
      expect(validateFieldValues(DEFINITIONS, { sortWeight: 'many' }).ok).toBe(false);
    });
  });

  describe('boolean', () => {
    const flag: FieldDefinition[] = [
      { key: 'featured', kind: 'boolean', label: { en: 'Featured', ar: 'مميز' }, required: false, display: 'inline' },
    ];

    it('accepts the string forms an HTML checkbox sends', () => {
      for (const sent of [true, 'true', 'on', 1]) {
        const result = validateFieldValues(flag, { featured: sent });
        expect(result.ok && result.values.featured).toBe(true);
      }
    });

    it('is false rather than null when absent', () => {
      const result = validateFieldValues(flag, {});
      expect(result.ok && result.values.featured).toBe(false);
    });

    it('is not made required-able, because a false checkbox is a real answer', () => {
      const result = validateFieldValues(
        [{ ...flag[0]!, required: true }],
        {}
      );
      expect(result.ok).toBe(true);
    });
  });

  it('caps the length of a text field', () => {
    const result = validateFieldValues(
      [{ key: 'note', kind: 'text', label: { en: 'Note', ar: 'ملاحظة' }, required: false, display: 'inline' }],
      { note: 'x'.repeat(501) }
    );
    expect(result.ok).toBe(false);
  });
});

describe('fieldValue', () => {
  it('returns null for a field the type no longer declares', () => {
    // A deleted field definition must not take a page down with it.
    expect(fieldValue({ a: 1 }, 'gone')).toBeNull();
    expect(fieldValue(null, 'a')).toBeNull();
    expect(fieldValue('not an object', 'a')).toBeNull();
  });

  it('returns scalars and refuses structures', () => {
    expect(fieldValue({ a: 'x' }, 'a')).toBe('x');
    expect(fieldValue({ a: 3 }, 'a')).toBe(3);
    expect(fieldValue({ a: true }, 'a')).toBe(true);
    expect(fieldValue({ a: { nested: 1 } }, 'a')).toBeNull();
  });
});

describe('fieldLabel', () => {
  it('picks the locale, falling back to English', () => {
    expect(fieldLabel(DEFINITIONS[0]!, 'ar')).toBe('الدولة');
    expect(fieldLabel(DEFINITIONS[0]!, 'en')).toBe('Country');
    const noArabic = { ...DEFINITIONS[0]!, label: { en: 'Country', ar: '' } };
    expect(fieldLabel(noArabic, 'ar')).toBe('Country');
  });
});
