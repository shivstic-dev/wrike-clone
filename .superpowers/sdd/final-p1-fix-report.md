# Final P1 fix report

Date: 2026-08-03

## Session revocation race

- `AuthService.refreshToken()` now runs validation and rotation in one transaction.
- Lock order is membership first, session second. The candidate session is read without a lock only to identify the tenant-scoped membership; the active membership is then locked before the session is locked and revalidated.
- Rotation conditionally matches session id, token hash, tenant, membership, user, and unexpired state.
- `UserService.remove()` uses the same membership-first order, locking the membership before disabling it and expiring tenant-scoped sessions. This avoids refresh/removal deadlock and ensures removal either blocks refresh before validation or expires the rotated session after refresh commits.

TDD regression: `test/unit/auth.service.g7.spec.ts` deterministically interleaves removal during refresh. RED extended the revoked session into the future; GREEN leaves it expired and records lock order `tenant_memberships`, then `sessions`. `test/unit/user.service.spec.ts` also failed RED until removal acquired the membership lock before touching sessions.

## Railway production mode

- `scripts/railway-start.sh` now exits before migrations unless `NODE_ENV` is exactly `production`.
- `docs/deployment/railway-supabase-runbook.md` documents `NODE_ENV=production` as required.
- `test/unit/railway-startup-contract.spec.ts` executes the real script with `NODE_ENV=staging`. RED proceeded to migrations; GREEN exits with `[ERROR] NODE_ENV must be production`.

## Verification

- `npm test -w @wrike-clone/backend -- --runInBand test/unit/auth.service.spec.ts test/unit/auth.service.g7.spec.ts test/unit/user.service.spec.ts test/unit/railway-startup-contract.spec.ts src/config/app.config.spec.ts`
  - Exit 0; 5 suites passed, 38 tests passed, 0 failures.
- `npm run typecheck -w @wrike-clone/backend`
  - Exit 0.

No broad test suite or build was run in this seven-minute P1 timebox.
