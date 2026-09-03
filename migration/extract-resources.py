#!/usr/bin/env python3
"""migration/extract-resources.py

GlobalResources.resx / .ar.resx  ->  JSON.

WHAT THESE FILES ARE
The legacy site kept every non-database string in two .NET resource files: menu
labels, page headings, button text, the marketing copy on the home page, the
social URLs, and — mixed in with all of it — the FILENAMES of the home page
slider images. 43 KB of English and 46 KB of Arabic, and it is the only record
of the site's own words.

The migration assessment marks this PARTIAL, and correctly: the old CMS let an
administrator edit these strings live, while the new one keeps UI strings in
static messages/*.json. That is a real regression for the subset an
administrator actually edited. It is not a regression for the rest, which is
interface chrome that belongs in a translation file.

This script only extracts. Deciding which key becomes a message, which becomes
editable content, and which is a slider image is done in
migration/resource-map.ts, where the decision can be read.
"""
from __future__ import annotations

import json
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
LEGACY = os.path.abspath(os.path.join(HERE, "..", "..", "NewAeonWebsite"))
OUT = os.path.join(HERE, "out")

SOURCES = {
    "en": "GlobalResources.resx",
    "ar": "GlobalResources.ar.resx",
}


def read_resx(path: str) -> dict[str, str]:
    """Every <data name=...><value>...</value></data> pair.

    .resx also carries <resheader> and <assembly> elements describing the file
    format itself; only <data> holds strings. Elements whose value is a
    serialised object (they carry a `mimetype`) are skipped — there are none in
    these two files, but reading one as text would silently produce garbage.
    """
    tree = ET.parse(path)
    out: dict[str, str] = {}

    for data in tree.getroot().findall("data"):
        name = data.get("name")
        if not name:
            continue
        if data.get("mimetype"):
            continue
        value = data.find("value")
        text = value.text if value is not None else None
        out[name] = "" if text is None else text

    return out


# A value that is a media filename rather than a phrase: the legacy CMS stored
# slider image names in the resource file, which is why "Index_Slider1" sits
# next to a GUID.
GUID_FILENAME = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$",
    re.IGNORECASE,
)
URL_VALUE = re.compile(r"^(https?://|/)", re.IGNORECASE)


def classify(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        return "empty"
    if GUID_FILENAME.match(stripped):
        return "media"
    if URL_VALUE.match(stripped):
        return "url"
    return "text"


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    bundles: dict[str, dict[str, str]] = {}

    for locale, filename in SOURCES.items():
        path = os.path.join(LEGACY, filename)
        if not os.path.exists(path):
            print(f"error: {path} not found", file=sys.stderr)
            return 1
        bundles[locale] = read_resx(path)
        print(f"{locale}: {len(bundles[locale])} keys from {filename}")

    en = bundles["en"]
    ar = bundles["ar"]

    all_keys = sorted(set(en) | set(ar))
    combined: dict[str, dict[str, object]] = {}
    counts: dict[str, int] = {}

    for key in all_keys:
        english = en.get(key, "")
        arabic = ar.get(key, "")
        # Classified on the English value, falling back to Arabic — the two are
        # the same KIND of thing even when only one is filled in.
        kind = classify(english) if english.strip() else classify(arabic)
        counts[kind] = counts.get(kind, 0) + 1
        combined[key] = {
            "kind": kind,
            "en": english,
            "ar": arabic,
            # Flagged rather than filtered: a key present in one locale only is
            # a gap in the legacy content, and the report should say so instead
            # of the migration quietly picking a side.
            "missing": [
                locale
                for locale, value in (("en", english), ("ar", arabic))
                if not value.strip()
            ],
        }

    path = os.path.join(OUT, "_resources.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(combined, handle, ensure_ascii=False, indent=1)

    print(f"\n{len(all_keys)} keys total")
    for kind, count in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {count:5d}  {kind}")

    only_en = [k for k, v in combined.items() if v["missing"] == ["ar"]]
    only_ar = [k for k, v in combined.items() if v["missing"] == ["en"]]
    print(f"\nEnglish only: {len(only_en)}   Arabic only: {len(only_ar)}")

    print(f"\nwrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
