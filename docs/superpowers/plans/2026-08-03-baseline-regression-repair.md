# Baseline Regression Repair Plan

> **Execution:** Use `superpowers:subagent-driven-development` task-by-task with a fresh reviewer after each implementation task.

**Goal:** Restore the tested handoff and timeline behavior accidentally overwritten by commit `9a92aa7` before starting production-hardening features.

**Root cause:** Commit `9a92aa7` retained newer handoff/timeline tests and contracts while replacing parts of their implementations, validation, and migration SQL with older simplified versions. Restore only the regressed behavior; preserve its valid calendar, frontend, and build changes.

## Global constraints

- Treat the existing failing tests as the verified RED phase.
- Do not revert commit `9a92aa7` wholesale.
- Preserve tenant isolation and transactional completion semantics.
- Make the smallest behavior-restoring changes supported by tests and prior known-good commits.

### Task 1: Restore handoff completion behavior

**Files:**
- Modify: `packages/backend/src/task/task-completion.service.ts`
- Modify: `packages/backend/src/task/task.service.ts`
- Modify: `packages/backend/src/migrations/021_handoff_confirmation.ts`
- Modify: `supabase/migrations/20260730100000_handoff_confirmation.sql`

- [ ] Compare current code with known-good commits `bcc0baa`, `b41d3ce`, `7ab9c71`, and `0dfdbb2`.
- [ ] Restore `reopenInTransaction`, tenant-safe handoff-owner hydration, completion guards, assignment ownership, no-op assignment behavior, and the handoff-status check constraint.
- [ ] Preserve valid later integrations from `9a92aa7`; do not replace entire files blindly.
- [ ] Run:
  `npm test -w @wrike-clone/backend -- --runInBand test/unit/task-completion.service.spec.ts test/unit/task.service.spec.ts test/unit/handoff-confirmation-migration.spec.ts`
- [ ] Run neighboring handoff/controller tests and backend typecheck.
- [ ] Commit as `fix: restore handoff completion invariants`.

### Task 2: Restore nullable timeline schedule validation

**Files:**
- Modify: `packages/shared/src/validation/index.ts`
- Update generated shared outputs only through the repository build process if tracked outputs change.

- [ ] Compare the current schedule schema with known-good timeline commits and the API contract.
- [ ] Accept only either two valid ISO dates or two null values; reject mixed null/date values and reversed ranges.
- [ ] Run:
  `npm test -w @wrike-clone/backend -- --runInBand test/unit/timeline.service.spec.ts`
- [ ] Run shared validation tests and backend typecheck.
- [ ] Commit as `fix: restore timeline unscheduling contract`.

### Task 3: Verify the clean baseline

**Files:**
- No production changes expected.
- Write verification evidence to the SDD report and ledger.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test -w @wrike-clone/backend -- --runInBand`.
- [ ] Run the frontend test suite independently.
- [ ] Run `npm run build`.
- [ ] Record any remaining failures exactly; do not mask or skip tests.

