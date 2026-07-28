# Operations Atlas Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver secure live dashboards and 30-day trends for employee, manager, department-head, and admin roles using real tenant-scoped task data.

**Architecture:** Add one typed dashboard overview endpoint backed by server-side role scope and deterministic metric builders. Keep overview, grouped tasks, and onboarding as separate frontend queries so partial failures do not blank the page. Compose four role views from shared chart and operational panels.

**Tech Stack:** NestJS 11, Knex 3, PostgreSQL/Supabase, Zod, React 19, TanStack Query 5, Recharts, Vitest, Jest

**Prerequisite:** Complete `2026-07-28-operations-atlas-foundations.md`.

## Global Constraints

- Aggregates must include only task rows the viewer may access.
- Preserve tenant isolation and `DepartmentAccessService` role rules.
- Use 30 calendar days and compare against the immediately preceding 30 days.
- "Completed" uses `completed_at`; "created" uses `created_at`.
- "Overdue" means due before now and status is not `completed`.
- Capacity is open assigned-task load, not available-hours capacity.
- Every chart shows period, scope, and generated time.
- Employee receives no create controls or creation onboarding.
- Never add fake values when data is empty.

---

## File Structure

- `packages/shared/src/types/api.ts`: dashboard wire contract
- `packages/shared/src/validation/index.ts`: dashboard query schema
- `packages/backend/src/dashboard/`: query service, metric builder, controller, module
- `packages/frontend/src/api/dashboard.ts`: query keys and API hook
- `packages/frontend/src/components/Dashboard/`: shared graphs/panels and role compositions
- `packages/frontend/src/pages/DashboardPage.tsx`: department selection and role composition

### Task 1: Define Dashboard Contract and Query Validation

**Files:**
- Modify: `packages/shared/src/types/api.ts`
- Modify: `packages/shared/src/validation/index.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/validation/dashboard.spec.ts`

**Interfaces:**
- Produces:

```ts
export type DashboardViewerRole = 'employee' | 'manager' | 'department_head' | 'admin';
export interface DashboardOverview {
  generatedAt: string;
  windowDays: 30;
  scope: { departmentId?: string; role: DashboardViewerRole };
  totals: { active: number; completed: number; overdue: number; blocked: number; unassigned: number };
  comparison: { completedPercentChange: number | null; createdPercentChange: number | null };
  daily: Array<{ date: string; created: number; completed: number }>;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  capacity: Array<{ userId: string; name: string; openTasks: number; overdue: number }>;
  attention: Array<{
    id: string;
    title: string;
    reason: 'overdue' | 'blocked' | 'unassigned';
    dueDate: string | null;
    assigneeName: string | null;
  }>;
  departments: Array<{ id: string; name: string; active: number; overdue: number; completionRate: number }>;
}
export const dashboardOverviewQuerySchema: z.ZodType<{ departmentId?: string; days: 30 }>;
```

- [ ] **Step 1: Write failing contract validation tests**

```ts
import { dashboardOverviewQuerySchema } from './index';

describe('dashboardOverviewQuerySchema', () => {
  it('defaults to 30 days and accepts a UUID department', () => {
    expect(
      dashboardOverviewQuerySchema.parse({
        departmentId: '00000000-0000-0000-0000-000000000001',
      }),
    ).toEqual({
      departmentId: '00000000-0000-0000-0000-000000000001',
      days: 30,
    });
  });

  it('rejects unsupported windows', () => {
    expect(() => dashboardOverviewQuerySchema.parse({ days: 365 })).toThrow();
  });
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test --workspace=@wrike-clone/shared -- --runInBand src/validation/dashboard.spec.ts`

Expected: FAIL because schema and types do not exist.

- [ ] **Step 3: Implement contract and schema**

Use `z.coerce.number().default(30).refine((days) => days === 30)`. Export types and schema through existing shared barrels.

- [ ] **Step 4: Verify shared package**

Run:

```bash
npm test --workspace=@wrike-clone/shared
npm run build --workspace=@wrike-clone/shared
npm run lint --workspace=@wrike-clone/shared
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat: define dashboard overview contract"
```

### Task 2: Build Deterministic Dashboard Metrics

**Files:**
- Create: `packages/backend/src/dashboard/dashboard-metrics.ts`
- Create: `packages/backend/src/dashboard/dashboard-metrics.spec.ts`

