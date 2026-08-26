# Railway + Supabase production runbook

Use this checklist for production deploys. Railway runs `scripts/railway-start.sh`, which must finish Knex migrations before starting the API.

## Preflight

Run from the repository root with Node.js 22:

```bash
npm ci --omit=dev
npm run build
```

Confirm migration history is contiguous and includes the expected latest migration (currently 024):

```sql
select id, name, batch, migration_time
from knex_migrations
order by id;
```

Do not edit, delete, or renumber applied migrations.

## Railway variables

Set these production variables without printing their values in build or startup logs:

- `NODE_ENV=production`: required by startup; any other value fails closed before migrations.
- `DATABASE_URL`: the exact Supabase Shared Pooler URL copied from the dashboard. Railway startup and the API use this same credential.
- `MIGRATE_DATABASE_URL`: optional local fallback for migration-only workflows; Railway does not require or prefer it.
- `APP_PUBLIC_URL`: HTTPS frontend/public application origin.
- `CORS_ORIGINS`: comma-separated HTTPS browser origins, with no wildcard.
- `JWT_SECRET`: random secret of at least 32 characters.
- `DB_SSL=true`.
- `ALLOW_PUBLIC_REGISTRATION=false`.

Keep optional integrations unset unless configured. Never paste database URLs, JWT secrets, SMTP credentials, or refresh tokens into logs or tickets.

## Deploy and smoke test

Deploy the selected commit in Railway and confirm startup logs show migrations completed before the backend starts. Then run:

```bash
curl --fail https://BACKEND_HOST/api/v1/health
curl --fail https://BACKEND_HOST/api/v1/health/ready
```

Liveness may report `degraded` during a database outage, but readiness must fail with HTTP 503. After readiness succeeds, perform a login smoke test using a dedicated non-admin account and keep tokens out of shell history:

```bash
read -s -p "Password: " SMOKE_PASSWORD
curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"smoke@example.invalid\",\"password\":\"${SMOKE_PASSWORD}\",\"tenantSlug\":\"production\"}" \
  https://BACKEND_HOST/api/v1/auth/login > /dev/null
unset SMOKE_PASSWORD
```

Verify an inactive user and a removed membership cannot log in or refresh, and verify the expected row exists in `knex_migrations`.

## Rollback

Redeploy the last known-good Railway deployment. Do not roll back additive database migrations during an application rollback; leave the forward-compatible schema in place. For an incompatible schema change, stop rollout and prepare a new forward migration instead of rewriting applied history.
