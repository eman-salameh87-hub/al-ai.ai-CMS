// lib/redirects/resolve.ts
//
// The database half of the redirect story. See lib/redirects/legacy-map.ts for
// the rule half, and why the two are separate.
//
// This runs in Node, from the places that are about to call notFound(). That
// ordering is deliberate: a redirect lookup on every request would put a query
// in front of every page on the site to serve the handful of addresses that
// need one. Checking only when the page was going to 404 anyway costs nothing
// on the hot path and catches exactly the requests a redirect exists for.
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { redirects } from '@/lib/db/schema';
// One implementation, shared with the admin API and the importer. See the note
// in that file for why it does not live here.
import { normaliseSource } from './normalise';

export { normaliseSource };

export interface ResolvedRedirect {
  destination: string;
  statusCode: number;
}

/**
 * Look up a recorded redirect for `pathname`, or null.
 *
 * Records the hit as a fire-and-forget update. It is deliberately NOT awaited:
 * the visitor is being sent somewhere else and must not wait on a counter, and
 * a failed counter must not turn a working redirect into a 500. The count is
 * therefore approximate under concurrency, which is the right trade for what it
 * is used for — spotting which legacy links are still live.
 */
export async function resolveRedirect(pathname: string): Promise<ResolvedRedirect | null> {
  const source = normaliseSource(pathname);

  let row;
  try {
    [row] = await db
      .select({
        id: redirects.id,
        destination: redirects.destination,
        statusCode: redirects.statusCode,
      })
      .from(redirects)
      .where(and(eq(redirects.source, source), eq(redirects.isActive, true)))
      .limit(1);
  } catch {
    // A redirect lookup is a nicety on a page that is already 404ing. If the
    // database is unreachable the visitor should get the 404, not a 500.
    return null;
  }

  if (!row) return null;

  // A row pointing at itself is a loop that would otherwise be served to the
  // visitor as one. Refuse it here rather than trusting every writer.
  if (normaliseSource(row.destination) === source) return null;

  void db
    .update(redirects)
    .set({ hits: sql`${redirects.hits} + 1`, lastHitAt: new Date() })
    .where(eq(redirects.id, row.id))
    .catch(() => {});

  return { destination: row.destination, statusCode: row.statusCode };
}
