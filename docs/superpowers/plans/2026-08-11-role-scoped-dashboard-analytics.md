# Role-scoped dashboard analytics implementation plan

> Execute in the isolated `feature/dashboard-analytics` worktree using test-driven development.

## 1. Establish the contract

1. Add failing shared-schema tests for the default trailing period, UUID/date validation, reversed ranges, maximum range, monthly grouping, and export format.
2. Add analytics request/response types to the shared package.
3. Implement the schemas and run the shared tests and build.

## 2. Implement deterministic metric calculation

1. Add failing backend tests with hand-calculated fixtures for all nine metrics and project-health weighting.
2. Extend the scoped dashboard row projection with estimated hours.
3. Implement a pure analytics metric builder, including UTC month buckets, blocked-event fallback, 48-hour handoff pairing, and neutral denominators.
4. Run the metric tests and refactor while green.

## 3. Add the role-scoped analytics API

1. Add failing service/controller tests proving filters, resolved role scope, activity filtering by authorized task IDs, project filtering, and safe validation.
2. Add the analytics endpoint and service orchestration using `buildDashboardRowsQuery` and the existing department scope resolver.
3. Add PDF/XLSX export endpoints and failing tests for content types, filenames, and authorized-response reuse.
4. Implement board-summary generation with existing PDF/XLSX dependencies.
5. Run focused backend tests.

## 4. Add the native dashboard Analytics view

1. Add failing frontend API tests for analytics loading and secure export downloads.
2. Implement the analytics API client and query hook.
3. Add failing component/page tests for the Analytics tab, loading/error/empty states, metric labels, charts, health explanations, and export actions.
4. Implement a responsive lazy-loaded analytics view with Recharts and accessible table fallbacks.
5. Run focused frontend tests, then the React best-practices review.

## 5. Verify and publish

1. Review the complete diff against the approved metric/role checklist.
2. Run all tests, type checks, lint, production build, and `git diff --check`.
3. Commit intentionally, fetch remote `main`, confirm fast-forward ancestry, and push the feature commit to `main` without force.
4. Verify the GitHub commit and inspect Vercel/Railway deployment detection when available.
