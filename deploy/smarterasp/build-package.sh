#!/usr/bin/env bash
# deploy/smarterasp/build-package.sh
#
# Assembles the exact folder to upload to SmarterASP.NET.
#
# WHY THIS IS NOT JUST `next build`
# Three things Next's standalone output does not do for you, and two of them
# are silent failures on a Windows host:
#
#   1. Static assets. Standalone omits `.next/static` and `public/` by design,
#      on the assumption a CDN serves them. Nothing here does, so they are
#      copied in.
#
#   2. argon2 — THE BLOCKING ONE. It hashes admin passwords. Next's file
#      tracing copies only the binary for the machine that ran the build, so a
#      package built on a Mac ships `darwin-arm64` and, on Windows, fails to
#      load. The symptom is not a crash on boot: it is nobody being able to log
#      in to the admin, ever. The package ships a win32-x64 prebuild; this
#      copies it in.
#
#   3. sharp — generates image thumbnails and reads dimensions. Same
#      platform-specific problem, but it degrades gracefully (lib/media/storage
#      treats it as optional), so a wrong binary costs you thumbnails rather
#      than the site. Fetched anyway.
#
# Usage:
#   ./deploy/smarterasp/build-package.sh
#
# Then upload the contents of deploy/smarterasp/out/ to your site root.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/out"

cd "$ROOT"

# ─── Guard: the build bakes in the public URL ────────────────────────────────
#
# NEXT_PUBLIC_APP_URL is read at BUILD time and ends up in og:image, canonical
# tags and the sitemap. Building with the wrong one produces a site that works
# and quietly advertises the wrong domain everywhere, which is the sort of
# thing nobody notices until a link is shared.
: "${NEXT_PUBLIC_APP_URL:?Set NEXT_PUBLIC_APP_URL to the live domain first, e.g. export NEXT_PUBLIC_APP_URL=https://new-aeon.com}"

# The previous package first. It contains a partial copy of the source tree,
# and `next build` will happily typecheck it and fail on imports that were
# never traced into it — a confusing error about a file you did not edit.
rm -rf "$OUT"

echo "==> Building with NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL"

# A `next start` still running holds files in .next open, and `rm -rf` then
# fails with "Directory not empty" — which under `set -e` kills the build for a
# reason that has nothing to do with the build. Next overwrites what it needs
# anyway, so a failed clean is not fatal.
rm -rf .next 2>/dev/null || echo "    (could not fully clean .next — a dev server may be running; continuing)"

npx next build

if [[ ! -f .next/standalone/server.js ]]; then
  echo "error: no standalone output. next.config.ts must have output: 'standalone'." >&2
  exit 1
fi

echo "==> Assembling package"
mkdir -p "$OUT"
cp -R .next/standalone/. "$OUT/"

# Static assets standalone deliberately leaves behind.
mkdir -p "$OUT/.next"
cp -R .next/static "$OUT/.next/static"
# `public` is usually already copied by the tracer, but not always — and it is
# where 168 MB of imported media lives, so it is not something to leave to
# chance.
[[ -d public ]] && cp -R public/. "$OUT/public/"

echo "==> Swapping native binaries for win32-x64"

# argon2: the package ships every platform's prebuild; copy the whole set so
# the loader finds the right one whatever the host turns out to be.
if [[ -d node_modules/argon2/prebuilds ]]; then
  mkdir -p "$OUT/node_modules/argon2/prebuilds"
  cp -R node_modules/argon2/prebuilds/. "$OUT/node_modules/argon2/prebuilds/"
  echo "    argon2 prebuilds: $(ls "$OUT/node_modules/argon2/prebuilds" | tr '\n' ' ')"
else
  echo "    WARNING: argon2 prebuilds not found — admin login will fail on Windows" >&2
fi

# sharp: only the host platform's binary is installed locally.
#
# `npm install` REFUSES to fetch it — @img/sharp-win32-x64 declares
# `cpu: [x64]` and `os: [win32]`, and npm rejects the install on an arm64 Mac
# even with --os/--cpu. `npm pack` has no such check: it just downloads the
# tarball, which is all that is wanted here. That is why this is a pack-and-
# extract rather than an install.
SHARP_VERSION="$(node -p "require('./node_modules/sharp/package.json').version")"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

fetch_pkg() {
  # $1 = package spec, $2 = destination directory
  local spec="$1" dest="$2" tarball
  ( cd "$SCRATCH" && npm pack "$spec" --silent >/dev/null 2>&1 ) || return 1
  tarball="$(ls "$SCRATCH"/*.tgz 2>/dev/null | head -1)" || return 1
  [[ -n "$tarball" ]] || return 1
  mkdir -p "$dest"
  tar -xzf "$tarball" -C "$dest" --strip-components=1
  rm -f "$tarball"
}

if fetch_pkg "@img/sharp-win32-x64@${SHARP_VERSION}" \
             "$OUT/node_modules/@img/sharp-win32-x64"; then
  echo "    sharp win32-x64 @ ${SHARP_VERSION} added"
else
  echo "    WARNING: could not fetch sharp for win32 — thumbnails will be skipped" >&2
fi

# Newer sharp keeps libvips in a sibling package. Absent on some versions,
# which is not an error.
if fetch_pkg "@img/sharp-libvips-win32-x64" \
             "$OUT/node_modules/@img/sharp-libvips-win32-x64" 2>/dev/null; then
  echo "    sharp libvips win32-x64 added"
fi

echo "==> Trimming what a running site does not need"
# Build-time and repo-only material the tracer swept in. None of it is loaded
# at runtime; it is ~12 MB of confusion sitting on a public server.
rm -rf "$OUT/node_modules/typescript" \
       "$OUT/node_modules/.bin" \
       "$OUT/e2e" "$OUT/tests" "$OUT/docs" "$OUT/prompt-archive" \
       "$OUT/test-results" "$OUT/migration" "$OUT/scripts" "$OUT/docker" \
       "$OUT/tsconfig.tsbuildinfo" "$OUT/package-lock.json" \
       "$OUT/playwright.config.ts" "$OUT/vitest.config.mts" \
       "$OUT/eslint.config.mjs" "$OUT/docker-compose.yml" "$OUT/railway.json" \
       2>/dev/null || true

# The IIS configuration that starts Node.
cp "$HERE/web.config" "$OUT/web.config"

# Where httpPlatformHandler writes stdout. It will not create this itself, and
# without it the log is silently dropped — which is the one thing you need when
# a deploy does not come up.
mkdir -p "$OUT/logs"

echo
echo "─── PACKAGE READY ───"
echo "  $OUT"
du -sh "$OUT"
echo
echo "  of which:"
du -sh "$OUT/public/uploads" "$OUT/node_modules" "$OUT/.next" 2>/dev/null | sed 's/^/    /'
echo
echo "Next:"
echo "  1. Edit $OUT/web.config — every REPLACE_ME."
echo "  2. Upload the CONTENTS of that folder to your site root (wwwroot)."
echo "  3. public/uploads is 168 MB — upload it once; later deploys can skip it."