**Interfaces:**
- Consumes normalized rows:

```ts
export interface DashboardTaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  departmentId: string;
  departmentName: string;
  createdAt: Date;
  completedAt: Date | null;
  dueDate: Date | null;
  assignees: Array<{ userId: string; name: string }>;
}
```

- Produces:

```ts
export function buildDashboardMetrics(
  rows: DashboardTaskRow[],
  now: Date,
  windowDays: 30,
): Omit<DashboardOverview, 'generatedAt' | 'scope' | 'windowDays' | 'departments'>;
```

- Test file defines `task(overrides: Partial<DashboardTaskRow> & { id: string }): DashboardTaskRow`; ISO date strings in snippets are converted to `Date` inside this fixture

- [ ] **Step 1: Write failing boundary tests**

```ts
it('counts current and previous windows by their correct timestamps', () => {
  const result = buildDashboardMetrics(
    [
      task({ id: 'created-current', createdAt: '2026-07-20T00:00:00Z' }),
      task({
        id: 'completed-current',
        createdAt: '2026-01-01T00:00:00Z',
        status: 'completed',
        completedAt: '2026-07-25T00:00:00Z',
      }),
      task({ id: 'created-previous', createdAt: '2026-06-20T00:00:00Z' }),
    ],
    new Date('2026-07-28T00:00:00Z'),
    30,
  );
  expect(result.daily.reduce((sum, day) => sum + day.created, 0)).toBe(1);
  expect(result.daily.reduce((sum, day) => sum + day.completed, 0)).toBe(1);
});

it('marks blocked, overdue, and truly unassigned work for attention', () => {
  const result = buildDashboardMetrics(
    [
      task({ id: 'late', dueDate: '2026-07-20T00:00:00Z' }),
      task({ id: 'blocked', status: 'blocked' }),
      task({ id: 'unassigned', assignees: [] }),
    ],
    new Date('2026-07-28T00:00:00Z'),
    30,
  );
  expect(result.attention.map((item) => item.reason)).toEqual([
    'overdue',
    'blocked',
    'unassigned',
  ]);
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test --workspace=@wrike-clone/backend -- --runInBand src/dashboard/dashboard-metrics.spec.ts`

Expected: FAIL because metric builder does not exist.

- [ ] **Step 3: Implement pure metric builder**

Generate exactly 30 daily buckets in ascending date order. Deduplicate attention by task, choosing reason priority `overdue`, then `blocked`, then `unassigned`. Compute percentage change as `null` when previous value is zero.

- [ ] **Step 4: Run focused test**

Run: `npm test --workspace=@wrike-clone/backend -- --runInBand src/dashboard/dashboard-metrics.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/dashboard/dashboard-metrics.ts packages/backend/src/dashboard/dashboard-metrics.spec.ts
git commit -m "feat: calculate dashboard metrics"
```

### Task 3: Add Analytics Index Migration

**Files:**
- Create: `supabase/migrations/20260728183000_operations_atlas_analytics.sql`
- Create: `packages/backend/src/migrations/018_operations_atlas_analytics.ts`
- Create: `packages/backend/src/migrations/018_operations_atlas_analytics.spec.ts`

**Interfaces:**
- Produces tenant-prefixed indexes for dashboard date/status aggregation
- Must not alter or delete task data

- [ ] **Step 1: Write failing migration structure test**

```ts
it('creates tenant-scoped dashboard indexes without destructive SQL', async () => {
  const sql = await readFile(
    resolve(__dirname, '../../../../supabase/migrations/20260728183000_operations_atlas_analytics.sql'),
    'utf8',
  );
  expect(sql).toContain('tasks (tenant_id, department_id, created_at)');
  expect(sql).toContain('tasks (tenant_id, department_id, completed_at)');
  expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test --workspace=@wrike-clone/backend -- --runInBand src/migrations/018_operations_atlas_analytics.spec.ts`

Expected: FAIL because migration files do not exist.

- [ ] **Step 3: Implement additive indexes and Knex wrapper**

Use `CREATE INDEX IF NOT EXISTS` for `(tenant_id, department_id, created_at)`, `(tenant_id, department_id, completed_at) WHERE completed_at IS NOT NULL`, and `(tenant_id, department_id, status, due_date) WHERE deleted_at IS NULL`. Down migration drops only these named indexes.

