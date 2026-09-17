// app/uploads/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { localDriver } from '@/lib/media/drivers/local';

/**
 * Serves files written by the local storage driver.
 *
 * Next's own `public/` static-file serving does not pick up files created
 * after the standalone server started: a build-time asset under public/
 * serves fine, but a file the app writes at runtime 404s even though it is
 * present on disk with correct ownership and permissions (confirmed via the
 * Railway console — the file is there, `wget` to it still 404s). Routing
 * these requests through a handler that reads the file itself sidesteps
 * whatever Next's static server is doing and always reflects what's
 * actually on disk right now.
 *
 * Only relevant while STORAGE_DRIVER=local — s3-served media never reaches
 * this route, since storage.ts returns an absolute bucket URL for those.
 */
const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const key = path.join('/');

  // localDriver.get() already resolves the key against the upload root and
  // refuses anything that escapes it — the same containment check `remove`
  // uses. Reusing it here means this route can't become a path-traversal
  // primitive on top of fixing the 404.
  const file = await localDriver.get(key);
  if (!file) return new NextResponse(null, { status: 404 });

  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  const contentType = EXT_TO_MIME[ext] ?? 'application/octet-stream';

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      'Content-Type': contentType,
      // Filenames are server-generated UUIDs; a given URL is never reused
      // for different content, so a long, immutable cache is safe.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
