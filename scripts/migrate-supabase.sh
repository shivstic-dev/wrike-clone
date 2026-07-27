#!/usr/bin/env bash
# Supabase Migration Runner
# Usage: bash scripts/migrate-supabase.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION_FILE="$SCRIPT_DIR/scripts/deploy-supabase.sql"

echo "=== Wrike Clone — Supabase Migration ==="

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "[ERROR] Migration file not found: $MIGRATION_FILE"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Enter your Supabase DATABASE_URL (Transaction Pooler, port 6543):"
  read -rp "> " DATABASE_URL
  if [ -z "$DATABASE_URL" ]; then
    echo "[ERROR] No URL provided. Exiting."
    exit 1
  fi
fi

echo "Target: $(echo "$DATABASE_URL" | sed 's/\/\/[^:]*:[^@]*@/\/\/user:***@/')"
echo "Tables: workspace_statuses, project_templates, request_forms, working_hours, time_off, tenant_holidays"
read -rp "Proceed? (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Cancelled."
  exit 0
fi

if command -v psql &> /dev/null; then
  psql "$DATABASE_URL" -f "$MIGRATION_FILE" -v ON_ERROR_STOP=1 \
    && echo "[OK] Migration applied via psql" \
    || { echo "[ERROR] Failed"; exit 1; }
else
  echo "[INFO] psql not found."
  echo ""
  echo "Option 1: Install psql (recommended)"
  echo "  macOS: brew install libpq"
  echo "  Ubuntu: sudo apt install postgresql-client"
  echo ""
  echo "Option 2: Run the SQL manually in Supabase SQL Editor"
  echo "  1. Open https://supabase.com -> SQL Editor"
  echo "  2. Copy scripts/deploy-supabase.sql contents"
  echo "  3. Paste and run"
  echo ""
  echo "Option 3: Use Railway shell"
  echo "  railway run bash scripts/migrate-supabase.sh"
  exit 1
fi

echo "=== Migration Complete! ==="
