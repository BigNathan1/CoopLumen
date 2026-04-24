#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/backup-db.sh [output-dir]
# Reads DATABASE_URL from environment or .env file.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$ROOT_DIR/backend/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/backend/.env"
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL is not set}"

OUTPUT_DIR="${1:-$ROOT_DIR/backups}"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$OUTPUT_DIR/cooplumen_${TIMESTAMP}.dump"

echo "Backing up database to $BACKUP_FILE..."
pg_dump --format=custom --no-acl --no-owner "$DATABASE_URL" > "$BACKUP_FILE"

echo "Backup complete: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

# Retain only the 10 most recent backups
BACKUP_COUNT=$(find "$OUTPUT_DIR" -name "cooplumen_*.dump" | wc -l)
if [ "$BACKUP_COUNT" -gt 10 ]; then
  find "$OUTPUT_DIR" -name "cooplumen_*.dump" \
    | sort \
    | head -n "$(( BACKUP_COUNT - 10 ))" \
    | xargs rm -f
  echo "Pruned old backups (kept 10 most recent)"
fi
