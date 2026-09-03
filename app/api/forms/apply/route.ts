// app/api/forms/apply/route.ts
//
// Job and training applications — the one public endpoint that accepts a file.
//
// SEPARATE FROM /api/forms, ON PURPOSE
// That route takes JSON, caps the payload at twelve string fields, and its
// schema names exactly `contact` and `newsletter`. An application is multipart,
// carries a CV, and needs its own size accounting. Widening the JSON route to
// cover both would have meant one handler branching on content type, with the
// honeypot and origin checks duplicated down each branch — the arrangement
// where one branch quietly loses a guard.
//
// What is shared is deliberate: the same rate limiter, the same origin check,
// the same honeypot, and the same "answer 200 to a bot" behaviour.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { formSubmissions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { notifyFormSubmission } from '@/lib/email/notify';
import {
  storeAttachment, uploadErrorMessage, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES,
} from '@/lib/forms/uploads';
import type { FormAttachment } from '@/lib/forms/attachment-types';

export const runtime = 'nodejs';

/**
 * The whole request body, not just one file.
 *
 * MAX_ATTACHMENTS files at MAX_ATTACHMENT_BYTES each, plus a megabyte of slack
 * for the text fields and multipart framing. Checked from Content-Length before
 * the body is read, so an oversized post is refused without buffering it.
 */
const MAX_REQUEST_BYTES = MAX_ATTACHMENTS * MAX_ATTACHMENT_BYTES + 1024 * 1024;

/**
 * Text fields. Capped at 20 rather than the JSON route's 12: an application
 * legitimately carries more than an enquiry (name, email, phone, position,
 * cover letter, availability, references…), and the cap exists to stop abuse,
 * not to be a design constraint.
 */
const textSchema = z.object({
  kind: z.enum(['career', 'training']),
  pageSlug: z.string().max(255).optional(),
  locale: z.enum(['ar', 'en']).optional(),
  website: z.string().max(0).optional(),
  fields: z
    .record(z.string().max(5000))
    .refine((f) => Object.keys(f).length <= 20, 'Too many fields'),
});

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, error: { message: 'Cross-site request blocked' } },
      { status: 403 }
    );
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { success: false, error: { message: 'Attachment too large' } },
      { status: 413 }
    );
  }

  /**
   * Tighter than the enquiry form's 5-per-10-minutes, and on its own bucket.
   *
   * An application takes real effort to write, so nobody legitimately sends
   * three in ten minutes — and each one can carry 10 MB, which makes this the
   * most expensive public endpoint on the site.
   */
  const limit = await rateLimit(clientKey(request, 'forms:apply'), 3, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'بيانات غير صالحة' } },
      { status: 400 }
    );
  }

  // Text fields arrive as one JSON blob so the schema above can validate them
  // as a unit, rather than this handler reconstructing an object from
  // individual form parts and guessing at types.
  const raw = form.get('data');
  let parsed;
  try {
    parsed = textSchema.safeParse(JSON.parse(typeof raw === 'string' ? raw : '{}'));
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'بيانات غير صالحة' } },
      { status: 400 }
    );
  }
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { message: 'بيانات غير صالحة' } },
      { status: 400 }
    );
  }

  const { kind, fields, pageSlug, website } = parsed.data;
  const locale = parsed.data.locale ?? 'ar';

  // Honeypot: 200, so a bot cannot tell the difference. Nothing is stored and
  // no file is written.
  if (website) return NextResponse.json({ success: true });

  const uploads = form
    .getAll('attachments')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
    .slice(0, MAX_ATTACHMENTS);

  const stored: Omit<FormAttachment, 'url'>[] = [];
  for (const file of uploads) {
    const result = await storeAttachment(file, 'attachment');
    if (!result.ok) {
      /*
       * A rejected file fails the whole submission, and says why.
       *
       * The alternative — store the application and drop the file — is worse:
       * the applicant believes their CV was sent, and the recruiter sees an
       * application with nothing attached. Neither of them finds out.
       */
      return NextResponse.json(
        { success: false, error: { message: uploadErrorMessage(result.error, locale) } },
        { status: 400 }
      );
    }
    stored.push(result.attachment);
  }

  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

    const [row] = await db
      .insert(formSubmissions)
      .values({
        type: kind,
        payload: fields,
        // The download URL needs the row's id, so it is filled in immediately
        // below. Stored with a placeholder rather than left absent, so the
        // column shape is the same whether or not that update lands.
        attachments: stored.length ? stored.map((a) => ({ ...a, url: '' })) : null,
        pageSlug: pageSlug ?? null,
        locale,
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') ?? null,
      })
      .returning({ id: formSubmissions.id });

    if (row && stored.length) {
      await db
        .update(formSubmissions)
        .set({
          attachments: stored.map((attachment, index) => ({
            ...attachment,
            /*
             * An app route, never the bucket URL.
             *
             * A CV must not be readable by anyone who guesses a filename. This
             * path is behind the admin guard, so a recruiter can open it and a
             * stranger cannot — which is the whole reason the file is not a
             * media_assets row with a public /uploads URL.
             */
            url: `/api/forms/${row.id}/attachments/${index}`,
          })),
        })
        .where(eq(formSubmissions.id, row.id));
    }

    // After the insert, and never allowed to fail the request: a stored
    // application that was not announced is recoverable; one that is neither is
    // not. Same ordering as /api/forms.
    await notifyFormSubmission({
      type: kind,
      locale,
      fields: {
        ...fields,
        ...(stored.length
          ? { attachments: stored.map((a) => a.originalName).join(', ') }
          : {}),
      },
      pageSlug,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Application submission error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر الإرسال' } },
      { status: 500 }
    );
  }
}
