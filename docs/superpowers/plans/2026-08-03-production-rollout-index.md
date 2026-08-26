# Production Rollout Execution Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each linked plan task-by-task.

**Goal:** Coordinate the approved production hardening work into independently deployable, reversible releases for a 20-person team.

**Architecture:** Release blockers land first. Notifications and Trash then land as separate additive releases; activity follows Trash because it displays deletion events, while performance work lands last after functional behavior is stable.

**Tech Stack:** NestJS, Knex, PostgreSQL/Supabase, Railway, React, TanStack Query, Jest, Vitest

## Global Constraints

- Execute every plan test-first and commit after each independently reviewable task.
- Preserve untracked `.agents/` and `.mcp.json` files.
- Do not push or deploy until the complete local verification gate passes and production variables are confirmed.
- Additive migrations are not rolled back during an application incident.
- Railway/Supabase secrets are configured outside Git.

## Ordered Plans

1. [Production Release Blockers](./2026-08-03-production-release-blockers.md)
2. [Brevo Action Notifications](./2026-08-03-brevo-action-notifications.md)
3. [Recoverable Task Trash](./2026-08-03-recoverable-task-trash.md)
4. [Scoped Activity Feed](./2026-08-03-scoped-activity-feed.md)
5. [Targeted Performance](./2026-08-03-targeted-performance.md)

## Release Gates

### Gate 1: Safe deployment baseline

- [ ] Production and migration URLs are isolated and validated.
- [ ] Inactive/deleted users cannot log in or refresh.
- [ ] Membership removal expires matching sessions.
- [ ] Backend tests, typecheck, production build, health, readiness, and login smoke checks pass.
- [ ] Deploy release blockers before continuing.

### Gate 2: Brevo notification pilot

- [ ] Migration 023 is applied through `MIGRATE_DATABASE_URL`.
- [ ] Brevo sender address is verified and Railway SMTP secrets are present.
- [ ] `EMAIL_ENABLED=false` deployment starts cleanly and queues no SMTP work.
- [ ] Enable email and send one approved assignment test message.
- [ ] Simulated SMTP failure leaves task/comment operations successful and the outbox retryable.
- [ ] Assignment, comment, approval, and deadline deduplication tests pass.

### Gate 3: Recoverable deletion

- [ ] Migration 024 is applied.
- [ ] Existing task deletion preserves every `task_assignees` row.
- [ ] Admin and regular-user Trash permissions pass tenant/department isolation tests.
- [ ] Restore returns the task with assignees intact.
- [ ] Purge is unavailable before 30 days and unavailable to non-admins.
- [ ] Deploy Trash before exposing its navigation link to the team.

### Gate 4: Activity visibility

- [ ] Migration 025 is applied.
- [ ] Admin and non-admin activity visibility tests pass.
- [ ] Raw metadata is absent from API responses.
- [ ] Deleted and purged entity labels render safely.
- [ ] Activity endpoint/page pagination and filters pass.

### Gate 5: Performance and launch

- [ ] Global search sends one request after 300 ms for a rapid input sequence.
- [ ] Task-detail prefetch reuses the canonical detail cache.
- [ ] Task lists use `TaskListItem`; detail routes still return complete `Task`.
- [ ] Loading transitions use scoped skeletons.
- [ ] Baseline measurements are recorded; virtualization is added only if its threshold is crossed.
- [ ] Run the repository-wide verification commands below.

## Final Local Verification

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Expected: every command exits 0 from a clean checkout with test environment variables only.

## Production Smoke Verification

After Railway reports a successful migration and deployment:

```bash
curl --fail https://BACKEND_HOST/api/v1/health
curl --fail https://BACKEND_HOST/api/v1/health/ready
```

Then verify with non-production test accounts in the production tenant:

- admin and regular-user login;
- task create, assignment, comment, delete, restore, and eligible purge authorization;
- in-app notification creation;
- one Brevo email for each enabled action-required category;
- activity feed visibility for admin and regular user;
- disabled membership refresh rejection;
- normal dashboard, My Tasks, task detail, Search, Trash, and Activity navigation.

## Rollback Sequence

1. Disable email with `EMAIL_ENABLED=false` if delivery causes incidents; keep outbox rows for diagnosis.
2. Hide the new frontend route/navigation release if Trash or Activity UI fails; preserve additive data.
3. Redeploy the last known-good Railway application version.
4. Do not reverse migrations 023–025 during the incident; they are additive and older code ignores their columns/tables/indexes.
5. Record failed smoke checks and only resume rollout after the relevant plan's focused tests reproduce the fix.
