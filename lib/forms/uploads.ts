// lib/forms/uploads.ts
//
// Storing a file a stranger uploaded.
//
// This is deliberately NOT lib/media/storage.ts. That module puts files in the
// media library — a curated place an editor browses, reuses and picks images
// from — and an applicant's CV must never appear there. Same storage layer,
// separate prefix, separate table column, no media_assets row.
//
// The guards here are stricter than the media library's for the same reason:
// the media library is fed by authenticated staff, and this is fed by anyone
// who can load the careers page.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { activeDriver } from '@/lib/media/storage';
import type { FormAttachment } from './attachment-types';

/**
 * What an application may carry.
 *
 * A CV is a document. Images are here because people photograph a certificate
 * or a portfolio page with their phone, and refusing that pushes them to email
 * instead — which is worse for everyone. Everything else is refused.
 *
 * Note what is absent: no zip (an archive is a way to smuggle anything past a
 * type check), no doc/xls (the legacy binary Office formats are a macro
 * vector), and no svg (an SVG is a script-bearing document, and the media
 * library excludes it for exactly this reason).
 */
const ALLOWED: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * 5 MB. A CV that does not fit in 5 MB is a scanned document that should have
 * been a PDF, and the cap is what stops a public endpoint being free storage.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** At most this many files per application. */
export const MAX_ATTACHMENTS = 2;

export const ATTACHMENT_ACCEPT = Object.keys(ALLOWED).join(',');

export type UploadFailure =
  | { reason: 'TYPE'; detail: string }
  | { reason: 'TOO_LARGE'; detail: string }
  | { reason: 'EMPTY' };

/**
 * The magic bytes each accepted type must actually start with.
 *
 * The browser-supplied `file.type` is a claim, not a fact — it is trivially
 * forged, and on some platforms it is simply wrong. Checking the first bytes is
 * what makes the type check mean something. It is not a virus scan and does not
 * pretend to be; it is the difference between "the client said this is a PDF"
 * and "this is a PDF".
 */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  // docx is a zip container.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) =>
    b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
};

/** `form-uploads/2026/09/<uuid>.pdf` — never anything the applicant chose. */
function storageKey(extension: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `form-uploads/${year}/${month}/${randomUUID()}.${extension}`;
}

/**
 * Store one uploaded file.
 *
 * `submissionId` is not known yet when this runs — the file is stored before
 * the row so a storage failure does not leave a submission pointing at nothing
 * — so `url` is filled in by the caller once the row exists. It is returned
 * with an empty `url` and the caller must set it.
 */
export async function storeAttachment(
  file: File,
  field: string
): Promise<{ ok: true; attachment: Omit<FormAttachment, 'url'> } | { ok: false; error: UploadFailure }> {
  if (file.size === 0) return { ok: false, error: { reason: 'EMPTY' } };

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: {
        reason: 'TOO_LARGE',
        detail: `${(file.size / 1048576).toFixed(1)} MB`,
      },
    };
  }

  const extension = ALLOWED[file.type];
  if (!extension) return { ok: false, error: { reason: 'TYPE', detail: file.type || 'unknown' } };

  const buffer = Buffer.from(await file.arrayBuffer());

  // The claimed type must match the bytes. A .exe renamed and posted as
  // application/pdf fails here, not at whatever opens it later.
  const check = SIGNATURES[file.type];
  if (check && !check(new Uint8Array(buffer.subarray(0, 8)))) {
    return { ok: false, error: { reason: 'TYPE', detail: `${file.type} (content mismatch)` } };
  }

  const key = storageKey(extension);
  await activeDriver().put(key, buffer, file.type);

  return {
    ok: true,
    attachment: {
      // Kept for the admin to display, never used as a path. A name like
      // "../../etc/passwd.pdf" is harmless as a label and fatal as a key,
      // which is why the key above is generated instead.
      originalName: file.name.slice(0, 200),
      key,
      mimeType: file.type,
      size: file.size,
      field,
    },
  };
}

/** Human sentence for a rejected upload, in the visitor's language. */
export function uploadErrorMessage(error: UploadFailure, locale: 'ar' | 'en'): string {
  const megabytes = (MAX_ATTACHMENT_BYTES / 1048576).toFixed(0);
  if (locale === 'ar') {
    switch (error.reason) {
      case 'EMPTY':
        return 'الملف المرفق فارغ.';
      case 'TOO_LARGE':
        return `حجم الملف ${error.detail} — الحد الأقصى ${megabytes} ميجابايت.`;
      case 'TYPE':
        return 'نوع الملف غير مدعوم. المسموح: PDF أو DOCX أو JPG أو PNG.';
    }
  }
  switch (error.reason) {
    case 'EMPTY':
      return 'That file is empty.';
    case 'TOO_LARGE':
      return `That file is ${error.detail} — the limit is ${megabytes} MB.`;
    case 'TYPE':
      return 'That file type is not supported. Please send a PDF, DOCX, JPG or PNG.';
  }
}
