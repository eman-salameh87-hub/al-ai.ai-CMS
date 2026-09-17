#!/usr/bin/env bash
# migration/dump-legacy.sh
#
# Dump every legacy table to JSON in migration/out/, one file per table.
#
# WHY JSON AND NOT CSV
# Half these columns are nvarchar(max) holding raw HTML written by editors over
# fifteen years — unescaped quotes, embedded newlines, stray <br> — and CSV
# quoting that content correctly is a guessing game the importer would have to
# reverse. `FOR JSON` makes SQL Server do the escaping, and it is the same
# server that stored the bytes.
#
# The dump is generated INSIDE the container and copied out, rather than piped
# through sqlcmd's stdout: sqlcmd wraps FOR JSON results at 2033 characters per
# row and reassembling those is exactly the kind of subtle corruption that
# would show up months later as a truncated case study.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="new-aeon-legacy-mssql"
SQLCMD='/opt/mssql-tools18/bin/sqlcmd'
SA_PASS="LegacyMigration!2026"
DB="NewAeonLegacy"
OUT="$HERE/out"

# The content tables. Submissions are dumped by a separate, explicit target
# below because they are personal data — see the note there.
CONTENT_TABLES=(
  WhatWeDo AdvancedServicesList Clients Achivements
  Category Country Client_Category Client_Country
  Blogs BlogCategory NewsAndUpDate
  AvailableJobs TrainingAvailable ourDepartment
  LookupMaster LookupDetails Users
)

# Enquiries, newsletter sign-ups and job applications. Real people's names,
# email addresses and CV filenames. Dumped only when asked for, never by
# default, and migration/out/ is in .gitignore.
SUBMISSION_TABLES=(ContactUs Newsletter JopsApplay TrainingApplay)

TABLES=("${CONTENT_TABLES[@]}")
if [[ "${1:-}" == "--with-submissions" ]]; then
  TABLES+=("${SUBMISSION_TABLES[@]}")
  echo "==> Including submission tables (personal data)"
fi

mkdir -p "$OUT"
docker exec "$CONTAINER" mkdir -p /tmp/dump

for table in "${TABLES[@]}"; do
  printf '%-24s' "$table"

  # -y 0 lifts sqlcmd's 256-character display cap on the single JSON column;
  # without it every case-study body is truncated mid-sentence. It cannot be
  # combined with -h, so the header row is stripped by the normaliser below.
  #
  # WITHOUT_ARRAY_WRAPPER is deliberately NOT used: a top-level array is what
  # JSON.parse gives straight back as a list of rows. INCLUDE_NULL_VALUES keeps
  # a missing image slot present-and-null rather than absent, so the importer
  # can tell "no value" from "column does not exist" — the difference between
  # a legitimately empty field and a dump that silently lost a column.
  docker exec "$CONTAINER" "$SQLCMD" -S localhost -U sa -P "$SA_PASS" -C -d "$DB" -b \
    -o "/tmp/dump/${table}.json" -y 0 -Y 0 \
    -Q "SET NOCOUNT ON; SELECT * FROM [dbo].[${table}] FOR JSON PATH, INCLUDE_NULL_VALUES;"

  docker cp "$CONTAINER:/tmp/dump/${table}.json" "$OUT/${table}.json" >/dev/null

  # sqlcmd writes a trailing newline and, for an empty table, the literal
  # string "NULL" rather than "[]". Normalise both here so every consumer can
  # assume a parseable array — an empty Blogs table is a real case in this
  # database, not a hypothetical.
  python3 - "$OUT/${table}.json" <<'PY'
import json, sys
path = sys.argv[1]
raw = open(path, encoding='utf-8-sig').read()
# Drop sqlcmd's header line and its dashed rule, then rejoin: FOR JSON's own
# output contains no newlines, but sqlcmd frames it with them.
lines = [l for l in raw.split('\n') if l.strip() and not set(l.strip()) <= set('-')]
if lines and lines[0].startswith('JSON_'):
    lines = lines[1:]
raw = ''.join(lines).strip()
rows = [] if raw in ('', 'NULL') else json.loads(raw)
json.dump(rows, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(rows):6d} rows')
PY
done

echo
echo "Wrote $OUT ($(du -sh "$OUT" | cut -f1))"
