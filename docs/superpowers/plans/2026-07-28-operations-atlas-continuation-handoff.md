# Operations Atlas Continuation Handoff

**Status date:** 2026-07-29
**Completed branch:** `codex/operations-atlas-dashboard`
**Production merge target:** `main`

## Completed and Verified

1. Operations Atlas local fonts, semantic tokens, and accessible UI primitives.
2. Typed role-aware navigation and responsive `AppShell`:
   - desktop sidebar and mobile navigation sheet;
   - keyboard focus containment/restoration;
   - account disclosure;
   - role-safe Create Task visibility;
   - department links and optional Help slot.
3. Redesigned OpenWork Hub login and required-password screens.
4. Shared 30-day dashboard API contract and validation.
5. Deterministic dashboard metric builder.
6. Additive Supabase/Postgres analytics indexes and safe Knex wrapper.
7. Tenant- and role-scoped `GET /dashboard/overview` API:
   - employee, manager, department-head, and admin scopes;
   - current-tenant and soft-delete filtering;
   - legacy/junction assignee deduplication;
   - admin-only department comparison;
   - explicit admin department validation;
   - invalid query responses mapped to HTTP 400.
8. Accessible live-data dashboard charts:
   - stable React Query key and optional department scope;
   - React 19-compatible Recharts setup;
   - chart and tooltip animation disabled;
   - exact-value table disclosures;
   - honest empty states and generated timestamps;
   - live 30-day created/completed, status, and priority data.
9. Four role-aware Operations Atlas dashboard compositions:
   - employee My workload view without task-creation controls;
   - manager own work, open-task capacity, and unassigned work;
   - department-head manager/employee lanes and access history;
   - admin tenant-wide department comparison and setup signals.
10. The old generic dashboard was replaced by the approved composition:
    department pulse strip, work movement, attention queue, capacity, and
    role-specific guidance.
11. Admin opens on **All departments**. Non-admin viewers open on their first
    available department. Dashboard composition comes only from the
    server-returned `overview.scope.role`.
12. Overview failure remains local. Existing grouped/personal task links,
    department selection, role controls, and audited role history remain
    independently usable.

Key completed commits, newest first:

- `8bdb2b5` fix: keep dashboard loading states honest
- `120a25f` feat: build role-aware Operations Atlas dashboard
- `a8a2e15` feat: add accessible dashboard charts
- `9635641` fix: ship dashboard shared contract artifacts
- `983d246` fix: validate dashboard scope and query input
- `9bb5a45` feat: add role-scoped dashboard overview API
- `c8d1891` test: reject task mutations in analytics migration
- `036a06b` test: keep analytics migration specs out of knex
- `8f44ed0` perf: index dashboard analytics queries
- `7ccbe5c` fix: enforce dashboard metric window
- `947d780` feat: calculate dashboard metrics
- `a314d3e` feat: define dashboard overview contract
- `501df9b` fix: respect reduced motion in authentication
- `8f25534` feat: redesign OpenWork Hub authentication
- `96c6e43` fix: harden AppShell keyboard navigation
- `453512a` feat: add responsive Operations Atlas shell
- `0cfaa8a` feat: add role-aware Atlas navigation
- `ffb0c11`, `7fb62c7`, `a7346b9` accessible UI primitives
- `d32b7b5`, `00b5d22` Atlas fonts and tokens

## Archived Interrupted Worktree

The original interrupted dashboard work still exists at:

`D:\wrike-clone\.worktrees\operations-atlas`

It is stale recovery material only. Do not copy or merge it. The verified
implementation is on `codex/operations-atlas-dashboard`.

## Exact Continuation Order

### 1. Execute the Onboarding Plan

Plan:

`docs/superpowers/plans/2026-07-28-operations-atlas-onboarding.md`

Implement all five tasks in order:

1. onboarding contract and migration;
2. tenant-safe onboarding API;
3. frontend client and role-specific steps;
4. first-login guided tour;
5. permanent checklist, Help replay, and system-map infographic.

Employee onboarding must not show task-creation steps.

### 2. Execute Page Redesign and Hardening

Plan:

`docs/superpowers/plans/2026-07-28-operations-atlas-pages-and-hardening.md`

Implement all six tasks:

1. My Work;
2. department/project pages;
3. task detail;
4. visual reports using existing real report/export data;
5. admin/setup health;
6. accessibility, responsive, browser, and release gates.

### 3. Final Verification and Release

Run:

```powershell
npm ci
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

Then perform authenticated browser checks for:

- login and required password change;
- mobile and desktop shell;
- Quick Task creation and assignee retention;
- employee, manager, department-head, and admin dashboards;
- overview failure while task lanes remain usable;
- report data and PDF/XLSX export;
- tenant/department access rejection;
- keyboard navigation and reduced motion.

Run a final whole-branch code/security review before release.

## Latest Dashboard Verification

Dashboard Tasks 5-6 passed:

- chart/API tests: 12 tests;
- final role/page dashboard tests: 15 tests;
- full frontend tests: 23 files, 149 tests;
- full backend tests: 26 suites, 180 tests;
- root typecheck, lint, build, and `git diff --check`.

The local browser check confirmed the redesigned authentication screen loads.
The dashboard still needs an authenticated production browser check for all
four roles after Vercel deploys the `main` push.

## Database and Deployment Notes

- Supabase analytics migration:
  `supabase/migrations/20260728183000_operations_atlas_analytics.sql`
- Knex wrapper:
  `packages/backend/src/migrations/018_operations_atlas_analytics.ts`
- The migration is additive only and was not manually applied to live Supabase
  during development.
- Confirm Railway startup migration logs after deployment.
- Vercel frontend and Railway backend redeploy from `main`.
- Production frontend:
  `https://wrike-clone-three.vercel.app`
- Production API:
  `https://wrike-clone-production-9894.up.railway.app/api/v1`

## Non-Negotiable Rules

- Keep product name `OpenWork Hub`.
- Preserve tenant isolation, RBAC, routes, auth, Quick Task behavior, and report
  exports.
- Use only live permitted data; never add fake dashboard values.
- Dashboard window remains exactly 30 UTC calendar days.
- Use `completed_at` for completion trends and `created_at` for creation trends.
- Employee never receives create controls or creation onboarding.
- Every graph needs a readable summary and exact table/list fallback.
- Keep mobile workflows complete and meet WCAG 2.2 AA.
- Do not activate dormant modules or add paid services.
