#!/usr/bin/env bash
# migration/restore-legacy.sh
#
# Bring up the throwaway SQL Server and restore NewAeonDataBaseBac.bak into it.
#
# Idempotent: running it twice restores over the top rather than failing, so it
# is safe to re-run after a container restart or a fresh copy of the backup.
#
# Usage:  ./migration/restore-legacy.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$HERE/docker-compose.legacy.yml"
CONTAINER="new-aeon-legacy-mssql"
BAK="/backups/NewAeonDataBaseBac.bak"
DB="NewAeonLegacy"
SA_PASS="LegacyMigration!2026"

# sqlcmd moved between image generations and the old path is a symlink that is
# not always present. Resolve it once rather than hardcoding a guess.
SQLCMD='/opt/mssql-tools18/bin/sqlcmd'

if [[ ! -f "$HERE/legacy-db/NewAeonDataBaseBac.bak" ]]; then
  echo "error: migration/legacy-db/NewAeonDataBaseBac.bak is missing." >&2
  echo "       Extract it with: bsdtar -xvf NewAeonDataBaseBac.rar -C migration/legacy-db" >&2
  exit 1
fi

echo "==> Starting SQL Server (amd64 under emulation; first boot takes a while)"
docker compose -f "$COMPOSE" up -d

echo "==> Waiting for it to accept connections"
for i in $(seq 1 60); do
  if docker exec "$CONTAINER" "$SQLCMD" -S localhost -U sa -P "$SA_PASS" -C \
      -Q "SELECT 1" >/dev/null 2>&1; then
    echo "    ready after ${i}0s"
    break
  fi
  if [[ $i -eq 60 ]]; then
    echo "error: SQL Server did not come up. Logs:" >&2
    docker compose -f "$COMPOSE" logs --tail=40 legacy-mssql >&2
    exit 1
  fi
  sleep 10
done

# The backup's logical file names are baked into the .bak and are NOT the
# database name we restore as. Read them rather than assuming: guessing here is
# the usual reason a restore fails with "Logical file is not part of database".
echo "==> Reading logical file names from the backup"
docker exec "$CONTAINER" "$SQLCMD" -S localhost -U sa -P "$SA_PASS" -C \
  -Q "RESTORE FILELISTONLY FROM DISK = N'$BAK'" -W -s "|"

echo "==> Restoring as [$DB]"
docker exec "$CONTAINER" "$SQLCMD" -S localhost -U sa -P "$SA_PASS" -C -b -Q "
IF DB_ID(N'$DB') IS NOT NULL
BEGIN
    ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
END
RESTORE DATABASE [$DB]
FROM DISK = N'$BAK'
WITH
    MOVE N'NewAeonDataBaseBac_Data' TO N'/var/opt/mssql/data/${DB}.mdf',
    MOVE N'NewAeonDataBaseBac_Log'  TO N'/var/opt/mssql/data/${DB}_log.ldf',
    REPLACE, RECOVERY;
ALTER DATABASE [$DB] SET MULTI_USER;
"

echo "==> Tables restored"
docker exec "$CONTAINER" "$SQLCMD" -S localhost -U sa -P "$SA_PASS" -C -d "$DB" -W -s "|" -Q "
SELECT t.name, p.rows
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
ORDER BY p.rows DESC;
"

echo
echo "Done. Connect with:"
echo "  docker exec -it $CONTAINER $SQLCMD -S localhost -U sa -P '$SA_PASS' -C -d $DB"
echo "Or from the host on localhost:1434 (sa / $SA_PASS)."
