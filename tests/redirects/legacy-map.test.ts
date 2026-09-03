// tests/redirects/legacy-map.test.ts
//
// The migration's one irreversible risk is a legacy URL that 404s, so this
// suite is driven by the ACTUAL sitemap rather than by hand-picked examples.
// migration/data/legacy-urls.json is extracted verbatim from the legacy app's
// sitemap.xml — all 241 indexed addresses — and every one of them must either
// map to a valid new route or be a deliberate, named exception.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapLegacyPath, legacySlug } from '@/lib/redirects/legacy-map';

const INDEXED: string[] = JSON.parse(
  readFileSync(join(process.cwd(), 'migration/data/legacy-urls.json'), 'utf8')
);

/** Route segments the new site actually serves under /[locale]. */
const NEW_SEGMENTS = new Set([
  'who-we-are', 'privacy-policy', 'contact', 'what-we-do', 'advanced-services',
  'portfolio', 'achievements', 'careers', 'training', 'clients', 'blog',
]);

/**
 * Addresses that are correctly left to 404.
 *
 * /ErrorPage is the legacy 404 body, served at a 200-OK address and therefore
 * indexed. Redirecting it anywhere would turn a dead end into a soft 404.
 */
const DELIBERATE_404 = new Set(['/en/ErrorPage']);

/** Addresses that need no redirect because they are already correct. */
const ALREADY_VALID = new Set(['/', '/ar', '/en']);

describe('legacySlug', () => {
  it('lowercases the casing editors typed', () => {
    expect(legacySlug('Ministry-of-interior-Qatar')).toBe('ministry-of-interior-qatar');
    expect(legacySlug('SAMSUNG')).toBe('samsung');
    expect(legacySlug('ONE-And-ONLY')).toBe('one-and-only');
  });

  it('produces a slug that the new route prefix pattern accepts', () => {
    const PREFIX_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const raw of ['Search-Engine-Marketing', 'AL-Risla-TV', 'OPTIONS-FURNITURE-CENTER']) {
      expect(legacySlug(raw)).toMatch(PREFIX_PATTERN);
    }
  });

  it('collapses the shapes a hand-typed slug arrives in', () => {
    expect(legacySlug('  Green_Care  ')).toBe('green-care');
    expect(legacySlug('a--b')).toBe('a-b');
    expect(legacySlug('-lead-')).toBe('lead');
  });

  it('returns empty for a slug it cannot honestly map', () => {
    // An Arabic-script slug has no lowercase-ASCII form. Empty is the signal
    // that the rule declines, so the caller falls through to the table rather
    // than 308ing to a 404.
    expect(legacySlug('من-نحن')).toBe('');
  });
});

describe('mapLegacyPath', () => {
  it('renames every singleton section', () => {
    expect(mapLegacyPath('/en/WhoWeAre')?.destination).toBe('/en/who-we-are');
    expect(mapLegacyPath('/ar/PrivacyPolicy')?.destination).toBe('/ar/privacy-policy');
    expect(mapLegacyPath('/en/ContactUs')?.destination).toBe('/en/contact');
    expect(mapLegacyPath('/en/Career')?.destination).toBe('/en/careers');
    expect(mapLegacyPath('/en/Achievement')?.destination).toBe('/en/achievements');
  });

  it('keeps the legacy misspelling of the training route', () => {
    // "Traning" is what is indexed. Correcting the spelling in the map would
    // break the only links that exist.
    expect(mapLegacyPath('/en/TraningApply')?.destination).toBe('/en/training');
  });

  it('folds a *Selected detail action onto its archive prefix', () => {
    expect(mapLegacyPath('/en/ClientSelected/STC')?.destination).toBe('/en/clients/stc');
    expect(mapLegacyPath('/ar/AchievementSelected/Award-2019')?.destination).toBe(
      '/ar/achievements/award-2019'
    );
  });

  it('maps an entry under a renamed section', () => {
    expect(mapLegacyPath('/en/WhatWeDo/Search-Engine-Marketing')?.destination).toBe(
      '/en/what-we-do/search-engine-marketing'
    );
    expect(mapLegacyPath('/ar/AdvancedService/Social-Media-Conversion')?.destination).toBe(
      '/ar/advanced-services/social-media-conversion'
    );
  });

  it('works without a locale prefix, as the bare legacy links do', () => {
    expect(mapLegacyPath('/WhoWeAre')?.destination).toBe('/who-we-are');
  });

  it('returns null for an address that is already correct', () => {
    // The guard against a 308 to itself. Without it /en/blog redirects to
    // /en/blog forever.
    expect(mapLegacyPath('/en/blog')).toBeNull();
    expect(mapLegacyPath('/en/what-we-do')).toBeNull();
    expect(mapLegacyPath('/en/what-we-do/search-engine-marketing')).toBeNull();
  });

  it('leaves unrelated paths alone', () => {
    expect(mapLegacyPath('/en/shop')).toBeNull();
    expect(mapLegacyPath('/admin/content/pages')).toBeNull();
    expect(mapLegacyPath('/')).toBeNull();
  });

  it('declines rather than guessing when the slug will not lowercase', () => {
    expect(mapLegacyPath('/ar/ClientSelected/شركة')).toBeNull();
  });
});

describe('every indexed legacy URL', () => {
  it('has 241 of them to check', () => {
    expect(INDEXED).toHaveLength(241);
  });

  it.each(INDEXED)('%s resolves to a served route', (path) => {
    if (ALREADY_VALID.has(path)) {
      expect(mapLegacyPath(path)).toBeNull();
      return;
    }
    if (DELIBERATE_404.has(path)) {
      expect(mapLegacyPath(path)).toBeNull();
      return;
    }

    const match = mapLegacyPath(path);
    expect(match, `${path} has no redirect`).not.toBeNull();

    const parts = match!.destination.split('/').filter(Boolean);
    expect(['ar', 'en']).toContain(parts[0]);
    expect(NEW_SEGMENTS, `${path} -> ${match!.destination}`).toContain(parts[1]);

    // The destination must satisfy the same prefix rules the CMS enforces on a
    // content type, or the route it points at can never exist.
    for (const segment of parts.slice(1)) {
      expect(segment).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('never maps two legacy URLs onto one destination', () => {
    // A collision is silent data loss: two case-variant client slugs that
    // lowercase to the same thing would leave one client unreachable.
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const path of INDEXED) {
      const dest = mapLegacyPath(path)?.destination;
      if (!dest) continue;
      const previous = seen.get(dest);
      if (previous) collisions.push(`${previous} and ${path} both -> ${dest}`);
      else seen.set(dest, path);
    }
    expect(collisions).toEqual([]);
  });
});
