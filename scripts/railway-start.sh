#!/usr/bin/env bash
# Railway startup: migrations must succeed before the API starts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== Work Management API Railway Startup ==="

if [ "${NODE_ENV:-}" != "production" ]; then
  echo "[ERROR] NODE_ENV must be production"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[ERROR] DATABASE_URL is required"
  exit 1
fi

echo "[INFO] Running migrations..."
cd "$SCRIPT_DIR/packages/backend"
npx knex migrate:latest --knexfile dist/database/knexfile.js
echo "[OK] Migrations applied"

echo "[INFO] Starting backend..."
npm run start:prod
