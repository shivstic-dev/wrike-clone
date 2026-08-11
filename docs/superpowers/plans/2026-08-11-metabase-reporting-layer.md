# Metabase Reporting Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, optional self-hosted Metabase reporting layer for CEPAA Admins and Department Heads.

**Architecture:** Curated tenant-pinned views live in an unexposed PostgreSQL schema and are readable only through a dedicated read-only login. CEPAA exposes a server-authorized external launch URL; Metabase remains operationally independent from the native dashboard.

**Tech Stack:** PostgreSQL 15+, Supabase migrations, Knex migrations, NestJS, React, Docker Compose, Metabase OSS.

## Global Constraints

- Do not store or expose Supabase service-role, database-owner, or Metabase database passwords.
- Metabase source queries must be tenant-pinned, read-only, SSL-protected, and limited to curated views.
- Only tenant Admins and Department Heads may receive the Metabase launch URL.
- Native dashboard analytics must remain available when Metabase is missing or offline.
- Metabase image versions must be pinned; production must not use the embedded H2 application database.

---

### Task 1: Curated PostgreSQL reporting model

**Files:**
- Create: `supabase/migrations/20260811123000_metabase_reporting_layer.sql`
- Create: `packages/backend/src/migrations/024_metabase_reporting_layer.ts`
- Create: `packages/backend/test/unit/metabase-reporting-migration.spec.ts`

**Interfaces:**
- Produces: `analytics.task_facts`, `analytics.monthly_task_outcomes`, `analytics.workload_snapshot`, `analytics.project_health`, and `cepaa_analytics_reader`.

- [ ] Write a failing static migration test that checks the tenant session predicate, non-exposed schema, safe columns, privilege revocations, NOLOGIN/NOBYPASSRLS group role, and runtime wrapper.
- [ ] Run the focused Jest test and confirm it fails because the migration is absent.
- [ ] Implement the SQL migration and runtime wrapper with idempotent forward operations and a safe view/schema rollback.
- [ ] Run the focused test and migration runtime tests.
- [ ] Commit the reporting model.

### Task 2: Secret-free reader provisioning

**Files:**
- Create: `scripts/provision-metabase-reader.sh`
- Create: `packages/backend/test/unit/metabase-reader-provisioning.spec.ts`

**Interfaces:**
- Consumes: `METABASE_READER_TENANT_ID`, `METABASE_READER_LOGIN`, `METABASE_READER_PASSWORD`, and the migration-admin `DATABASE_URL`.
- Produces: a tenant-pinned LOGIN role granted only `cepaa_analytics_reader`.

- [ ] Write a failing executable-contract test for required variables, UUID/login validation, non-echoed password handling, read-only defaults, timeout, search path, and group membership.
- [ ] Run the test and confirm the script is missing.
- [ ] Implement the strict Bash/psql script using `ON_ERROR_STOP`, psql variables, and server-side identifier quoting.
- [ ] Run the focused test and `bash -n`.
- [ ] Commit the provisioning script.

### Task 3: Role-gated CEPAA launch endpoint

**Files:**
- Modify: `packages/backend/src/dashboard/dashboard.service.ts`
- Modify: `packages/backend/src/dashboard/dashboard.controller.ts`
- Modify: `packages/backend/src/dashboard/dashboard.service.spec.ts`
- Modify: `packages/backend/src/config/app.config.ts`
- Modify: `packages/backend/src/config/app.config.spec.ts`

**Interfaces:**
- Produces: `DashboardService.metabaseLaunch(): Promise<{ url: string }>` and `GET /dashboard/metabase`.

- [ ] Write failing tests for Admin and Department Head access, Manager/Employee denial, absent configuration, and HTTPS-only production configuration.
- [ ] Run the focused backend tests and confirm the new behavior is absent.
- [ ] Implement configuration validation, server-side role resolution, and the guarded controller endpoint.
- [ ] Run focused dashboard/config tests.
- [ ] Commit the launch endpoint.

### Task 4: Management launch card

**Files:**
- Modify: `packages/frontend/src/api/dashboard.ts`
- Modify: `packages/frontend/src/api/dashboard.spec.ts`
- Modify: `packages/frontend/src/components/Dashboard/DashboardAnalytics.tsx`
- Modify: `packages/frontend/src/components/Dashboard/DashboardAnalytics.spec.tsx`

**Interfaces:**
- Consumes: `GET /dashboard/metabase` only when analytics scope role is `admin` or `department_head`.
- Produces: an external Advanced Analytics launch card with safe loading/error behavior.

- [ ] Write failing API and component tests proving eligible rendering, ineligible absence, and no impact on native analytics.
- [ ] Run the focused Vitest tests and confirm failure.
- [ ] Implement the conditional query and launch card with `target="_blank"` and `rel="noreferrer"`.
- [ ] Run focused frontend tests and the React best-practices review.
- [ ] Commit the launch card.

### Task 5: Self-hosted deployment and runbook

**Files:**
- Modify: `docker/docker-compose.yml`
- Create: `docs/deployment/metabase-supabase-runbook.md`
- Create: `packages/backend/test/unit/metabase-deployment-contract.spec.ts`

**Interfaces:**
- Produces: pinned local Metabase service, persistent PostgreSQL application database, health checks, and Railway/Supabase setup instructions.

- [ ] Write a failing deployment-contract test for pinned images, production application DB, encryption secret, health check, and absence of source credentials in Compose.
- [ ] Run the focused test and confirm the service is absent.
- [ ] Add Compose services and the operations runbook with exact SSL, Metabase group, backup, scheduling, and rollback steps.
- [ ] Validate Compose configuration and run the focused test.
- [ ] Commit deployment assets.

### Task 6: Verify and publish

**Files:** All Phase 2 changes.

- [ ] Review the diff against every design requirement and security boundary.
- [ ] Run all tests, typecheck, lint, production build, `bash -n`, Compose validation, and `git diff --check`.
- [ ] Commit any verification fixes.
- [ ] Fetch `origin/main`, confirm fast-forward ancestry, and publish to `main` without force as explicitly authorized.
- [ ] Verify the GitHub commit and deployment-provider detection.
