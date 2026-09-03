// lib/media/drivers/local.ts
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageDriver } from './types';

/**
 * Local-disk driver — the original behaviour, unchanged.
 *
 * UPLOAD_DIR is a filesystem path; the browser needs a URL. Those are two
 * different things and conflating them is why the earliest drafts had no
 * working pipeline. Files land under `<UPLOAD_DIR>/<key>` and are served from
 * `/uploads/<key>` because Next serves `public/` at the web root.
 *
 * This driver stays reachable even when STORAGE_DRIVER=s3: rows uploaded before
 * the switch still carry `/uploads/...` URLs and only this code can delete them.
 */
const PUBLIC_PREFIX = '/uploads/';

function uploadRoot(): string {
  return process.env.UPLOAD_DIR || './public/uploads';
}

export const localDriver: StorageDriver = {
  name: 'local',

  async put(key, body) {
    const target = path.join(uploadRoot(), key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return `${PUBLIC_PREFIX}${key}`;
  },

  async get(key) {
    const root = path.resolve(uploadRoot());
    const target = path.resolve(root, key);

    // Same containment check as `remove`, and for the same reason: resolve
    // first, then compare. A key is generated server-side and should never
    // escape the root, but this is the call that turns a bad one into an
    // arbitrary file read.
    if (!target.startsWith(root + path.sep)) return null;

    try {
      return { body: await readFile(target) };
    } catch {
      return null;
    }
  },

  async remove(url) {
    if (!this.owns(url)) return;

    const relative = url.slice(PUBLIC_PREFIX.length);
    const root = path.resolve(uploadRoot());
    const target = path.resolve(root, relative);

    // A tampered `/uploads/../../etc/passwd` resolves outside the root and is
    // dropped. Checking after resolve is the only ordering that works —
    // inspecting the string first can be defeated by encoding.
    if (!target.startsWith(root + path.sep)) return;

    try {
      await unlink(target);
    } catch {
      // Already gone — deleting the database row is still the right outcome.
    }
  },

  owns(url) {
    return url.startsWith(PUBLIC_PREFIX);
  },
};
