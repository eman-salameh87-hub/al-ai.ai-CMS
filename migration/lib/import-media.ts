// migration/lib/import-media.ts
//
// Copies the legacy image files the content actually references into the new
// media library, and returns the map from every legacy reference to its new URL.
//
// ONLY WHAT IS REFERENCED
// The delivered tree is 1,206 files and 729 MB, and the database references
// roughly a third of them — the rest are superseded crops, staging leftovers
// and a decade of re-uploads. Importing everything would fill the media library
// with files no page uses and make the orphan-cleanup tool useless on day one.
//
// FILENAMES ARE PRESERVED, NOT REGENERATED
// lib/media/storage.ts deliberately generates a UUID name for user uploads,
// because a user-supplied name is untrusted. These are not user uploads: they
// are GUID filenames from our own database, and they are the JOIN KEY. An
// inline <img src="/NewAeonClients/Uploads/7d40d10b-….jpg"> can only be
// rewritten if the new file is still findable by that GUID. So this writes
// through the storage DRIVER with a chosen key, and does its own
// dimension/thumbnail work — the same operations storeUpload performs, on
// input that has a different trust story.
import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { db } from '@/lib/db';
import { mediaAssets, mediaFolders } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { activeDriver } from '@/lib/media/storage';
import { ALLOWED_MIME, maxBytesFor, isImageMime } from '@/lib/media/limits';
import { newMediaFilename, type MediaIndex, resolveLegacyImage } from './media-index';

/** Extension -> mime, for files coming off disk with no Content-Type. */
const MIME_FOR_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** Where imported files land, so they are distinguishable from new uploads. */
const KEY_PREFIX = 'legacy';
const FOLDER_NAME = 'Legacy import';

export interface ImportedAsset {
  assetId: string;
  url: string;
  filename: string;
}

export interface MediaImportResult {
  /** Lowercased legacy basename -> the imported asset. */
  byLegacyName: Map<string, ImportedAsset>;
  imported: number;
  reused: number;
  skipped: { file: string; reason: string }[];
  bytes: number;
}

/**
 * sharp, optional exactly as it is in the storage layer.
 *
 * A migration must not fail because a native module will not load on this
 * machine; the files are the point, and dimensions are a nicety.
 */
type SharpFactory = (typeof import('sharp'))['default'];
let sharpModule: SharpFactory | null | undefined;

async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpModule !== undefined) return sharpModule;
  try {
    sharpModule = (await import('sharp')).default;
  } catch {
    console.warn('  sharp unavailable — imported media will have no dimensions or thumbnails');
    sharpModule = null;
  }
  return sharpModule;
}

