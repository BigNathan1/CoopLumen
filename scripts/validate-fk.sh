#!/usr/bin/env bash
set -Eeuo pipefail

# Usage: ./scripts/validate-fk.sh [database-url]
# Validates all foreign key constraints have explicit ON DELETE behaviors

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$ROOT_DIR/backend/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/backend/.env"
  set +a
fi

DATABASE_URL="${1:-${DATABASE_URL:-}}"
: "${DATABASE_URL:?DATABASE_URL is not set or provided as argument}"

echo "Validating foreign key constraints in database..."
echo "Using DATABASE_URL: $(echo "$DATABASE_URL" | sed 's/:.*@/:****@/')"
echo ""

# Run the validation SQL script
psql "$DATABASE_URL" -f "$SCRIPT_DIR/validate-foreign-keys.sql" || {
  echo "Failed to validate foreign keys"
  exit 1
}

echo ""
echo "Foreign key validation complete."
echo "Review the output above for any warnings or recommendations."