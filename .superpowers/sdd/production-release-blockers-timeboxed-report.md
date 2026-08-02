# Production release blockers timeboxed report

Date: 2026-08-03

## Delivered

- Task 1: production migrations require `MIGRATE_DATABASE_URL`; local migrations retain the `DATABASE_URL`/`DB_*` fallback; Railway startup requires both runtime and migration URLs without logging either.
- Task 2: production startup validates the direct migration URL, public HTTPS URL, disabled public registration, and the pre-existing database/JWT/CORS/SSL controls. `.env.example` documents invalid placeholders.
- Task 3: login filters out inactive/deleted users; refresh rejects inactive/deleted users and mismatched user, membership, or tenant identity before token rotation.
- Task 4: membership removal disables the membership and expires its tenant-scoped sessions in one transaction.
- Task 5: health tests preserve degraded liveness and fail-closed readiness; README links the Railway/Supabase runbook with preflight, smoke, migration-history, and rollback guidance.

No migration files were added or modified. Existing migration 023 remains part of the migration history.

## TDD evidence

1. `npm test -w @wrike-clone/backend -- --runInBand test/unit/migration-connection-config.spec.ts`
   - RED: failed with TS2614 because `buildMigrationConnection` was not exported.
   - GREEN with runtime migration suite: 2 suites passed, 54 tests passed.
2. `npm test -w @wrike-clone/backend -- --runInBand src/config/app.config.spec.ts`
   - RED: missing migration URL and public-registration cases failed because validation did not throw.
   - GREEN: 1 suite passed, 11 tests passed.
3. `npm test -w @wrike-clone/backend -- --runInBand test/unit/auth.service.spec.ts test/unit/auth.service.g7.spec.ts`
   - RED: 5 tests failed for missing login filters and refresh accepting/dereferencing inactive, deleted, or missing users.
   - GREEN: 2 suites passed, 24 tests passed.
4. `npm test -w @wrike-clone/backend -- --runInBand test/unit/user.service.spec.ts`
   - RED: 1 test failed because removal never entered the transaction.
   - GREEN: 1 suite passed, 1 test passed.
5. `npm test -w @wrike-clone/backend -- --runInBand test/unit/health.controller.spec.ts`
   - Contract check passed: 1 suite, 1 test.

## Final verification

- `npm test -w @wrike-clone/backend -- --runInBand src/config/app.config.spec.ts test/unit/auth.service.spec.ts test/unit/auth.service.g7.spec.ts test/unit/user.service.spec.ts test/unit/migration-connection-config.spec.ts test/unit/migration-runtime-resolvability.spec.ts test/unit/health.controller.spec.ts`
  - Exit 0; 7 suites passed, 91 tests passed, 0 failures.
- `npm run typecheck -w @wrike-clone/backend`
  - Exit 0.
- `npm run build`
  - Exit 0; shared, backend, and frontend builds completed; Vite transformed 1,882 modules.

## Incomplete due to timebox

- The plan's full backend test command (`npm test -w @wrike-clone/backend -- --runInBand`) was not run; the requested focused release-blocker suites were run instead.
- The root `npm run typecheck` was not run; backend typecheck and the full monorepo build both passed.

All implementation and documentation items in Tasks 1-5 were completed.
