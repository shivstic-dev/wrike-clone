# Deploying Wrike Clone to Production

Connecting **Vercel** (frontend) → **Railway** (backend) → **Supabase** (database).

---

## 1. Supabase — Run New Migrations

Login to your [Supabase Dashboard](https://supabase.com), select your project, and go to **SQL Editor**.

Run the migration script to create the 6 new tables:

```sql
-- Copy the contents of scripts/deploy-supabase.sql and paste into SQL Editor
-- Or use the raw file from GitHub:
-- https://raw.githubusercontent.com/shivstic-dev/wrike-clone/main/scripts/deploy-supabase.sql
```

This creates:
- `workspace_statuses` — custom workflow statuses per workspace
- `project_templates` — blueprint templates
- `request_forms` — dynamic intake forms
- `working_hours` — per-user default working hours
- `time_off` — vacation / sick day requests
- `tenant_holidays` — company-wide holidays

---

## 2. Railway — Build & Deploy Backend

Railway auto-deploys from GitHub. The build is configured via `railway.toml`:

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm install && npm run build -w @wrike-clone/shared && npm run build -w @wrike-clone/backend"

[deploy]
startCommand = "bash scripts/railway-start.sh"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

### Required Environment Variables on Railway

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Supabase PostgreSQL connection string (use **Transaction Pooler**, port 6543) | `postgresql://postgres:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres` |
| `DB_SSL` | Must be `true` for Supabase | `true` |
| `JWT_SECRET` | JWT signing secret (generate with `node generate-secrets.js`) | — |
| `ENCRYPTION_KEY` | 64-char hex encryption key | — |
| `CORS_ORIGINS` | Your Vercel frontend URL | `https://your-project.vercel.app` |
| `DEFAULT_TENANT_SLUG` | Default tenant for single-tenant mode | `acme-corp` |
| `SETUP_KEY` | Setup key for initial admin creation | `dev-setup-key` |

The `railway-start.sh` script will automatically run Knex migrations on every deploy.

---

## 3. Vercel — Connect Frontend to Railway

### Environment Variables on Vercel

Set these in your Vercel project settings → **Environment Variables**:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Your Railway backend URL + `/api/v1` (e.g. `https://your-app.up.railway.app/api/v1`) |

### Optional: Rewrite rules

If you want to avoid CORS issues, add rewrites in `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/v1/(.*)",
      "destination": "https://your-app.up.railway.app/api/v1/$1"
    }
  ]
}
```

---

## 4. First-Time Setup

After deploying:

1. **Run the seed script** on Railway to create initial data:
   ```bash
   # Via Railway shell:
   cd packages/backend && npx ts-node ../../scripts/seed.ts
   ```

2. **Default credentials** (from seed):
   - Email: `admin@acme.com`
   - Password: `password123`
   - Must change password on first login

3. **Verify health**:
   - Backend: `https://your-app.up.railway.app/api/v1/health`
   - Frontend: `https://your-project.vercel.app`

---

## 5. Optional: AI Copilot Setup

To enable the AI Copilot (powered by OpenAI), add to Railway env:

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | Your OpenAI API key |
| `OPENAI_MODEL` | Model to use (default: `gpt-4o-mini`) |

Without these, the Copilot falls back to rule-based responses.

---

## 6. File Storage

For file uploads, set these on Railway:

| Variable | Description |
|----------|-------------|
| `STORAGE_DRIVER` | `local` (default) or `s3` |
| `S3_ENDPOINT` | S3-compatible endpoint (Cloudflare R2, AWS S3) |
| `S3_BUCKET` | Bucket name |
| `S3_REGION` | Region |
| `S3_ACCESS_KEY_ID` | Access key |
| `S3_SECRET_ACCESS_KEY` | Secret key |

---

## Troubleshooting

### "Failed to load admin data"
- Ensure `VITE_API_URL` is correctly set on Vercel pointing to Railway
- Check Railway logs: `railway logs`
- Verify the database migration has been run on Supabase

### `npm ci` fails during build
- Run `npm install` locally to update `package-lock.json`
- Commit and push the updated lockfile

### CORS errors
- Verify `CORS_ORIGINS` on Railway includes your Vercel domain
- Don't add a trailing slash to the CORS origins value
