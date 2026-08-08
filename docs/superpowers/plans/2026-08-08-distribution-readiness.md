# CEPAA Distribution Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining technical and operational work required to distribute CEPAA safely to its internal team.

**Architecture:** Keep Vercel as the static frontend, Railway as the NestJS API, and Supabase Postgres/Storage as the data layer. Validate the deployed path end to end, close the only actionable database performance advisory with versioned migrations, and document the human-only controls that cannot be changed safely without account-owner input.

**Tech Stack:** TypeScript, NestJS, React/Vite, Knex, PostgreSQL 17, Supabase, Railway, Vercel, Jest.

## Global Constraints

- Preserve the current one-tenant CEPAA production data and never expose credentials or personal data in logs or documentation.
- Keep public registration disabled and manager peer visibility read-only.
- Apply every production database change through both Knex and Supabase migration sources.
- Do not rotate secrets without replacement values and a coordinated session-invalidation window.
- Do not claim readiness without fresh deployment, database, test, lint, typecheck, and build evidence.

---

### Task 1: Production smoke and schema verification

**Files:**

- Modify: `docs/deployment/distribution-readiness-checklist.md`

**Interfaces:**

- Consumes: Vercel frontend, Railway `/api/v1/health` and `/api/v1/health/ready`, Supabase project `lsjeobyrmxiqewehhjai`.
- Produces: A dated evidence record containing only non-secret health and aggregate database information.

- [ ] Verify the production frontend returns HTTP 200.
- [ ] Verify Railway health and readiness return HTTP 200 with a successful database check.
- [ ] Verify the Supabase project is healthy, migrations are current, handoff constraints exist, and aggregate row counts are plausible.
- [ ] Confirm security advisors have no findings and record performance-advisor actions without deleting unused indexes from a low-traffic database.

### Task 2: Handoff foreign-key indexes

**Files:**

- Create: `packages/backend/test/unit/handoff-foreign-key-indexes-migration.spec.ts`
- Create: `packages/backend/src/migrations/024_handoff_foreign_key_indexes.ts`
- Create: `supabase/migrations/20260808110000_handoff_foreign_key_indexes.sql`

**Interfaces:**

- Consumes: `tasks.handoff_owner_id` and `tasks.handoff_confirmed_by` foreign keys.
- Produces: Idempotent covering indexes `idx_tasks_handoff_owner` and `idx_tasks_handoff_confirmed_by`.

- [ ] Write a failing migration parity test asserting both migration forms create the two indexes and cleanly drop them in Knex rollback.
- [ ] Run the focused test and confirm it fails because the migration files do not exist.
- [ ] Add minimal idempotent covering-index migrations.
- [ ] Run the focused test and migration unit suite.
- [ ] Apply the Supabase migration and re-run performance advisors to confirm both unindexed-foreign-key findings are removed.

### Task 3: Security, backups, notifications, and monitoring audit

**Files:**

- Modify: `docs/deployment/distribution-readiness-checklist.md`

**Interfaces:**

- Consumes: Production configuration validation, Supabase advisors/logs, GitHub configuration visibility, and service health.
- Produces: An owner-action checklist that identifies configured, verified, and blocked controls without recording secret values.

- [ ] Verify public registration is rejected in production.
- [ ] Verify no service-role key or secret is committed to frontend or repository files.
- [ ] Record which secret rotations require owner-provided replacement values and a sign-out window.
- [ ] Record backup/restore requirements and identify account-dashboard checks that the available connector cannot perform.
- [ ] Check recent Supabase error logs and production monitoring code/configuration without printing credentials.
- [ ] Record SMTP verification as blocked unless a safe non-secret status endpoint or production test recipient is available.

### Task 4: CEPAA user and release guide

**Files:**

- Create: `docs/CEPAA_USER_GUIDE.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: Current task, status, assignment, dashboard, and manager visibility behavior.
- Produces: A concise internal guide for Atul, Aparna, Shivam, Sachin, and future CEPAA users.

- [ ] Document login, dashboard scope, task assignment, statuses, completion/handoff, and view-only peer-manager behavior.
- [ ] Document password hygiene, support escalation, and safe spreadsheet import expectations.
- [ ] Link the guide and production readiness checklist from the README.

### Task 5: Verification and publication

**Files:**

- Verify all files changed above.

**Interfaces:**

- Consumes: Tasks 1-4.
- Produces: A reviewed commit suitable for deployment through the existing Git integrations.

- [ ] Run all workspace tests, lint, typecheck, formatting check, production build, and `git diff --check`.
- [ ] Re-check Vercel, Railway, Supabase constraints, advisors, and live health after schema application.
- [ ] Review the diff for credentials and unrelated user changes.
- [ ] Commit only the distribution-readiness files and publish through the approved GitHub path.

## Self-Review

- Spec coverage: all seven recommended release steps map to Tasks 1-4; final evidence and publication map to Task 5.
- Placeholder scan: no deferred implementation placeholders are present; owner-only actions are explicitly bounded because replacement credentials and account-dashboard authority cannot be invented.
- Type consistency: both migrations use the same two index names and target columns; the verification task checks those exact names.
