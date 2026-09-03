#!/usr/bin/env bash
# migration/sql.sh — run a query against the restored legacy database.
# Usage: ./migration/sql.sh "SELECT ..."   |   ./migration/sql.sh -f file.sql
set -euo pipefail
ARGS=(-S localhost -U sa -P 'LegacyMigration!2026' -C -d NewAeonLegacy -b)
if [[ "${1:-}" == "-f" ]]; then
  docker exec -i new-aeon-legacy-mssql /opt/mssql-tools18/bin/sqlcmd "${ARGS[@]}" -i /dev/stdin < "$2"
else
  docker exec -i new-aeon-legacy-mssql /opt/mssql-tools18/bin/sqlcmd "${ARGS[@]}" -Q "$1" -W -s $'\t' -w 8000
fi
