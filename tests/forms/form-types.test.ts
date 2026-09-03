// tests/forms/form-types.test.ts
//
// lib/forms/form-types.ts declares the form types by hand rather than deriving
// them from `formTypeEnum`, because the admin's forms table is a Client
// Component and importing lib/db/schema would pull drizzle and pg into the
// browser bundle. That duplication is only acceptable with a check on it — this
// is the check.
import { describe, it, expect } from 'vitest';
import { formTypeEnum } from '@/lib/db/schema';
import {
  FORM_TYPES, APPLICATION_TYPES, isApplicationType, acceptsAttachment,
} from '@/lib/forms/form-types';

describe('FORM_TYPES', () => {
  it('matches the database enum exactly', () => {
    // Sorted, because the order of a pgEnum's values is not part of its
    // meaning and a reordering should not fail this.
    expect([...FORM_TYPES].sort()).toEqual([...formTypeEnum.enumValues].sort());
  });

  it('still contains the two original types', () => {
    // A migration that dropped these would silently orphan every existing
    // contact message and newsletter signup.
    expect(FORM_TYPES).toContain('contact');
    expect(FORM_TYPES).toContain('newsletter');
  });

  it('contains the two the legacy site had and this one lacked', () => {
    expect(FORM_TYPES).toContain('career');
    expect(FORM_TYPES).toContain('training');
  });
});

describe('APPLICATION_TYPES', () => {
  it('is a subset of FORM_TYPES', () => {
    for (const type of APPLICATION_TYPES) {
      expect(FORM_TYPES).toContain(type);
    }
  });

  it('identifies applications and nothing else', () => {
    expect(isApplicationType('career')).toBe(true);
    expect(isApplicationType('training')).toBe(true);
    expect(isApplicationType('contact')).toBe(false);
    expect(isApplicationType('newsletter')).toBe(false);
    expect(isApplicationType('nonsense')).toBe(false);
  });

  it('gates attachments on being an application', () => {
    // The contact form has no upload path, and answering true here would make
    // the admin render a download link to a file that cannot exist.
    expect(acceptsAttachment('career')).toBe(true);
    expect(acceptsAttachment('contact')).toBe(false);
  });
});
