# Operations Atlas Continuation Handoff

**Status date:** 2026-07-28  
**Completed branch:** `codex/operations-atlas`  
**Production merge target:** `main`

## Outcome Already Completed

The following work is committed, tested, and passed task-scoped implementation and review gates:

1. Operations Atlas local fonts and visual tokens.
2. Accessible shared UI primitives.
3. Typed role-aware navigation.
4. Responsive `AppShell` with:
   - desktop sidebar and mobile navigation sheet;
   - keyboard focus containment/restoration;
   - account disclosure;
   - role-safe Create Task visibility;
   - department links;
   - optional Help slot.
5. Redesigned OpenWork Hub login and required-password screens.
6. Shared 30-day dashboard API contract and validation.
7. Deterministic dashboard metric builder.
8. Additive Supabase/Postgres analytics indexes plus safe Knex wrapper.
9. Tenant- and role-scoped `GET /dashboard/overview` API with:
   - employee, manager, department-head, and admin scopes;
   - current-tenant and soft-delete filtering;
   - legacy/junction assignee deduplication;
   - admin-only department comparison;
   - explicit admin department validation;
   - invalid query responses mapped to HTTP 400.

Key completed commits, newest first:

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

## Important Incomplete Work Preserved Locally

Dashboard Task 5 was interrupted before verification/commit. Its working files remain only in:

`D:\wrike-clone\.worktrees\operations-atlas`

Dirty files:

- `package-lock.json`
- `packages/frontend/package.json`
- `packages/frontend/src/api/dashboard.ts`
- `packages/frontend/src/api/dashboard.spec.ts`
- `packages/frontend/src/components/Dashboard/`

Do not assume these files are correct. Continue with TDD, inspect the diff, finish tests, review, then commit. They are intentionally not part of the production merge described above.

## Exact Continuation Order

### 1. Finish Dashboard Task 5

Source plan:

`docs/superpowers/plans/2026-07-28-operations-atlas-dashboards.md`

Complete “Task 5: Add Frontend Dashboard API and Accessible Charts”:

- stable `dashboardKeys.overview(filters)`;
- `useDashboardOverview(filters, enabled)`;
- Recharts with Atlas semantic colors;
- no gradients or delayed metric animation;
- readable empty states;
- chart title, period/scope description, generated time;
- keyboard-openable visible data-table fallback with exact values;
- focused API/chart tests;
- frontend typecheck, lint, build, full frontend tests;
- task-scoped spec and quality review.

### 2. Implement Dashboard Task 6

Compose the four real-data role dashboards and replace the old generic dashboard:

- employee: My workload, due/overdue, personal trend; never Create Task;
- manager: own workload, employee capacity, unassigned work;
- department head: manager/employee sections and role-change information;
- admin: organization pulse, department comparison, setup health;
- preserve department selector, grouped tasks, task links, and local error boundaries;
- lazy-load chart modules here.

### 3. Execute the Onboarding Plan

Plan:

`docs/superpowers/plans/2026-07-28-operations-atlas-onboarding.md`

Implement all five tasks in order:

1. onboarding contract and migration;
2. tenant-safe onboarding API;
3. frontend client and role-specific steps;
4. first-login guided tour;
5. permanent checklist, Help replay, and system-map infographic.

Employee onboarding must not show task-creation steps.

### 4. Execute Page Redesign and Hardening

Plan:

`docs/superpowers/plans/2026-07-28-operations-atlas-pages-and-hardening.md`

Implement all six tasks:

1. My Work;
2. department/project pages;
3. task detail;
4. visual reports using the existing real report/export data;
5. admin/setup health;
6. accessibility, responsive, browser, and release gates.

### 5. Final Verification and Release

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
- mobile/desktop shell;
- Quick Task creation and assignee retention;
- all four dashboard roles;
- report data and PDF/XLSX export;
- tenant/department access rejection;
- keyboard navigation and reduced motion.

Run one final whole-branch code/security review before merging.

## Database and Deployment Notes

- Supabase analytics migration exists at:
  `supabase/migrations/20260728183000_operations_atlas_analytics.sql`
- Knex wrapper:
  `packages/backend/src/migrations/018_operations_atlas_analytics.ts`
- The migration is additive only and was **not manually applied to live Supabase** during development.
- Confirm Railway startup migration logs after deployment.
- Vercel frontend and Railway backend should redeploy from `main`.
- Production URLs:
  - Frontend: `https://wrike-clone-three.vercel.app`
  - API: `https://wrike-clone-production-9894.up.railway.app/api/v1`

## Non-Negotiable Rules

- Keep product name `OpenWork Hub`.
- Preserve tenant isolation, existing RBAC, routes, auth, Quick Task behavior, and report exports.
- Use only live permitted data; never add fake dashboard values.
- Dashboard window remains exactly 30 UTC calendar days.
- Use `completed_at` for completion trends and `created_at` for creation trends.
- Employee never receives create controls or creation onboarding.
- Every graph includes a readable summary and exact table/list fallback.
- Keep mobile workflows complete and meet WCAG 2.2 AA.
- Do not activate dormant modules or add paid services.
