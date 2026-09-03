// lib/redirects/legacy-map.ts
//
// The old new-aeon.com address space, translated to this one.
//
// Every legacy route is a PascalCase controller action (/en/WhatWeDo) and every
// entry slug carries the casing an editor happened to type in 2014
// (/ClientSelected/Ministry-of-interior-Qatar). Route prefixes here must match
// ^[a-z0-9]+(-[a-z0-9]+)*$ — see lib/content/type-registry.ts — so all 241
// indexed URLs move. That is the whole traffic risk of the migration, and it is
// solved before any content is imported rather than after.
//
// WHY THIS IS A PURE FUNCTION AND NOT A TABLE
// This file runs in middleware, on the Edge, with no database. The 241 sitemap
// URLs are not 241 arbitrary moves; they are eleven prefix renames plus
// "lowercase the slug". A rule expresses that exactly, keeps working for the
// legacy URLs that were never in the sitemap (old blog links, print material),
// and costs no query on the hot path.
//
// One-off moves that no rule can express — a slug an editor changed during the
// import, a legacy numeric /Blog/{id} — live in the `redirects` TABLE instead
// and are resolved in Node. See lib/redirects/resolve.ts.

/** Locale segments the public site answers on. Mirrors AVAILABLE_LOCALES. */
const LOCALES = ['ar', 'en'] as const;

/**
 * Legacy controller action -> new route segment, for addresses that take no
 * further path. Keys are compared case-insensitively.
 */
const SECTION_MAP: Record<string, string> = {
  whoweare: 'who-we-are',
  privacypolicy: 'privacy-policy',
  contactus: 'contact',
  whatwedo: 'what-we-do',
  advancedservice: 'advanced-services',
  advancedservices: 'advanced-services',
  portfolio: 'portfolio',
  achievement: 'achievements',
  career: 'careers',
  // "Traning" is the legacy spelling, and it is in the indexed URLs. It is
  // preserved here precisely BECAUSE it is a typo — those are the links people
  // actually have.
  traningapply: 'training',
  trainingapply: 'training',
  blogs: 'blog',
};

/**
 * Legacy "{Thing}Selected/{slug}" detail routes -> new archive prefix.
 *
 * The old site put the detail page on a different controller action from its
 * archive (/Achievement vs /AchievementSelected/x). The new site uses one
 * prefix for both, which is what makes a single pair of dynamic routes able to
 * serve a custom type at all.
 */
const DETAIL_MAP: Record<string, string> = {
  clientselected: 'clients',
  achievementselected: 'achievements',
  achivementselected: 'achievements',
  whatwedoselected: 'what-we-do',
  advancedservicesselected: 'advanced-services',
};

/**
 * Legacy routes with no destination worth keeping.
 *
 * /ErrorPage was a real indexed URL — the old site served its 404 body at a
 * 200-OK address, which is how it got into the sitemap. Redirecting it to the
 * home page would launder a dead end into a soft 404; letting it 404 is
 * honest, and that is what returning `null` from a listed prefix means.
 */
const GONE = new Set(['errorpage']);

/**
 * The slug form this site stores and routes.
 *
 * Lowercase only — the legacy slugs are already hyphenated, so nothing else
 * needs doing to them. Anything that is not [a-z0-9-] after lowercasing is
 * dropped rather than transliterated: an Arabic-script slug reaching here is a
 * URL this rule cannot honestly map, and it should fall through to the
 * redirect table, not be mangled into a 404 with a confident 301 on it.
 */
export function legacySlug(raw: string): string {
  return decodeURIComponent(raw)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export interface LegacyMatch {
  /** Where to send the visitor. Absolute path, locale included. */
  destination: string;
  /** 308 for a rule; a rule is permanent by construction. */
  permanent: true;
}

/**
 * Translate a legacy pathname, or return null if it is not a legacy address.
 *
 * Returning null is the common case — every already-correct URL passes through
 * here on every request — so the checks are ordered cheapest-first and nothing
 * allocates until a legacy segment is actually recognised.
 *
 * `pathname` must be the raw request path, leading slash included, query string
 * excluded.
 */
export function mapLegacyPath(pathname: string): LegacyMatch | null {
  const parts = pathname.split('/').filter(Boolean);
  const first = parts[0];
  if (first === undefined) return null;

  // Locale prefix is optional: the old site served / and /ar as well as
  // /en/WhoWeAre, and middleware's own locale redirect has not run yet.
  const hasLocale = (LOCALES as readonly string[]).includes(first);
  const locale = hasLocale ? first : null;
  const rest = hasLocale ? parts.slice(1) : parts;

  const legacyHead = rest[0];
  if (legacyHead === undefined) return null;

  const head = legacyHead.toLowerCase();

  // A listed dead end. Falls through to the 404 it always was, rather than
  // being laundered into a 301 at the home page.
  if (GONE.has(head)) return null;

  const prefix = (locale ? `/${locale}` : '') || '';

  // /WhatWeDo/{slug}, /AdvancedService/{slug} — archive prefix plus entry.
  const section = SECTION_MAP[head];
  if (section) {
    const legacyTail = rest[1];
    if (legacyTail === undefined) {
      // Nothing to change means nothing to redirect: /en/blog is already right,
      // and answering it with a 308 to itself is a loop.
      if (legacyHead === section) return null;
      return { destination: `${prefix}/${section}`, permanent: true };
    }
    const slug = legacySlug(legacyTail);
    if (!slug) return null;
    if (legacyHead === section && legacyTail === slug) return null;
    return { destination: `${prefix}/${section}/${slug}`, permanent: true };
  }

  // /ClientSelected/{slug} and friends — detail action folded onto the archive.
  const detail = DETAIL_MAP[head];
  if (detail) {
    const legacyTail = rest[1];
    if (legacyTail === undefined) {
      return { destination: `${prefix}/${detail}`, permanent: true };
    }
    const slug = legacySlug(legacyTail);
    if (!slug) return null;
    return { destination: `${prefix}/${detail}/${slug}`, permanent: true };
  }

  return null;
}
