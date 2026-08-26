# Role-scoped dashboard analytics design

## Goal

Add decision-ready analytics directly to CEPAA's existing dashboard without adding a paid BI dependency. Every result must use the same task visibility rules as the operational dashboard, including employee self-scope, manager team/peer visibility, department-head scope, and administrator department selection.

## User experience

The Dashboard gains an **Analytics** view alongside Overview, Board, and Timeline. It defaults to the trailing twelve calendar months and shows:

- monthly completions;
- overdue outcomes by department;
- current workload by manager and employee;
- average completion time;
- blocked-task ageing;
- priority distribution;
- handoff success within 48 hours;
- on-time completion;
- project health scores; and
- PDF and XLSX board-summary exports.

Empty and unavailable metrics are shown honestly as unavailable, rather than as a misleading zero. Charts and tables remain readable on desktop and mobile. The existing dashboard department selector continues to control the analytics scope.

## API and authorization

`GET /api/v1/dashboard/analytics` accepts optional `departmentId`, `projectId`, `dateFrom`, and `dateTo` query parameters plus `groupBy=month`. The default period is the trailing twelve months. Dates are validated and the maximum custom range is twelve months.

`GET /api/v1/dashboard/analytics/export?format=pdf|xlsx` accepts the same filters and returns a server-generated board summary.

The backend resolves the current tenant, user, membership role, and permitted department before reading tasks. It reuses `buildDashboardRowsQuery`, so analytics cannot widen visibility beyond the existing dashboard. Exports are built from the same authorized response. No browser-supplied totals or task IDs are trusted.

## Metric definitions

| Metric | Definition |
|---|---|
| Monthly completion | Authorized tasks whose `completedAt` falls in each calendar month |
| Overdue outcome | Tasks due in each month that were completed after their due date or remain incomplete after it |
| Workload | Current non-completed tasks, overdue tasks, and estimated hours grouped by visible assignee |
| Average completion time | Mean hours from creation to completion for tasks completed in the selected period |
| Blocked ageing | Days since the most recent transition to Blocked; `updatedAt` is used only when legacy activity is missing |
| Priority distribution | Current visible, non-completed tasks grouped Critical, High, Medium, and Low |
| Handoff success | Handoffs confirmed within 48 hours of becoming Ready divided by handoffs that became Ready in the period |
| On-time completion | Completed tasks with a due date completed on or before that due date, divided by completed tasks with a due date |
| Project health | Weighted score described below, calculated only from authorized tasks |

Historical overdue is explicitly labelled **Overdue outcome trend**, because due-date changes are not versioned.

## Project health score

Each project score is the weighted sum of five 0–100 components:

- 35% on-time completion;
- 25% overdue-task control;
- 20% blocked-task ageing;
- 10% workload balance; and
- 10% handoff success.

Green is 80–100, amber is 60–79, and red is below 60. Components with no applicable denominator use a neutral 100 so a project is not punished for having no handoffs, due dates, or blocked work. The response exposes each component so the score is explainable.

## Data and performance

The scoped task query adds estimated hours and retains project, department, assignee, due, completion, priority, handoff, and update fields. Relevant activity rows are fetched only for already-authorized task IDs. Metric calculation is a pure function with deterministic UTC month boundaries.

A short in-process cache is keyed by tenant, user, role, resolved department, project, and date range. This prevents one principal from receiving another principal's data. Existing dashboard/task mutation cache invalidation semantics remain unchanged; the short TTL limits staleness.

## Export

PDF and XLSX exports include the active filters, scope, generation time, KPI cards, monthly completion and overdue tables, priority and workload summaries, blocked ageing, and project-health explanations. Responses are private and non-cacheable by shared proxies.

## Future Metabase phase

Metabase is intentionally deferred until the native dashboard is stable. A later self-hosted instance may read protected reporting views through a dedicated read-only PostgreSQL login. It must never receive the Supabase service-role key, administrator database credentials, or direct access to tenant tables without safe reporting views.

## Verification

Tests cover query validation, UTC boundaries, nullable denominators, handoff timing, blocked fallback, health weighting, role-scoped service behavior, export headers/content, frontend API parameters, and analytics rendering. Final verification includes all workspace tests, type checking, linting, production build, and whitespace checks.
