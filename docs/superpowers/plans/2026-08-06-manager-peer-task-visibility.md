# Manager Peer Task Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let managers view peer managers' tasks throughout the same CEPAA department without granting additional write permission.

**Architecture:** Expand the three existing backend read audiences—shared task queries, dashboard queries, and reports—to include non-head managers alongside employees. Keep tenant and department correlations in SQL, leave mutation authorization untouched, and apply the shared scope identically to task rows and pagination counts.

**Tech Stack:** TypeScript 5.7, NestJS, Knex/PostgreSQL, Jest, npm workspaces

## Global Constraints

- This is read-only; no mutation, assignment, deletion, completion, or role-management permission may broaden.
- Visibility is limited to active members of the same tenant and department.
- Department heads and tenant admins are not included in an ordinary manager audience.
- Primary and multi-assignee relationships behave consistently.
- Dashboard/report totals match visible task rows.
- Follow red-green-refactor: every production change starts with a test that fails for the intended missing behavior.

## File Map

- Modify `packages/backend/src/common/visibility.scope.ts` and its colocated spec: shared task/timeline audience.
- Modify `packages/backend/src/task/task.service.ts` and `packages/backend/test/unit/task.service.spec.ts`: row/count scope parity.
- Modify `packages/backend/src/dashboard/dashboard.service.ts` and its spec: dashboard audience and capacity projection.
- Modify `packages/backend/src/reports/report-audience.ts` and `packages/backend/test/unit/report-audience.spec.ts`: report audience.
- Modify `packages/backend/src/rbac/department-access.service.ts` and its spec: prevent the expanded read scope from enabling peer-manager mutations.
- Pass task IDs through existing mutation call sites and verify direct-API permission tests.

---

### Task 1: Shared Task and Timeline Read Scope

**Files:**
- Modify: `packages/backend/src/common/visibility.scope.spec.ts`
- Modify: `packages/backend/src/common/visibility.scope.ts`
- Modify: `packages/backend/test/unit/task.service.spec.ts`
- Modify: `packages/backend/src/task/task.service.ts`

**Interfaces:**
- Consumes: `applyTaskAccessScope(qb: Knex.QueryBuilder, ctx: TenantContextData): Knex.QueryBuilder`
- Produces: the same signature with peer-manager visibility; no caller API change.

- [ ] **Step 1: Write a failing shared-scope SQL test**

Extend `visibility.scope.spec.ts` to prove the manager-assignee subqueries accept both department roles and remain correlated to the task department and tenant:

```ts
it('lets department managers read employee and peer-manager assignments', () => {
  const db = knex({ client: 'pg' });
  const query = applyTaskAccessScope(db('tasks').select('tasks.id'), context).toSQL();
  const sql = query.sql.replace(/\s+/g, ' ');

  expect(sql).toContain('"visible_member_wm"."role" in (?, ?)');
  expect(sql).toContain('visible_member_wm.workspace_id = tasks.department_id');
  expect(sql).toContain('"visible_member_wm"."tenant_id" = ?');
  expect(query.bindings).toEqual(expect.arrayContaining(['employee', 'manager']));
  db.destroy();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm test -w @wrike-clone/backend -- --runInBand src/common/visibility.scope.spec.ts
```

Expected: FAIL because the current subqueries accept only `employee`.

- [ ] **Step 3: Implement the minimal shared-scope change**

Rename the two employee membership aliases to `visible_member_wm` and change both role predicates to:

```ts
.whereIn('visible_member_wm.role', ['employee', 'manager'])
```

Keep these correlations in both branches:

```ts
.whereRaw('visible_member_wm.workspace_id = tasks.department_id')
.andWhere('visible_member_wm.tenant_id', ctx.tenantId)
```

Do not alter actor-manager checks, self-assignment, department-head/admin branches, or unassigned-task logic.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write a failing task-list count parity test**

In the existing `TaskService.findAll` setup, capture row and count queries and assert both contain the shared scope:

```ts
expect(rowSql).toContain('actor_wm');
expect(countSql).toContain('actor_wm');
expect(rowSql).toContain('visible_member_wm');
expect(countSql).toContain('visible_member_wm');
```

Invoke `findAll` in a non-admin context so authorization is required.

- [ ] **Step 6: Run the task-service test and verify RED**

```bash
npm test -w @wrike-clone/backend -- --runInBand test/unit/task.service.spec.ts
```

Expected: FAIL because `countQuery` omits `applyTaskAccessScope`.

- [ ] **Step 7: Apply the shared scope to the count query**

Immediately after constructing `countQuery`, mirror row authorization:

```ts
if (!tenantAdmin) {
  countQuery = applyTaskAccessScope(countQuery, { ...ctx, role: 'member' });
}
```

Leave all user filter semantics unchanged.

- [ ] **Step 8: Run focused tests and commit**

```bash
npm test -w @wrike-clone/backend -- --runInBand src/common/visibility.scope.spec.ts test/unit/task.service.spec.ts
git add packages/backend/src/common/visibility.scope.ts packages/backend/src/common/visibility.scope.spec.ts packages/backend/src/task/task.service.ts packages/backend/test/unit/task.service.spec.ts
git commit -m "feat: show peer manager tasks in shared reads"
```

Expected: both suites PASS.

---

### Task 2: Dashboard Peer-Manager Visibility

**Files:**
- Modify: `packages/backend/src/dashboard/dashboard.service.spec.ts`
- Modify: `packages/backend/src/dashboard/dashboard.service.ts`