/** The folder imported media is filed under, created once. */
async function ensureFolder(): Promise<string> {
  const [existing] = await db
    .select({ id: mediaFolders.id })
    .from(mediaFolders)
    .where(and(eq(mediaFolders.name, FOLDER_NAME), isNull(mediaFolders.parentId)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(mediaFolders)
    .values({ name: FOLDER_NAME, path: `/${FOLDER_NAME}` })
    .returning({ id: mediaFolders.id });
  return created!.id;
}

/**
 * Import one file. Idempotent on filename: a second run reuses the existing
 * asset rather than creating a duplicate, which is what makes it safe to
 * re-run the migration after fixing a mapping.
 */
async function importOne(
  sourcePath: string,
  folderId: string,
  uploadedBy: string | null
): Promise<{ asset: ImportedAsset; reused: boolean; bytes: number } | { error: string }> {
  const filename = newMediaFilename(sourcePath);
  const extension = extname(filename).toLowerCase();
  const mimeType = MIME_FOR_EXTENSION[extension];

  if (!mimeType) return { error: `unsupported extension ${extension}` };
  if (!ALLOWED_MIME[mimeType]) return { error: `mime not on the allow-list: ${mimeType}` };

  const size = statSync(sourcePath).size;
  if (size === 0) return { error: 'empty file' };
  if (size > maxBytesFor(mimeType)) {
    // Reported, not silently shrunk. Re-encoding someone's asset during a
    // migration is a decision for a person, not a script.
    return { error: `${(size / 1048576).toFixed(1)} MB exceeds the limit for ${mimeType}` };
  }

  const [existing] = await db
    .select({
      id: mediaAssets.id,
      url: mediaAssets.url,
      filename: mediaAssets.filename,
      originalName: mediaAssets.originalName,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.filename, filename))
    .limit(1);

  if (existing) {
    /*
     * Same stored name AND same source file: a re-run. Reuse it.
     *
     * Same stored name, DIFFERENT source: a sanitisation collision. Several
     * legacy filenames carry Arabic characters after the GUID
     * ("67d6f7ae-…مكيفات.png"), and stripping those to make a URL-safe name can
     * map two distinct files onto one. Reusing here would silently show one
     * client's image on another's page — the kind of error nobody finds until
     * the client does. Refuse and report instead.
     */
    if (existing.originalName === basename(sourcePath)) {
      return {
        asset: { assetId: existing.id, url: existing.url, filename: existing.filename },
        reused: true,
        bytes: 0,
      };
    }
    return {
      error:
        `filename collision: "${filename}" is already held by "${existing.originalName}", ` +
        `so "${basename(sourcePath)}" was not imported`,
    };
  }

  const buffer = await readFile(sourcePath);
  const driver = activeDriver();
  const url = await driver.put(`${KEY_PREFIX}/${filename}`, buffer, mimeType);

  let width: number | null = null;
  let height: number | null = null;
  let thumbnailUrl: string | null = null;

  const sharp = isImageMime(mimeType) ? await loadSharp() : null;
  if (sharp) {
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;

      const stem = filename.slice(0, filename.length - extension.length);
      const thumb = await sharp(buffer)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      thumbnailUrl = await driver.put(`${KEY_PREFIX}/${stem}-thumb.webp`, thumb, 'image/webp');
    } catch {
      // An animated GIF's first frame may fail to encode. The original is
      // stored either way.
    }
  }

  const [row] = await db
    .insert(mediaAssets)
    .values({
      filename,
      originalName: basename(sourcePath),
      mimeType,
      size,
      url,
      thumbnailUrl,
      width,
      height,
      // No alt text is invented. `ImagesDescreption` — the legacy table that
      // was supposed to hold it — does not exist in this database, so there is
      // nothing to carry over and a guess would be worse than blank.
      altText: null,
      folderId,
      uploadedBy,
    })
    .returning({ id: mediaAssets.id });

  return {
    asset: { assetId: row!.id, url, filename },
    reused: false,
    bytes: size,
  };
}

/**
 * Import every legacy reference in `references`, de-duplicated.
 *
 * `references` is a list of (value, table) pairs straight out of the database —
 * the same shapes resolveLegacyImage handles.
 */
export async function importReferencedMedia(
  index: MediaIndex,
  references: { value: string; table?: string }[],
  uploadedBy: string | null
): Promise<MediaImportResult> {
  const result: MediaImportResult = {
    byLegacyName: new Map(),
    imported: 0,
    reused: 0,
    skipped: [],
    bytes: 0,
  };

  const folderId = await ensureFolder();

  // Collapse to distinct source files first. One file is commonly referenced by
  // several rows and by both locales' bodies.
  const sources = new Map<string, string[]>();
  for (const reference of references) {
    if (!reference.value?.trim()) continue;
    const resolved = resolveLegacyImage(index, reference.value, reference.table);
    const key = basename(reference.value).toLowerCase();

    if (!resolved) {
      // Recorded once per distinct missing reference.
      if (!result.skipped.some((s) => s.file === reference.value)) {
        result.skipped.push({ file: reference.value, reason: 'not found on disk' });
      }
      continue;
    }
    const names = sources.get(resolved.path);
    if (names) names.push(key);
    else sources.set(resolved.path, [key]);
  }

  for (const [sourcePath, legacyNames] of sources) {
    const outcome = await importOne(sourcePath, folderId, uploadedBy);

    if ('error' in outcome) {
      result.skipped.push({ file: sourcePath, reason: outcome.error });
      continue;
    }

    if (outcome.reused) result.reused += 1;
    else result.imported += 1;
    result.bytes += outcome.bytes;

    // Registered under EVERY legacy name that resolved to this file, plus the
    // file's own basename. The body-image rewriter looks up by basename, and a
    // reference may name the file differently from the file itself.
    for (const name of [...legacyNames, basename(sourcePath).toLowerCase()]) {
      result.byLegacyName.set(name, outcome.asset);
    }
  }

  return result;
}

/**
 * Build the `resolveImageSrc` function the HTML converter needs.
 *
 * Looks up by basename, because that is the only part of a legacy body `src`
 * that is reliable — the three different roots in the corpus are not.
 */
export function makeSrcResolver(
  media: MediaImportResult
): (src: string) => string | null {
  return (src: string) => {
    let path = src.trim();
    if (/^https?:\/\//i.test(path)) {
      try {
        path = new URL(path).pathname;
      } catch {
        /* fall through */
      }
    }
    const name = basename(path.split('?')[0] ?? '').toLowerCase();
    return media.byLegacyName.get(name)?.url ?? null;
  };
}
