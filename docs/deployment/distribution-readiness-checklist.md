# CEPAA distribution readiness checklist

Last verified: 2026-08-08

This checklist records non-secret production evidence for the internal CEPAA rollout. It does not contain passwords, tokens, connection strings, or SMTP credentials.

## Verified automatically

- [x] Production frontend `https://wrike-clone-three.vercel.app` returns HTTP 200.
- [x] Railway API `/api/v1/health` returns HTTP 200 with a successful Supabase database check.
- [x] Railway API `/api/v1/health/ready` returns HTTP 200 and `ready`.
- [x] CORS preflight returns HTTP 204 and permits only the production Vercel origin used by CEPAA.
- [x] GitHub reports successful Vercel and Railway deployments for production commit `0dabeb7cb127b009fb987c28281d969ddece689a`.
- [x] Supabase project `lsjeobyrmxiqewehhjai` is `ACTIVE_HEALTHY` in `ap-south-1` on PostgreSQL 17.
- [x] Production contains one tenant, five active users, two workspace managers, and 120 tasks.
- [x] All five active users have logged in at least once.
- [x] The latest Knex migration and both handoff integrity constraints are present.
- [x] Both handoff user foreign keys have covering indexes. Supabase no longer reports unindexed foreign keys.
- [x] Supabase Security Advisor reports no findings.
- [x] All 36 application tables in `public` have RLS enabled. The only two public tables without RLS are Knex's internal migration metadata tables, and Security Advisor reports no exposure finding for them.
- [x] The database is approximately 14 MB, well below the 4 GB threshold where Supabase recommends considering PITR for size-related risk.
- [x] Production notification records prove two successful SMTP alert deliveries; the latest verified delivery was 2026-08-08 08:51 UTC.
- [x] Repository credential-pattern scanning found no committed GitHub PAT, JWT-shaped secret, or Supabase secret-key value. Only example environment files are tracked.
- [x] The production process cannot boot unless `DATABASE_URL`, HTTPS `APP_PUBLIC_URL`, safe CORS, a 32+ character JWT secret, `DB_SSL=true`, and `ALLOW_PUBLIC_REGISTRATION=false` pass validation.
- [x] Baseline verification passed 718 automated tests before the readiness changes.

## Required owner actions before handing out access

- [ ] Atul signs in and confirms he can see Shivam's tasks on Dashboard, My Tasks, project views, reports, and timeline, but cannot edit Shivam's task.
- [ ] Shivam performs the reciprocal visibility and view-only check against Atul's task.
- [ ] Aparna changes her temporary password. Her account is the only active account still marked `must_change_password`.
- [ ] In Supabase Dashboard, open **Database > Backups** and confirm either a current downloadable/daily backup or the project plan. Pro, Team, and Enterprise projects receive daily backups; a Free project requires a regular off-site logical dump.
- [ ] Perform one restore drill into a separate non-production project. Never test restoration over the production project.
- [ ] In Railway, rotate `JWT_SECRET`, `ENCRYPTION_KEY`, `SETUP_KEY` (or remove `SETUP_KEY` after confirming bootstrap is no longer needed), database credentials, Supabase service-role key, and SMTP credentials during a communicated sign-out window. Do not reuse old values or record them in this repository.
- [ ] After secret rotation, redeploy Railway and repeat health, readiness, login, refresh, file access, and SMTP delivery checks. JWT rotation signs out existing sessions.
- [ ] Enable Railway deployment-failure notifications and confirm the backend `SENTRY_DSN` is configured. Send a controlled test event from a non-production environment before relying on Sentry alerts.
- [ ] Enable Vercel deployment-failure notifications for the production project.
- [ ] Enable GitHub secret scanning, Dependabot alerts, branch protection for `main`, required CI checks, and private vulnerability reporting.
- [ ] Assign an internal support owner and publish their contact channel to CEPAA users.

## Performance notes

Supabase currently reports only informational unused-index notices. Do not remove indexes during the initial rollout: the database has little query history, so an index can be correct and still appear unused. Review these notices again after at least four weeks of representative use.

## Release-day sequence

1. Confirm the backup/restore item above.
2. Complete any planned secret rotation and redeploy Railway.
3. Verify API health, readiness, CORS, and frontend HTTP 200.
4. Have Atul and Shivam complete the reciprocal visibility and view-only checks.
5. Have Aparna change her temporary password.
6. Confirm one real SMTP notification reaches its intended recipient.
7. Distribute the application URL and [CEPAA user guide](../CEPAA_USER_GUIDE.md).
8. Monitor Railway, Vercel, Supabase advisors, and Sentry during the first working day.

## Rollback

If the application fails after a release, redeploy the last known-good Vercel and Railway deployments. Do not roll back additive database migrations; prepare a forward migration. If data integrity is affected, stop writes, preserve evidence, and restore only through the documented Supabase recovery process during a communicated maintenance window.