- [ ] **Step 4: Verify migration test and backend typecheck**

Run:

```bash
npm test --workspace=@wrike-clone/backend -- --runInBand src/migrations/018_operations_atlas_analytics.spec.ts
npm run typecheck --workspace=@wrike-clone/backend
```

Expected: PASS and typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260728183000_operations_atlas_analytics.sql packages/backend/src/migrations/018_operations_atlas_analytics.ts packages/backend/src/migrations/018_operations_atlas_analytics.spec.ts
git commit -m "perf: index dashboard analytics queries"
```

### Task 4: Add Role-Scoped Dashboard API

**Files:**
- Create: `packages/backend/src/dashboard/dashboard.service.ts`
- Create: `packages/backend/src/dashboard/dashboard.service.spec.ts`
- Create: `packages/backend/src/dashboard/dashboard.controller.ts`
- Create: `packages/backend/src/dashboard/dashboard.module.ts`
- Modify: `packages/backend/src/app.module.ts`

**Interfaces:**
- `DashboardService.overview(input: { departmentId?: string; days: 30 }): Promise<DashboardOverview>`
- `GET /dashboard/overview` guarded by `AuthGuard`, `RolesGuard`, and `@Permissions('task:read')`
- Consumes `DepartmentAccessService.getReportScope(departmentId)` and `buildDashboardMetrics`
- Test file defines `row(overrides: Partial<DashboardTaskRow> & { id: string }): DashboardTaskRow`, `dbRows.mockResolvedValue(rows)`, and runs service calls inside the existing `tenantContext`

- [ ] **Step 1: Write failing scope tests**

```ts
it('uses employee self scope and never returns other assignees', async () => {
  departmentAccess.getReportScope.mockResolvedValue({
    role: 'employee',
    departmentId: 'department-1',
    ownTasksOnly: true,
  });
  dbRows.mockResolvedValue([
    row({ id: 'mine', assignees: [{ userId: context.userId, name: 'Me' }] }),
  ]);
  const result = await tenantContext.run(context, () =>
    service.overview({ departmentId: 'department-1', days: 30 }),
  );
  expect(result.scope.role).toBe('employee');
  expect(result.capacity.map((item) => item.userId)).toEqual([context.userId]);
});

