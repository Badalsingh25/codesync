#!/usr/bin/env bash
#
# Nightly MySQL backup for the CBC project.
#
# There was previously no backup mechanism at all — this dumps the database
# from the running `db` container, compresses it, keeps a rolling window of
# recent backups, and prunes anything older. Run it via cron (see the
# example at the bottom of this file); an untested/unscheduled backup is not
# a backup, so make sure you actually verify a restore at least once.
#
# Usage: ./scripts/backup-db.sh
# Expects to be run from the project root (where docker-compose.yml and
# .env live), or with PROJECT_DIR set to that path.

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$PROJECT_DIR"

# shellcheck disable=SC1091
source .env

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%F_%H-%M-%S)"
OUT_FILE="$BACKUP_DIR/cbc-${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup-db] Dumping database '${MYSQL_DATABASE}' to $OUT_FILE ..."
docker compose exec -T db \
    mysqldump -u root -p"${MYSQL_ROOT_PASSWORD}" \
    --single-transaction --routines --triggers \
    "${MYSQL_DATABASE}" | gzip > "$OUT_FILE"

echo "[backup-db] Wrote $(du -h "$OUT_FILE" | cut -f1) to $OUT_FILE"

echo "[backup-db] Pruning backups older than ${RETENTION_DAYS} days ..."
find "$BACKUP_DIR" -name 'cbc-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete

echo "[backup-db] Done. Remember: a backup that only lives on this same disk"
echo "[backup-db] does not protect you from disk/host failure — copy $BACKUP_DIR"
echo "[backup-db] off this host regularly (S3, DO Spaces, rsync to another"
echo "[backup-db] machine, etc.), and periodically test restoring one."

# ---------------------------------------------------------------------------
# Example crontab entry (edit with: crontab -e), running nightly at 2:30am:
#
#   30 2 * * * PROJECT_DIR=/home/deploy/cbc /home/deploy/cbc/scripts/backup-db.sh >> /var/log/cbc-backup.log 2>&1
#
# To restore a backup for a sanity check:
#   gunzip -c backups/cbc-2026-09-18_02-30-00.sql.gz | \
#     docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" cbc_restore_test
# (restore into a scratch database, never directly over the live one, unless
# you are intentionally doing a real disaster-recovery restore.)
# ---------------------------------------------------------------------------
