// app/api/forms/[id]/attachments/[index]/route.ts
//
// Serves one attachment from one application, to signed-in staff only.
//
// WHY THIS ROUTE EXISTS AT ALL
// The file is in the same storage the media library uses, and with the local
// driver that means it sits under public/uploads — which Next serves at the web
// root to anyone. An applicant's CV must not be one guessed URL away, so
// lib/forms/uploads.ts stores it under a prefix nothing links to and records
// the storage KEY rather than a public URL. This route is the only way back to
// the bytes, and it checks who is asking first.
//
// The index is positional within the row's `attachments` array rather than an
// id of its own. That keeps the stored shape simple, and it is safe because the
// array is written once at submission and never reordered.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { formSubmissions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { activeDriver } from '@/lib/media/storage';

export const runtime = 'nodejs';

/** Anyone who can read the form inbox can read its attachments. */
const READERS = ['admin', 'editor'] as const;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; index: string }> }
) {
  const auth = await requireApiAuth(request, READERS);
  if (!auth.ok) return auth.response;

  const { id, index } = await ctx.params;

  const position = Number.parseInt(index, 10);
  if (!Number.isInteger(position) || position < 0 || position > 9) {
    return NextResponse.json(
      { success: false, error: { message: 'Bad attachment index' } },
      { status: 400 }
    );
  }

  const [row] = await db
    .select({ attachments: formSubmissions.attachments })
    .from(formSubmissions)
    .where(eq(formSubmissions.id, id))
    .limit(1);

  const attachment = row?.attachments?.[position];
  if (!attachment) {
    return NextResponse.json(
      { success: false, error: { message: 'Not found' } },
      { status: 404 }
    );
  }

  /*
   * Read by the stored KEY, through the storage driver.
   *
   * Going through the driver rather than the filesystem is what makes this work
   * on both installs: with STORAGE_DRIVER=s3 the file is in a bucket and there
   * is no path to read. The driver also owns the containment check on the key,
   * so that logic lives in one place instead of being restated here.
   *
   * The only user-controlled input that reaches storage is the numeric index,
   * already bounded above. The key itself was generated server-side as
   * `form-uploads/<year>/<month>/<uuid>.<ext>` — an applicant's own filename
   * never becomes a path.
   */
  const stored = await activeDriver().get(attachment.key);

  if (!stored) {
    // The row can outlive its file: a storage sweep, a restored database, a
    // migration between drivers. 404 with a clear message beats a 500.
    return NextResponse.json(
      { success: false, error: { message: 'The stored file is no longer available.' } },
      { status: 404 }
    );
  }

  /**
   * Content-Disposition: attachment, always.
   *
   * A PDF rendered inline would be a same-origin document under our own
   * Content-Security-Policy, which is exactly the shape of an XSS. Forcing the
   * download also matches what a recruiter wants to do with a CV. The filename
   * is quote-stripped because it goes into a header, and non-ASCII names go in
   * the RFC 5987 form so Arabic filenames survive.
   */
  const safeName = attachment.originalName.replace(/["\\\r\n]/g, '_');
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, '_');

  return new NextResponse(new Uint8Array(stored.body), {
    headers: {
      // The recorded mime, not the driver's — it is what the upload guard
      // actually verified against the file's magic bytes.
      'Content-Type': attachment.mimeType,
      'Content-Length': String(stored.body.length),
      'Content-Disposition':
        `attachment; filename="${asciiName}"; ` +
        `filename*=UTF-8''${encodeURIComponent(safeName)}`,
      // Never cached by a shared proxy: this is personal data behind an auth
      // check, and a cached copy would outlive the check.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