it('rejects a manager requesting another department', async () => {
  departmentAccess.getReportScope.mockRejectedValue(new ForbiddenException());
  await expect(
    tenantContext.run(context, () =>
      service.overview({ departmentId: 'department-2', days: 30 }),
    ),
  ).rejects.toBeInstanceOf(ForbiddenException);
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test --workspace=@wrike-clone/backend -- --runInBand src/dashboard/dashboard.service.spec.ts`

Expected: FAIL because dashboard service does not exist.

- [ ] **Step 3: Implement scoped row query and endpoint**

Build one tenant-filtered task query with `deleted_at IS NULL`. Apply employee/self, manager/self-plus-employees-plus-unassigned, department-head/department, and admin/tenant scope using the same assignment rules as reports. Aggregate department comparison only for admins. Select legacy `assignee_id` plus `task_assignees` without double counting.

- [ ] **Step 4: Run backend verification**

Run:

```bash
npm test --workspace=@wrike-clone/backend -- --runInBand src/dashboard
npm run typecheck --workspace=@wrike-clone/backend
npm run lint --workspace=@wrike-clone/backend
```

Expected: dashboard tests PASS; typecheck and lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/dashboard packages/backend/src/app.module.ts
git commit -m "feat: add role-scoped dashboard overview API"
```

### Task 5: Add Frontend Dashboard API and Accessible Charts

**Files:**
- Modify: `packages/frontend/package.json`
- Modify: `package-lock.json`
- Create: `packages/frontend/src/api/dashboard.ts`
- Create: `packages/frontend/src/api/dashboard.spec.ts`
- Create: `packages/frontend/src/components/Dashboard/ChartFrame.tsx`
- Create: `packages/frontend/src/components/Dashboard/WorkMovementChart.tsx`
- Create: `packages/frontend/src/components/Dashboard/DistributionChart.tsx`
- Create: `packages/frontend/src/components/Dashboard/charts.spec.tsx`

**Interfaces:**
- Produces `dashboardKeys.overview(filters)` and `useDashboardOverview(filters, enabled)`
- `ChartFrame` requires `title`, `description`, `generatedAt`, and accessible table/list fallback

- [ ] **Step 1: Write failing API and accessibility tests**

```ts
it('uses stable dashboard query parameters', () => {
  expect(buildDashboardParams({ departmentId: 'department-1', days: 30 }).toString()).toBe(
    'departmentId=department-1&days=30',
  );
});
```

```tsx
it('renders a chart summary and exact fallback values', () => {
  const html = renderToStaticMarkup(
    <WorkMovementChart
      generatedAt="2026-07-28T12:00:00Z"
      daily={[{ date: '2026-07-28', created: 3, completed: 2 }]}
    />,
  );
  expect(html).toContain('Created 3');
  expect(html).toContain('Completed 2');
  expect(html).toContain('<table');
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/api/dashboard.spec.ts src/components/Dashboard/charts.spec.tsx
```

Expected: FAIL because API and chart components do not exist.

- [ ] **Step 3: Install Recharts and implement API/charts**

Run: `npm install --workspace=@wrike-clone/frontend recharts`

Lazy-load chart modules from dashboard page. Use fixed semantic colors, no gradients, no animation under reduced motion, and a visually available data table disclosure.

- [ ] **Step 4: Verify focused tests**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/api/dashboard.spec.ts src/components/Dashboard/charts.spec.tsx
npm run typecheck --workspace=@wrike-clone/frontend
```

Expected: PASS and typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/package.json package-lock.json packages/frontend/src/api/dashboard.ts packages/frontend/src/api/dashboard.spec.ts packages/frontend/src/components/Dashboard
git commit -m "feat: add accessible dashboard charts"
```

### Task 6: Compose Four Role Dashboards

**Files:**
- Create: `packages/frontend/src/components/Dashboard/DepartmentPulse.tsx`
- Create: `packages/frontend/src/components/Dashboard/AttentionQueue.tsx`
- Create: `packages/frontend/src/components/Dashboard/CapacityPanel.tsx`
- Create: `packages/frontend/src/components/Dashboard/EmployeeDashboard.tsx`
- Create: `packages/frontend/src/components/Dashboard/ManagerDashboard.tsx`
- Create: `packages/frontend/src/components/Dashboard/DepartmentHeadDashboard.tsx`
- Create: `packages/frontend/src/components/Dashboard/AdminDashboard.tsx`
- Create: `packages/frontend/src/components/Dashboard/RoleDashboard.tsx`
- Create: `packages/frontend/src/components/Dashboard/RoleDashboard.spec.tsx`
- Modify: `packages/frontend/src/pages/DashboardPage.tsx`

**Interfaces:**
- `RoleDashboardProps`: `{ overview: DashboardOverview; grouped?: GroupedDepartmentTasks; onRetryOverview(): void }`
- Role composition selected from `overview.scope.role`, never tenant-role label alone
- Test file defines `overview({ role }: { role: DashboardViewerRole }): DashboardOverview` with complete literal defaults and `renderDashboard(value: DashboardOverview): void`

- [ ] **Step 1: Write failing role-composition tests**

```tsx
it.each([
  ['employee', ['My workload'], ['Team capacity', 'Create task']],
  ['manager', ['My workload', 'Team capacity', 'Unassigned work'], []],
  ['department_head', ['Manager work', 'Employee work', 'Recent role changes'], []],
  ['admin', ['Department comparison', 'Setup health'], []],
] as const)('renders %s dashboard capabilities', (role, shown, hidden) => {
  renderDashboard(overview({ role }));
  shown.forEach((text) => expect(container.textContent).toContain(text));
  hidden.forEach((text) => expect(container.textContent).not.toContain(text));
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test --workspace=@wrike-clone/frontend -- --run src/components/Dashboard/RoleDashboard.spec.tsx`

Expected: FAIL because role compositions do not exist.

- [ ] **Step 3: Implement shared panels and role compositions**

Replace generic metric cards with Department Pulse. Keep overview failure local while grouped/My Tasks content remains. Preserve department selector. Ensure task links and role-change controls retain existing behavior.

- [ ] **Step 4: Run dashboard and full-stack verification**

Run:

```bash
npm test --workspace=@wrike-clone/backend
npm test --workspace=@wrike-clone/frontend
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/Dashboard packages/frontend/src/pages/DashboardPage.tsx
git commit -m "feat: add role-aware Operations Atlas dashboards"
```
