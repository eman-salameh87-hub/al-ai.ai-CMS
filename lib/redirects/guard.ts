// lib/redirects/guard.ts
//
// "Before you 404, check whether this URL moved."
//
// WHY IT IS HERE AND NOT IN MIDDLEWARE
// Middleware runs on the Edge and cannot reach the database. It already applies
// the RULE (lib/redirects/legacy-map.ts), which covers the whole legacy address
// space at no cost. This is the other half: the recorded one-off moves, which
// need a query.
//
// Doing that query in middleware would mean a database round trip in front of
// every page on the site, to serve the handful of addresses that need one.
// Checking at the point a page was about to 404 anyway costs nothing on the hot
// path and catches exactly the requests a redirect exists for.
import 'server-only';
import { redirect, permanentRedirect, notFound } from 'next/navigation';
import { resolveRedirect } from './resolve';

/**
 * Redirect if this path has a recorded move, otherwise 404.
 *
 * Never returns — both `redirect()` and `notFound()` throw — so callers do not
 * need to `return` after awaiting it.
 *
 * `path` must be the full public path including the locale. That is what an
 * operator pastes out of Search Console and what `normaliseSource` stores.
 */
export async function redirectOrNotFound(path: string): Promise<never> {
  const match = await resolveRedirect(path);

  if (match) {
    /*
     * Two different functions, because the status code matters.
     *
     * Next's `redirect()` answers 307 and `permanentRedirect()` answers 308.
     * Neither is 301/302 — the framework only offers the method-preserving
     * pair — but the permanent/temporary distinction is the half that counts:
     * a search engine transfers ranking on 308 and does not on 307. Choosing
     * the right one of the two is as close as this can get to honouring the
     * stored code.
     */
    if (match.statusCode === 301) permanentRedirect(match.destination);
    redirect(match.destination);
  }

  notFound();
}
