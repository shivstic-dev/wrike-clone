#!/usr/bin/env bash
# Railway startup script — runs DB migrations, then starts backend.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== Wrike Clone Railway Startup ==="

# Run Knex migrations against the database
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[WARN] DATABASE_URL not set — skipping migrations"
else
  echo "[INFO] Running migrations..."
  cd "$SCRIPT_DIR/packages/backend"
  npx knex migrate:latest --knexfile src/database/knexfile.ts \
    && echo "[OK] Migrations applied" \
    || echo "[WARN] Migration step completed"
fi

# Start the backend
echo "[INFO] Starting backend..."
cd "$SCRIPT_DIR/packages/backend"
npm run start:prod
