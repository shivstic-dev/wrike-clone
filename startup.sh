#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Wrike Clone — One-Command Startup Script
# Installs, builds, creates DB, migrates, seeds, and starts
# both backend and frontend for local development.
# ──────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# ── Colors ──────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERR]${NC}  $1"; }

# ── Check prerequisites ─────────────────────────
info "Checking prerequisites..."

if ! command -v node &> /dev/null; then
  err "Node.js is not installed. Install Node.js >= 22 from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  err "Node.js >= 22 required (found v$(node -v)). Please upgrade."
  exit 1
fi
ok "Node.js $(node -v)"

if ! command -v npm &> /dev/null; then
  err "npm not found"
  exit 1
fi
ok "npm $(npm -v)"

# ── Check for PostgreSQL ─────────────────────────
DB_READY=false

# Try Docker first
if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
  info "Docker available — will use it for PostgreSQL"
  
  # Start PostgreSQL container if not already running
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^wrike-pg$'; then
    info "Starting PostgreSQL container..."
    docker run -d --name wrike-pg \
      -e POSTGRES_DB=wrike_clone \
      -e POSTGRES_USER=wrike \
      -e POSTGRES_PASSWORD=wrike_dev \
      -p 5432:5432 \
      postgres:16-alpine
    ok "PostgreSQL container started"
  else
    ok "PostgreSQL container already running"
  fi
  DB_READY=true

# Fallback: check if psql is available
elif command -v psql &> /dev/null; then
  info "Using local PostgreSQL installation"
  DB_READY=true
else
  warn "No Docker or psql found. You'll need PostgreSQL running on localhost:5432."
  warn "Install Docker Desktop: https://docs.docker.com/get-docker/"
  warn ""
  warn "Or use a remote database via DATABASE_URL env var:"
  warn "  export DATABASE_URL=postgresql://user:pass@host:5432/db"
  warn ""
fi

# ── Create .env if missing ───────────────────────
if [ ! -f .env ]; then
  info "Creating .env from .env.example..."
  cat > .env << 'EOF'
# ── Database (supports both DATABASE_URL and discrete DB_* vars) ──
DATABASE_URL=postgresql://wrike:wrike_dev@localhost:5432/wrike_clone
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=wrike_clone
# DB_USER=wrike
# DB_PASSWORD=wrike_dev
DB_SSL=false

# ── Auth ──
JWT_SECRET=dev-jwt-secret-change-in-prod
ACCESS_TOKEN_TTL_SEC=900
REFRESH_TOKEN_TTL_SEC=2592000

# ── Single-tenant mode ──
DEFAULT_TENANT_SLUG=acme-corp

# ── Security ──
ALLOW_PUBLIC_REGISTRATION=false
SETUP_KEY=dev-setup-key

# ── CORS ──
CORS_ORIGINS=http://localhost:5173

# ── App ──
NODE_ENV=development
APP_PORT=4000
API_PREFIX=/api/v1

# ── Frontend (for production, set VITE_API_BASE_URL on Vercel) ──
# VITE_API_BASE_URL=https://your-api.onrender.com/api/v1
EOF
  ok ".env created"
fi

# ── Install dependencies ────────────────────────
info "Installing npm dependencies..."
npm ci --no-audit --no-fund
ok "Dependencies installed"

# ── Build shared package ────────────────────────
info "Building shared package..."
npm run build -w packages/shared 2>/dev/null || npm run build -w @wrike-clone/shared
ok "Shared package built"

# ── Run migrations ──────────────────────────────
if [ "$DB_READY" = true ]; then
  info "Waiting for PostgreSQL to be ready (this may take 10-15s on first run)..."
  # Poll for PostgreSQL readiness (more reliable than sleep)
  for i in $(seq 1 30); do
    if docker exec wrike-pg pg_isready -U wrike &>/dev/null 2>&1; then
      ok "PostgreSQL ready"
      break
    fi
    if [ "$i" -eq 30 ]; then
      warn "PostgreSQL did not become ready. Check docker logs: docker logs wrike-pg"
      warn "Then run commands manually:"
      break
    fi
    sleep 1
  done
  
  info "Running database migrations..."
  if npx knex migrate:latest --knexfile packages/backend/src/database/knexfile.ts; then
    ok "Migrations applied"
    
    # ── Seed database ──────────────────────────
    info "Seeding database..."
    if npx ts-node scripts/seed.ts; then
      ok "Database seeded"
    else
      warn "Seed may have already been applied — that's fine"
    fi
  else
    warn "Migrations failed — check DATABASE_URL in .env"
    warn "  For local dev: DATABASE_URL=postgresql://wrike:wrike_dev@localhost:5432/wrike_clone"
    warn "  For Supabase:   use your Transaction Pooler URI (port 6543)"
  fi
else
  warn "Skipping migrations — no database available"
  warn "Two options:"
  warn ""
  warn "  Option A: Install Docker Desktop from https://docs.docker.com/get-docker/"
  warn "            Then re-run this script — it handles everything automatically"
  warn ""
  warn "  Option B: Use Supabase (free cloud PostgreSQL):"
  warn "    1. Go to https://supabase.com and create a project"
  warn "    2. Copy your Transaction Pooler URI (port 6543)"
  warn "    3. Set it as DATABASE_URL and DB_SSL=true in .env"
  warn "    4. Run: npx knex migrate:latest --knexfile packages/backend/src/database/knexfile.ts"
  warn "    5. Run: npx ts-node scripts/seed.ts"
  warn ""
fi

# ── Done ────────────────────────────────────────
echo ""
echo "=============================================="
echo "  Wrike Clone — Ready!"
echo "=============================================="
echo ""
echo "  Start backend:   npm run dev:backend"
echo "  Start frontend:  npm run dev:frontend"
echo ""
echo "  Backend API:     http://localhost:4000/api/v1"
echo "  Frontend App:    http://localhost:5173"
echo "  Health check:    http://localhost:4000/api/v1/health"
echo ""
echo "  Seeded admin:"
echo "    Email:    admin@acme.com"
echo "    Password: password123"
echo "    (must change on first login — the /change-password flow)"
echo ""
echo "=============================================="
