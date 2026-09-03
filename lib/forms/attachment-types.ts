// lib/forms/attachment-types.ts
//
// Shape only. Kept apart from lib/forms/uploads.ts so lib/db/schema.ts can
// import it without dragging the storage layer — and therefore Node — into
// anything that only wants the table definitions.

/**
 * One file attached to a form submission.
 *
 * `url` is a path this app serves, never a public bucket URL: an applicant's
 * CV must not be readable by anyone who guesses a filename, so it is fetched
 * through an authenticated admin route. `key` is what the storage driver
 * actually holds and is the only thing that can delete the object.
 */
export interface FormAttachment {
  /** The name the applicant's own file had. Display only — never a path. */
  originalName: string;
  /** Storage key, e.g. `form-uploads/2026/09/a1b2….pdf`. */
  key: string;
  /** Admin-only download route: /api/forms/{submissionId}/attachments/{index}. */
  url: string;
  mimeType: string;
  /** Bytes. */
  size: number;
  /** Which field of the form produced it, e.g. `cv`. */
  field: string;
}
