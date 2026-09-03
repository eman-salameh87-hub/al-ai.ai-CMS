// app/api/redirects/route.ts
//
// One-off URL moves. See lib/redirects/legacy-map.ts for the rule that handles
// the bulk of the legacy address space without touching this table.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { redirects } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { normaliseSource } from '@/lib/redirects/normalise';

export const runtime = 'nodejs';

/** A redirect changes what a URL means; that is an administrator's decision. */
const WRITERS = ['admin'] as const;
const READERS = ['admin', 'editor'] as const;

const redirectSchema = z.object({
  source: z.string().trim().min(1).max(500),
  destination: z.string().trim().min(1).max(500),
  /**
   * 301 or 302 only.
   *
   * 307 and 308 preserve the request method, which is right for an API and
   * wrong here: a form POSTed to a moved page must not be re-POSTed to the new
   * one behind the user's back.
   */
  statusCode: z.union([z.literal(301), z.literal(302)]).default(301),
  isActive: z.boolean().default(true),
  note: z.string().trim().max(1000).optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, READERS);
  if (!auth.ok) return auth.response;

  const rows = await db
    .select()
    .from(redirects)
    // Most-hit first: the useful question about this table is which legacy
    // links people are still following.
    .orderBy(desc(redirects.hits), desc(redirects.createdAt))
    .limit(500);

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, WRITERS);
  if (!auth.ok) return auth.response;

  try {
    const data = redirectSchema.parse(await request.json());

    // Normalised through the SAME function the resolver uses, so a row can
    // never exist that the lookup will not match — the failure mode of a
    // redirect table is a rule that looks configured and does nothing.
    const source = normaliseSource(data.source);
    const destination = data.destination.trim();

    if (normaliseSource(destination) === source) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'The source and destination are the same address.' },
        },
        { status: 400 }
      );
    }

    // A destination has to be somewhere this site can send a browser. An
    // absolute URL is allowed — a page genuinely moved to another domain — but
    // only over http(s).
    if (!destination.startsWith('/') && !/^https?:\/\//i.test(destination)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'The destination must start with "/" or be an http(s) URL.' },
        },
        { status: 400 }
      );
    }

    const [row] = await db
      .insert(redirects)
      .values({
        source,
        destination,
        statusCode: data.statusCode,
        isActive: data.isActive,
        note: data.note ?? null,
      })
      // Editing an existing source is the common case — someone corrects a
      // destination they got wrong — so this upserts rather than 409ing.
      .onConflictDoUpdate({
        target: redirects.source,
        set: {
          destination,
          statusCode: data.statusCode,
          isActive: data.isActive,
          note: data.note ?? null,
        },
      })
      .returning({ id: redirects.id });

    return NextResponse.json({ success: true, data: { id: row!.id } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 }
      );
    }
    console.error('Create redirect failed:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Server error' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, WRITERS);
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { success: false, error: { message: 'id is required' } },
      { status: 400 }
    );
  }

  await db.delete(redirects).where(eq(redirects.id, id));
  return NextResponse.json({ success: true });
}
