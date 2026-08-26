#!/usr/bin/env bash
# ──────────────────────────────────────────────
# Wrike Clone — Development Setup Script
# ──────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "=========================================="
echo "  Wrike Clone — Development Setup"
echo "=========================================="

# ── 1. Copy environment file ──────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "[OK] Created .env from .env.example"
    echo "     Review and update .env with your local settings."
  else
    echo "[ERROR] .env.example not found. Please create .env manually."
    exit 1
  fi
else
  echo "[SKIP] .env already exists"
fi

# ── 2. Install dependencies ──────────────────
echo ""
echo "[STEP] Installing npm dependencies..."
npm ci --include-workspace-root --no-audit --no-fund
echo "[OK] Dependencies installed"

# ── 3. Build shared package ──────────────────
echo ""
echo "[STEP] Building shared package..."
npm run build -w packages/shared
echo "[OK] Shared package built"

# ── 4. Run database migrations ───────────────
echo ""
echo "[STEP] Running database migrations..."
if command -v npx &> /dev/null && [ -f packages/backend/package.json ]; then
  npx --prefix packages/backend knex migrate:latest \
    --knexfile packages/backend/src/database/knexfile.ts 2>/dev/null \
    && echo "[OK] Migrations applied" \
    || echo "[WARN] Migrations skipped (database may not be running)"
else
  echo "[SKIP] Database migrations (knex not found)"
fi

# ── 5. Success message ───────────────────────
echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "  Start the backend:    npm run dev:backend"
echo "  Start the frontend:   npm run dev:frontend"
echo "  Start all with Docker: npm run docker:up"
echo ""
echo "  Backend API:    http://localhost:4000"
echo "  Frontend App:   http://localhost:5173"
echo "  MinIO Console:  http://localhost:9001"
echo "  Meilisearch:    http://localhost:7700"
echo ""
echo "  Default admin credentials (after seed):"
echo "    Email:    admin@acme.com"
echo "    Password: password123"
echo ""
echo "=========================================="
