#!/usr/bin/env bash
# Railway startup: migrations must succeed before the API starts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== Work Management API Railway Startup ==="

for required in DATABASE_URL MIGRATE_DATABASE_URL; do
  if [ -z "${!required:-}" ]; then
    echo "[ERROR] $required is required"
    exit 1
  fi
done

echo "[INFO] Running migrations..."
cd "$SCRIPT_DIR/packages/backend"
npx knex migrate:latest --knexfile dist/database/knexfile.js
echo "[OK] Migrations applied"

echo "[INFO] Starting backend..."
npm run start:prod
