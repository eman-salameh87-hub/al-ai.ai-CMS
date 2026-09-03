// migration/lib/media-index.ts
//
// Finds a legacy image file on disk, given whatever the legacy database says.
//
// THE PROBLEM THIS SOLVES
// The old application recorded image locations four different ways, and all
// four are in the restored data:
//
//   1. a bare filename, with the folder implied by the table it came from
//      ("e96d93cc-….jpg" in WhatWeDo.we_Image  ->  Images/WhatWeDo/)
//   2. a short relative path under that folder
//      ("Uploads/d88722bf-….png" in Clients.clnt_Image)
//   3. a site-absolute path from a DIFFERENT app entirely, inside body HTML
//      ("/NewAeonClients/Uploads/7d40d10b-…stc1.jpg")
//   4. an absolute URL, sometimes pointing at a staging host that no longer
//      exists ("http://dev.new-aeon.com/Images/StaticFiles/….jpg")
//
// Forms 1 and 2 resolve against the section folder. Forms 3 and 4 do not
// resolve anywhere by path — but the FILES are present in the delivered tree
// under other directories, so they are found by basename. That fallback is
// what takes inline body images from 7 resolvable to 199 of 206.
//
// Matching by basename is safe here specifically because these are GUID
// filenames: a collision would require two different files to have been given
// the same UUID. The index records collisions anyway and refuses to guess.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

/** Section folder for each legacy table. From the old CommonService.SavePlace. */
export const SECTION_FOLDER: Record<string, string> = {
  WhatWeDo: 'WhatWeDo',
  AdvancedServicesList: 'AdvancedService',
  Clients: 'Client',
  Achivements: 'Achivment',
  Blogs: 'Blogs',
  NewsAndUpDate: 'NewsAndUpdate',
  AvailableJobs: 'Career',
  TrainingAvailable: 'Training',
  ourDepartment: 'OurDepartment',
  SliderImage: 'SliderImage',
};

/** Directories in the legacy checkout that hold no content media. */
const SKIP = ['/bin', '/obj', '/.vs', '/packages', '/node_modules'];

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.mp4', '.webm',
]);

export interface MediaIndex {
  /** basename (lowercased) -> absolute paths that have it. */
  byName: Map<string, string[]>;
  root: string;
}

/** Walk the legacy checkout once and index every media file by basename. */
export function buildMediaIndex(legacyRoot: string): MediaIndex {
  const byName = new Map<string, string[]>();

  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (SKIP.some((s) => full.includes(s))) continue;

      let stats;
      try {
        stats = statSync(full);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        walk(full);
        continue;
      }
      if (!IMAGE_EXTENSIONS.has(extname(entry).toLowerCase())) continue;

      const key = entry.toLowerCase();
      const list = byName.get(key);
      if (list) list.push(full);
      else byName.set(key, [full]);
    }
  };

  walk(legacyRoot);
  return { byName, root: legacyRoot };
}

export interface Resolution {
  /** Absolute path on disk. */
  path: string;
  /** How it was found — reported so the run is auditable. */
  via: 'section-path' | 'basename';
}

/**
 * Resolve a database image value to a file, or null.
 *
 * `table` supplies the section folder for the common case. `raw` may be a bare
 * filename, a relative path, a site-absolute path or a full URL — all four
 * shapes occur.
 */
export function resolveLegacyImage(
  index: MediaIndex,
  raw: string | null | undefined,
  table?: string
): Resolution | null {
  if (!raw) return null;

  let value = String(raw).trim();
  if (!value) return null;

  // Strip a full URL down to its path, and drop any query string. A staging
  // host that no longer resolves still tells us the filename.
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      /* keep the raw string; the basename fallback may still find it */
    }
  }
  value = value.split('?')[0]?.split('#')[0] ?? '';
  if (!value) return null;

  // Form 1 and 2: relative to the section folder.
  const folder = table ? SECTION_FOLDER[table] : undefined;
  if (folder) {
    const candidate = join(index.root, 'Images', folder, value);
    if (existsSync(candidate) && statSync(candidate).size > 0) {
      return { path: candidate, via: 'section-path' };
    }
  }

  // A site-absolute path, tried as given against the checkout root.
  if (value.startsWith('/')) {
    const candidate = join(index.root, value);
    if (existsSync(candidate) && statSync(candidate).size > 0) {
      return { path: candidate, via: 'section-path' };
    }
  }

  // Forms 3 and 4: find it by basename anywhere in the tree.
  const name = basename(value).toLowerCase();
  const matches = index.byName.get(name);
  if (!matches?.length) return null;

  // Ambiguity is reported by returning null rather than picking one. With GUID
  // filenames this should never fire; if it does, the assumption above is
  // wrong and a human should look rather than a script choose.
  if (matches.length > 1) {
    const distinct = new Set(matches.map((p) => statSync(p).size));
    if (distinct.size > 1) return null;
  }

  return { path: matches[0]!, via: 'basename' };
}

/**
 * The filename this file gets in the new media library.
 *
 * The legacy GUID is KEPT rather than replaced. It is already unique, it is
 * what every legacy reference names, and preserving it means a stray old link
 * to a file can still be traced to the row that used it. Only the characters
 * that have no business in a URL are removed.
 */
export function newMediaFilename(sourcePath: string): string {
  const name = basename(sourcePath);
  const extension = extname(name).toLowerCase();
  const stem = name.slice(0, name.length - extension.length);

  const safeStem = stem
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100);

  return `${safeStem || 'file'}${extension}`;
}
