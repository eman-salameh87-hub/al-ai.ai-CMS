#!/usr/bin/env python3
"""migration/fetch-missing-images.py

Fill the gaps in the local media copy from the live site.

WHY THIS EXISTS
The 748 MB `Images/` tree that came with the legacy source is not complete: 125
of the image filenames recorded in the database are not in it, 93 of them
client logos stored one directory deeper (`Uploads/{guid}.png`) than the folder
that was copied. Those files are still served by the live site, so they are
fetched rather than declared lost — a case study with no client logo is a
visibly broken page, and "the image was missing from the handover" is not
something a visitor should be able to see.

This reads only. It writes into the LOCAL copy of the legacy tree, and touches
nothing on the server.

Usage:
    python3 migration/fetch-missing-images.py                 # fetch
    python3 migration/fetch-missing-images.py --dry-run       # report only
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
# The legacy media tree, as delivered, relative to the repo's parent.
LEGACY_IMAGES = os.path.abspath(
    os.path.join(HERE, "..", "..", "NewAeonWebsite", "Images")
)
BASE = "https://new-aeon.com/Images"

# Which section folder each table's images live under. The DB stores a filename
# (or a short relative path) and the folder is implied by the table it came
# from — the one piece of the media layout that exists only in the old app's
# CommonService.SavePlace enum.
FOLDER = {
    "WhatWeDo": "WhatWeDo",
    "AdvancedServicesList": "AdvancedService",
    "Clients": "Client",
    "Achivements": "Achivment",
}

TIMEOUT = 30
# Deliberately unhurried. This is a one-off job against a live production site
# that is still serving real visitors, and 125 files do not need to be fast.
DELAY_SECONDS = 0.3


def fetch(url: str) -> bytes | None:
    request = urllib.request.Request(
        url,
        headers={
            # Identify the job. A server operator reading their logs should be
            # able to tell this apart from a scraper.
            "User-Agent": "new-aeon-migration/1.0 (one-off media backfill)",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            if response.status != 200:
                return None
            return response.read()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    manifest_path = os.path.join(OUT, "_missing-images.json")
    if not os.path.exists(manifest_path):
        print(f"error: {manifest_path} not found — run the audit first.", file=sys.stderr)
        return 1

    missing = json.load(open(manifest_path))
    # One filename can be referenced by several rows; fetch it once.
    jobs: dict[tuple[str, str], dict] = {}
    for entry in missing:
        folder = FOLDER.get(entry["table"])
        if not folder:
            continue
        jobs[(folder, entry["value"])] = entry

    print(f"{len(jobs)} distinct files to fetch\n")

    fetched = failed = skipped = 0
    still_missing = []

    for (folder, value) in sorted(jobs):
        # `value` may itself carry a subdirectory ("Uploads/x.png"). Preserve
        # it: that relative path is exactly what the old app appended to the
        # section folder, and reproducing it keeps the DB values usable as-is.
        target = os.path.join(LEGACY_IMAGES, folder, value)
        url = f"{BASE}/{folder}/{value}"

        if os.path.exists(target) and os.path.getsize(target) > 0:
            skipped += 1
            continue

        if args.dry_run:
            print(f"  would fetch  {url}")
            continue

        data = fetch(url)
        time.sleep(DELAY_SECONDS)

        if not data:
            print(f"  FAILED       {url}")
            failed += 1
            still_missing.append({"folder": folder, "value": value, "url": url})
            continue

        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as handle:
            handle.write(data)
        print(f"  {len(data):>9,d}  {folder}/{value}")
        fetched += 1

    print(f"\nfetched={fetched} failed={failed} already-present={skipped}")

    if still_missing:
        # A recorded list, not a silent gap. The importer reads this and leaves
        # the featured image null for these entries rather than writing a path
        # that 404s.
        path = os.path.join(OUT, "_unrecoverable-images.json")
        json.dump(still_missing, open(path, "w"), indent=1)
        print(f"wrote {len(still_missing)} unrecoverable references to {path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
