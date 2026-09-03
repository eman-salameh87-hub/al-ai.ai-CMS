// lib/redirects/normalise.ts
//
// The stored form of a redirect source. Pure, and deliberately in its own file.
//
// Three different callers need it and they must agree exactly, because the
// failure mode of a redirect table is a row that exists and never matches:
//
//   - the admin API, when an operator saves a rule;
//   - lib/redirects/resolve.ts, when a request is about to 404;
//   - migration/import-legacy.ts, when the importer records a moved slug.
//
// resolve.ts is `server-only` (it touches the database), which a migration
// script run under tsx cannot import. Keeping the normaliser separate is what
// lets the importer share the one implementation instead of growing a second
// copy that drifts.

/**
 * Normalise a redirect source to its stored, comparable form.
 *
 * Query strings are dropped: a redirect is about the path, and a stray
 * `?utm_source=` must not stop one firing. Case is folded because the legacy
 * address space is PascalCase and the whole point is to catch it.
 */
export function normaliseSource(raw: string): string {
  let path = raw.trim();

  // Accept a full URL as readily as a path — people paste what they see in
  // Search Console, and that is an absolute URL.
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      /* fall through and treat it as a path */
    }
  }

  path = (path.split('?')[0] ?? '').split('#')[0] ?? '';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path.toLowerCase() || '/';
}
