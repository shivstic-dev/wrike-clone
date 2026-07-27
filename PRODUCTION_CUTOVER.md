# Production cutover

## Current verified state

- Vercel production is public at `https://wrike-clone-three.vercel.app`.
- Its deployed bundle targets
  `https://wrike-clone-production-9894.up.railway.app/api/v1`.
- Railway health and CORS preflight from the production Vercel origin return
  successfully.
- Supabase project `lsjeobyrmxiqewehhjai` is healthy in `ap-south-1`.
- Supabase has 34 public application tables, 34 RLS-enabled tables, a private
  `work-management-files` bucket, and the non-bypass `openwork_app` role.
- Supabase security advisors return no findings.
- A rollback-only live test confirmed that `openwork_app` sees exactly one
  tenant when two tenant rows exist.

## Railway changes required before deploying this branch

Railway is not connected to Codex, so update these variables in its dashboard
using `.env.production.example` as the template:

1. Set the Supabase transaction-pooler `DATABASE_URL` and `DB_SSL=true`.
2. Set `DB_APP_ROLE=openwork_app`. Without this, the API intentionally refuses
   to start in production.
3. Generate new independent values for `JWT_SECRET`, `ENCRYPTION_KEY`, and
   `SETUP_KEY`.
4. Set `CORS_ORIGINS=https://wrike-clone-three.vercel.app`.
5. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
   `SUPABASE_STORAGE_BUCKET=work-management-files`.
6. Set `APP_PUBLIC_URL=https://wrike-clone-three.vercel.app`.
7. Configure a verified SMTP account (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
   `SMTP_PASS`, `EMAIL_FROM`) and keep
   `NOTIFICATION_CRON="0 */15 * * * *"` with
   `DEADLINE_ALERT_HOURS=48,24,0`.
8. Keep `ALLOW_PUBLIC_REGISTRATION=false`.

The Supabase database is currently empty. Export/import any Railway PostgreSQL
data before changing `DATABASE_URL`; do not point production to Supabase until
row counts and tenant IDs have been reconciled.

The new JWT issuer/audience checks invalidate access tokens created by the old
backend. Existing users will need to sign in again after the backend cutover.

For a new empty database, send this request once from a trusted terminal after
Railway is healthy:

```http
POST /api/v1/tenants/bootstrap
x-setup-key: <SETUP_KEY>
Content-Type: application/json

{
  "tenant": { "name": "Your Organization", "slug": "your-organization" },
  "admin": {
    "email": "admin@example.com",
    "password": "<new-strong-password>",
    "displayName": "Administrator"
  }
}
```

The tenant, administrator, and admin membership are created in one database
transaction. A duplicate tenant slug or administrator email is rejected.

## Security actions outside code

1. Revoke the GitHub personal access token that was previously embedded in the
   local Git remote.
2. Delete or rotate the deployed `demo` tenant and `admin@demo.com` credentials.
3. Enable GitHub secret scanning, Dependabot, required CI checks, and branch
   protection for `main`.
4. Keep Vercel previews protected, but keep only the intended production alias
   public.
5. Enable GitHub private vulnerability reporting as described in `SECURITY.md`.

## Release order

1. Back up the existing Railway database.
2. Restore that backup into a disposable database and run a smoke query; a
   backup that has not been restored is not yet verified.
3. Import data into Supabase and verify counts per tenant.
4. Configure Railway variables.
5. Deploy the backend and verify `/api/v1/health/ready`.
6. For a fresh empty database, create the first organization and administrator
   atomically with `POST /api/v1/tenants/bootstrap` and the `x-setup-key`
   header. Do not expose `SETUP_KEY` to the browser.
7. Test login, refresh rotation, tenant isolation, task CRUD, comments, and file
   upload/download.
8. Deploy the Vercel frontend with `VITE_API_URL` pointing to the verified
   Railway backend.
9. Monitor Railway logs, Supabase advisors, and Vercel runtime errors.

## Railway variable corrections from the previous environment

- Keep `NODE_ENV=production`, `PORT=4000`, `DB_SSL=true`,
  `DB_MAX_CONNECTIONS=10`, and `DB_IDLE_TIMEOUT_MS=10000`.
- Change `API_PREFIX` from `api/v1` to `/api/v1`.
- Replace `DATABASE_URL` with the current Supabase project's exact transaction
  pooler URI from **Supabase Dashboard → Connect**. Do not reuse the previous
  project password or guess the pooler host.
- Rotate `JWT_SECRET`; the previously shared value must not be reused.
- Remove localhost from production `CORS_ORIGINS`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, SMTP credentials, database
  credentials, or application secrets in Vercel frontend variables.
