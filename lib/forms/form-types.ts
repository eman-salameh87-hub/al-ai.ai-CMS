// lib/forms/form-types.ts
//
// The kinds of thing a visitor can send, named once.
//
// Declared here rather than derived from `formTypeEnum` because the admin's
// forms table is a client component, and importing lib/db/schema into the
// browser bundle would pull drizzle and pg with it. The two must agree, and
// tests/forms/form-types.test.ts asserts they do — a check, not a hope.
export const FORM_TYPES = ['contact', 'newsletter', 'career', 'training'] as const;

export type FormType = (typeof FORM_TYPES)[number];

/**
 * Applications, as opposed to enquiries.
 *
 * These are the two that carry a file and want an applicant view rather than an
 * inbox row. Grouping them here means the admin can ask "is this an
 * application?" without listing the types again at every call site.
 */
export const APPLICATION_TYPES = ['career', 'training'] as const;

export type ApplicationType = (typeof APPLICATION_TYPES)[number];

export function isApplicationType(type: string): type is ApplicationType {
  return (APPLICATION_TYPES as readonly string[]).includes(type);
}

/** Whether this form type accepts an attachment at all. */
export function acceptsAttachment(type: string): boolean {
  return isApplicationType(type);
}

/**
 * What the admin table needs to know about an attachment.
 *
 * A narrower view of `FormAttachment` (lib/forms/attachment-types.ts): the
 * storage `key` is deliberately absent. This shape crosses into a client
 * component, and the key is the only thing that can delete the object from the
 * bucket — it has no business in a browser bundle.
 */
export interface FormAttachmentSummary {
  originalName: string;
  url: string;
  mimeType: string;
  size: number;
  field: string;
}