**Interfaces:**
- Consumes: `buildDashboardRowsQuery(db: Knex, scope: DashboardQueryScope): Knex.QueryBuilder`
- Produces: unchanged API whose manager scope includes active non-head employees and managers in the department.

- [ ] **Step 1: Write failing dashboard SQL tests**

Add:

```ts
it('includes peer managers in a manager dashboard scope', () => {
  const query = buildDashboardRowsQuery(db, {
    tenantId: 'tenant-1',
    userId: 'manager-1',
    role: 'manager',
    departmentId: 'department-1',
  }).toSQL();
  const sql = query.sql.replace(/\s+/g, ' ');

  expect(sql).not.toContain('dashboard_member_workspace"."role" <> ?');
  expect(sql).not.toContain('dashboard_member_tenant"."role" <> ?');
  expect(sql).toContain('dashboard_member_head');
  expect(query.bindings).toEqual(expect.arrayContaining(['tenant-1', 'department-1']));
});
```

Also assert the assignee projection retains peer-manager names while preserving admin and department-head exclusions.

- [ ] **Step 2: Run dashboard tests and verify RED**

```bash
npm test -w @wrike-clone/backend -- --runInBand src/dashboard/dashboard.service.spec.ts
```

Expected: FAIL because `managerEmployeeIds` and `assigneeProjection` reject manager roles.

- [ ] **Step 3: Expand the dashboard visible member set**

Rename `managerEmployeeIds` to `managerVisibleMemberIds`. Keep active membership, tenant, department, tenant-admin exclusion, and department-head exclusion. Remove only:

```ts
.whereNot('dashboard_member_workspace.role', 'manager')
.whereNot('dashboard_member_tenant.role', 'manager')
```

Update all calls in `applyManagerScope`.

- [ ] **Step 4: Update the assignee projection**

Remove the two manager inequality predicates and corresponding bindings from the manager `rolePredicate`. Retain active membership, tenant correlation, tenant-admin exclusion, and the `NOT EXISTS department_heads` exclusion.

- [ ] **Step 5: Run dashboard suites and commit**

```bash
npm test -w @wrike-clone/backend -- --runInBand src/dashboard/dashboard.service.spec.ts src/dashboard/dashboard-metrics.spec.ts
git add packages/backend/src/dashboard/dashboard.service.ts packages/backend/src/dashboard/dashboard.service.spec.ts
git commit -m "feat: include peer managers on department dashboards"
```

Expected: PASS; capacity can include both Atul and Shivam.

---

### Task 3: Report Audience Peer Managers

**Files:**
- Modify: `packages/backend/test/unit/report-audience.spec.ts`
- Modify: `packages/backend/src/reports/report-audience.ts`

**Interfaces:**
- Consumes: `buildManagerAudience(currentUserId: string, members: ReportDepartmentMember[])`
- Produces: self, employees, and non-head managers with `includeUnassigned: true`.

- [ ] **Step 1: Change report expectations first**

```ts
it('includes self, employees, and peer managers but excludes heads and admins', () => {
  expect(buildManagerAudience('manager-1', members)).toEqual({
    userIds: ['manager-1', 'manager-2', 'employee-1'],
    includeUnassigned: true,
  });
});
```

Add a peer manager to the ReportService effective-member fixture and expect that ID in both `audience.userIds` and `audience.allowedTargetUserIds`.

- [ ] **Step 2: Run report tests and verify RED**

```bash
npm test -w @wrike-clone/backend -- --runInBand test/unit/report-audience.spec.ts test/unit/report.service.spec.ts
```

Expected: FAIL because the current function filters to employees.

- [ ] **Step 3: Implement the minimal report change**

```ts
.filter(
  (member) =>
    (member.role === 'employee' || member.role === 'manager') &&
    !member.isDepartmentHead &&
    member.userId !== currentUserId,
)
```

Keep `currentUserId` first to avoid duplicates. Never include `admin` or `department_head`.

- [ ] **Step 4: Run report tests and commit**

```bash
npm test -w @wrike-clone/backend -- --runInBand test/unit/report-audience.spec.ts test/unit/report.service.spec.ts
git add packages/backend/src/reports/report-audience.ts packages/backend/test/unit/report-audience.spec.ts
git commit -m "feat: include peer managers in reports"
```

Expected: PASS; individual report targeting permits Atul↔Shivam within CEPAA.

---

### Task 4: Read/Write Boundary and Full Verification

**Files:**
- Test only: existing backend and workspace suites.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: verification evidence; no production API change.

- [ ] **Step 1: Verify write permissions remain unchanged**

```bash
npm test -w @wrike-clone/backend -- --runInBand src/rbac/department-access.service.spec.ts test/unit/department-permissions.direct-api.spec.ts
```

Expected: PASS, including manager assignment and direct-API denial tests. If the current suite does not cover peer-manager task mutation, first add a service authorization test that expects rejection; do not change production write authorization.

- [ ] **Step 2: Run the full backend suite**

```bash
npm test -w @wrike-clone/backend -- --runInBand
```

Expected: zero failed backend tests.

- [ ] **Step 3: Run typecheck and build**

```bash
npm run typecheck
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 4: Inspect the final diff**

```bash
git diff HEAD~3 --check
git diff HEAD~3 -- packages/backend/src packages/backend/test
git status --short
```

Confirm only read scopes/tests changed, tenant/department predicates remain, and no mutation or RLS code changed.

- [ ] **Step 5: Commit only if verification required a test correction**

```bash
git add packages/backend
git commit -m "test: verify manager peer visibility boundaries"
```

Do not create an empty commit when no correction is needed.
