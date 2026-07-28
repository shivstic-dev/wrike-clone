# Reliable Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make report defaults match the viewer's role, show current matching task rows onscreen, and export the exact same data to PDF and XLSX.

**Architecture:** Remove the schema-level `self` default and resolve the effective audience in the backend from the current department role. Represent unassigned inclusion explicitly in `ResolvedReportAudience`, apply one shared report builder to screen and exports, and derive frontend controls from the backend-resolved scope.

**Tech Stack:** NestJS, Knex, PostgreSQL/Supabase, PDFKit, fflate/XLSX XML, Zod, React 19, TanStack Query, TypeScript, Jest, Vitest.

**Approved design:** `docs/superpowers/specs/2026-07-28-quick-tasks-and-reliable-reports-design.md`

**Prerequisite:** Execute
`docs/superpowers/plans/2026-07-28-quick-tasks.md` first so the
`task-locations.ts` movement mutation exists for the report-invalidation step.

## Global Constraints

- Employee default: assigned personal tasks.
- Manager default: self, employees, and unassigned tasks in the department.
- Department-head default: every task in the department, including unassigned.
- Tenant-admin default: every task in the organization or selected department, including unassigned.
- Managers must not receive tasks owned only by another manager or department head.
- Explicit self and individual scopes remain permission-checked.
- Screen and export must use the exact same normalized filters and task rows.
- Empty results must explain active filters and disable export.
- Existing PDF and XLSX formats remain valid.
- Do not stage or modify the user's existing `.env.example` change.

---

## File Structure

- `packages/shared/src/validation/index.ts`: makes report scope optional instead of silently defaulting to self.
- `packages/shared/test/validation.spec.ts`: report filter contract tests.
- `packages/backend/src/reports/report-audience.ts`: pure role-default and audience helpers.
- `packages/backend/src/reports/report.service.ts`: resolves role audiences, includes permitted unassigned work, and returns task rows.
- `packages/backend/test/unit/report-audience.spec.ts`: role matrix tests.
- `packages/backend/test/unit/report.service.spec.ts`: report query/result tests.
- `packages/backend/test/unit/report-export.service.spec.ts`: metadata and row parity tests.
- `packages/frontend/src/api/reports.ts`: normalized filters and safe download errors.
- `packages/frontend/src/api/reports.spec.ts`: filter/default helpers.
- `packages/frontend/src/components/Reports/report-controls.ts`: pure role-aware control state.
- `packages/frontend/src/components/Reports/report-controls.spec.ts`: frontend role-default tests.
- `packages/frontend/src/components/Reports/ReportsPanel.tsx`: role defaults, task table, empty state and disabled exports.
- `packages/frontend/src/api/tasks.ts`: report cache invalidation after writes.
- `packages/frontend/src/api/task-locations.ts`: report cache invalidation after task movement.

---

### Task 1: Remove the incorrect schema-level self default

**Files:**
- Modify: `packages/shared/src/validation/index.ts`
- Modify: `packages/shared/test/validation.spec.ts`

**Interfaces:**
- Consumes: `departmentReportFilterSchema`.
- Produces: `scope?: 'self' | 'individual' | 'combined'`, allowing backend role resolution when omitted.

- [ ] **Step 1: Write failing report-filter tests**

```typescript
describe('departmentReportFilterSchema', () => {
  it('preserves omitted scope for role-aware backend defaults', () => {
    const result = departmentReportFilterSchema.parse({});
    expect(result.scope).toBeUndefined();
  });

  it('still requires a target for explicit individual scope', () => {
    expect(
      departmentReportFilterSchema.safeParse({ scope: 'individual' }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/shared -- --runInBand validation.spec.ts
```

Expected: FAIL because omitted scope currently becomes `self`.

- [ ] **Step 3: Remove only the Zod default**

```typescript
scope: z.enum(['self', 'individual', 'combined']).optional(),
```

Retain both existing refinements for individual target and date ordering.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm test --workspace=@wrike-clone/shared -- --runInBand validation.spec.ts
npm run typecheck --workspace=@wrike-clone/shared
npm run build --workspace=@wrike-clone/shared
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- 'packages/shared/src/validation/index.ts' 'packages/shared/test/validation.spec.ts'
git commit -m "fix: preserve omitted report scope"
```

---

### Task 2: Extract and test role-aware report audiences

**Files:**
- Create: `packages/backend/src/reports/report-audience.ts`
- Create: `packages/backend/test/unit/report-audience.spec.ts`
- Modify: `packages/backend/src/reports/report.service.ts`

**Interfaces:**
- Consumes: `DepartmentRole`, requested scope, current user, and department members.
- Produces:

```typescript
export interface ResolvedReportAudience {
  departmentId?: string;
  role: DepartmentRole;
  mode: 'self' | 'individual' | 'combined';
  userIds: string[] | null;
  includeUnassigned: boolean;
  allowedTargetUserIds: string[] | null;
}

export interface ReportDepartmentMember {
  userId: string;
  role: DepartmentRole;
  isDepartmentHead: boolean;
}
```

- [ ] **Step 1: Write failing role-matrix tests**

```typescript
describe('resolveReportMode', () => {
  it.each([
    ['employee', 'self'],
    ['manager', 'combined'],
    ['department_head', 'combined'],
    ['admin', 'combined'],
  ])('defaults %s to %s', (role, expected) => {
    expect(resolveReportMode(role as DepartmentRole, undefined)).toBe(expected);
  });

  it('does not let an employee request combined', () => {
    expect(() => resolveReportMode('employee', 'combined')).toThrow(
      'Employees may only run reports for themselves',
    );
  });
});

describe('buildManagerAudience', () => {
  it('includes self and employees but excludes heads and other managers', () => {
    expect(buildManagerAudience('manager-1', members)).toEqual({
      userIds: ['manager-1', 'employee-1'],
      includeUnassigned: true,
    });
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand report-audience.spec.ts
```

Expected: FAIL because the audience helpers do not exist.

- [ ] **Step 3: Implement pure audience helpers**

```typescript
export function resolveReportMode(
  role: DepartmentRole,
  requested?: 'self' | 'individual' | 'combined',
): 'self' | 'individual' | 'combined' {
  const mode = requested || (role === 'employee' ? 'self' : 'combined');
  if (role === 'employee' && mode !== 'self') {
    throw new ForbiddenException('Employees may only run reports for themselves');
  }
  return mode;
}

export function buildManagerAudience(
  currentUserId: string,
  members: ReportDepartmentMember[],
) {
  return {
    userIds: [
      currentUserId,
      ...members
        .filter((member) => member.role === 'employee' && !member.isDepartmentHead)
        .map((member) => member.userId),
    ],
    includeUnassigned: true,
  };
}
```

Add exact-audience and unrestricted-audience helpers:

```typescript
export function buildExactAudience(userId: string) {
  return { userIds: [userId], includeUnassigned: false };
}

export function buildUnrestrictedAudience() {
  return { userIds: null, includeUnassigned: true };
}
```

Use `buildUnrestrictedAudience()` for department-head/admin combined reports.
The existing `tasks.department_id` predicate provides the selected-department
boundary; an organization-wide admin has no department predicate.

When loading `ReportDepartmentMember[]`, join active
`tenant_memberships` on both `tenant_id` and `user_id`. Set the effective role
to `department_head` when `department_heads.id` exists, otherwise to `manager`
when either `workspace_members.role` or `tenant_memberships.role` is manager,
otherwise to employee. This prevents a tenant-level manager stored as an
ordinary workspace member from being included in another manager's employee
audience.

```typescript
const departmentMembers = await this.db('workspace_members')
  .leftJoin('department_heads', function () {
    this.on('department_heads.department_id', '=', 'workspace_members.workspace_id')
      .andOn('department_heads.user_id', '=', 'workspace_members.user_id');
  })
  .join('tenant_memberships', function () {
    this.on('tenant_memberships.tenant_id', '=', 'workspace_members.tenant_id')
      .andOn('tenant_memberships.user_id', '=', 'workspace_members.user_id');
  })
  .where({
    'workspace_members.tenant_id': ctx.tenantId,
    'workspace_members.workspace_id': base.departmentId,
    'tenant_memberships.is_active': true,
  })
  .select(
    'workspace_members.user_id as userId',
    this.db.raw(`
      CASE
        WHEN department_heads.id IS NOT NULL THEN 'department_head'
        WHEN workspace_members.role = 'manager'
          OR tenant_memberships.role = 'manager' THEN 'manager'
        ELSE 'employee'
      END AS role
    `),
    this.db.raw('(department_heads.id IS NOT NULL) AS "isDepartmentHead"'),
  ) as ReportDepartmentMember[];
```

- [ ] **Step 4: Integrate `ResolvedReportAudience` into ReportService**

Replace the private audience shape and `filter.scope || 'self'` with:

```typescript
const mode = resolveReportMode(base.role, filter.scope);
```

Use the helpers on every branch:

```typescript
if (role === 'employee' || mode === 'self') {
  return {
    departmentId: base.departmentId,
    role,
    mode,
    ...buildExactAudience(ctx.userId),
    allowedTargetUserIds: [ctx.userId],
  };
}
const managerAudience =
  role === 'manager' ? buildManagerAudience(ctx.userId, departmentMembers) : null;
const allowedUserIds = managerAudience
  ? managerAudience.userIds
  : base.departmentId
    ? departmentMembers.map((member) => member.userId)
    : null;
if (mode === 'individual') {
  const target = filter.targetUserId!;
  await this.assertReportTargetAllowed(target, allowedUserIds);
  return {
    departmentId: base.departmentId,
    role,
    mode,
    ...buildExactAudience(target),
    allowedTargetUserIds: [target],
  };
}
const audience =
  managerAudience || buildUnrestrictedAudience();
return {
  departmentId: base.departmentId,
  role,
  mode,
  ...audience,
  allowedTargetUserIds: allowedUserIds,
};
```

Preserve `assertReportTargetAllowed` for explicit individual and assignee
filters.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand report-audience.spec.ts
npm run typecheck --workspace=@wrike-clone/backend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- 'packages/backend/src/reports/report-audience.ts' `
  'packages/backend/src/reports/report.service.ts' `
  'packages/backend/test/unit/report-audience.spec.ts'
git commit -m "fix: resolve reports by viewer role"
```

---

### Task 3: Include permitted unassigned work without leaking manager tasks

**Files:**
- Modify: `packages/backend/src/reports/report.service.ts`
- Create: `packages/backend/test/unit/report.service.spec.ts`

**Interfaces:**
- Consumes: `ResolvedReportAudience`.
- Produces: one task query that combines allowed assignments with permitted unassigned rows.

- [ ] **Step 1: Write failing report result tests**

Use a table-aware test database containing:

- one task assigned to the current manager;
- one assigned to an employee;
- one assigned only to another manager;
- one unassigned task;
- one soft-deleted task.

```typescript
it('manager combined includes self, employees and unassigned only', async () => {
  const report = await service.build({ departmentId: 'dept-1' });
  expect(report.tasks.map((task) => task.title)).toEqual([
    'Manager task',
    'Employee task',
    'Unassigned task',
  ]);
});

it('admin omitted scope includes all current organization tasks', async () => {
  const report = await runAsAdmin(() => service.build({}));
  expect(report.totals.tasks).toBe(4);
  expect(report.scope.mode).toBe('combined');
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand report.service.spec.ts
```

Expected: FAIL because omitted scope is self and unassigned tasks are excluded
when `userIds` is present.

- [ ] **Step 3: Replace assignment-only filtering**

```typescript
private applyAudience(query: Knex.QueryBuilder, audience: ResolvedReportAudience): void {
  if (!audience.userIds) return;
  const ctx = requireTenantContext();
  query.andWhere((visible) => {
    visible
      .whereIn('tasks.assignee_id', audience.userIds!)
      .orWhereExists(function () {
        this.select(1)
          .from('task_assignees as report_scope_ta')
          .whereRaw('report_scope_ta.task_id = tasks.id')
          .andWhere('report_scope_ta.tenant_id', ctx.tenantId)
          .whereIn('report_scope_ta.user_id', audience.userIds!);
      });
    if (audience.includeUnassigned) {
      visible.orWhere((unassigned) =>
        unassigned.whereNull('tasks.assignee_id').whereNotExists(function () {
          this.select(1)
            .from('task_assignees as report_any_ta')
            .whereRaw('report_any_ta.task_id = tasks.id')
            .andWhere('report_any_ta.tenant_id', ctx.tenantId);
        }),
      );
    }
  });
}
```

Use `applyAudience(query, scope)` once. Keep a second exact assignment
predicate for an explicit `assigneeId`; it must not include unassigned rows.

```typescript
if (filter.assigneeId) {
  await this.assertReportTargetAllowed(
    filter.assigneeId,
    scope.allowedTargetUserIds,
  );
  this.whereAssignedTo(query, [filter.assigneeId]);
}
```

- [ ] **Step 4: Return resolved scope and active filters**

```typescript
scope: {
  departmentId: scope.departmentId,
  role: scope.role,
  mode: scope.mode,
  ownTasksOnly: scope.mode === 'self',
},
filters: {
  dateFrom: filter.dateFrom?.toISOString(),
  dateTo: filter.dateTo?.toISOString(),
  status: filter.status,
  priority: filter.priority,
  assigneeId: filter.assigneeId,
  scope: scope.mode,
  targetUserId: filter.targetUserId,
},
```

- [ ] **Step 5: Verify GREEN and authorization regressions**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand report.service.spec.ts report-audience.spec.ts department-access.service.spec.ts
npm test --workspace=@wrike-clone/backend -- --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- 'packages/backend/src/reports/report.service.ts' `
  'packages/backend/test/unit/report.service.spec.ts'
git commit -m "fix: include permitted unassigned report tasks"
```

---

### Task 4: Guarantee screen/export row parity and useful metadata

**Files:**
- Modify: `packages/backend/src/reports/report.service.ts`
- Modify: `packages/backend/test/unit/report-export.service.spec.ts`

**Interfaces:**
- Consumes: `DepartmentReport` from Task 3.
- Produces: PDF/XLSX files containing resolved scope, filters and every onscreen task row.

- [ ] **Step 1: Write failing export metadata tests**

```typescript
it('writes the resolved scope and filters into XLSX summary', async () => {
  const buffer = await (service as any).toXlsx(report);
  const files = unzipSync(buffer);
  const summary = new TextDecoder().decode(files['xl/worksheets/sheet1.xml']);
  expect(summary).toContain('Scope');
  expect(summary).toContain('combined');
  expect(summary).toContain('Status filter');
});

it('exports every task row from the report object', async () => {
  const buffer = await (service as any).toXlsx(report);
  const tasks = new TextDecoder().decode(
    unzipSync(buffer)['xl/worksheets/sheet3.xml'],
  );
  for (const task of report.tasks) expect(tasks).toContain(task.title);
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand report-export.service.spec.ts
```

Expected: FAIL because Summary lacks scope/filter rows.

- [ ] **Step 3: Add scope and filter rows to both formats**

Create one metadata-row helper and use it in both exporters:

```typescript
private reportMetadataRows(report: DepartmentReport): Array<[string, string]> {
  return [
    ['Scope', report.scope.mode],
    ['Role', report.scope.role],
    ['Department', report.scope.departmentId || 'All departments'],
    ['Created from', report.filters.dateFrom || 'Any'],
    ['Created to', report.filters.dateTo || 'Any'],
    ['Status filter', report.filters.status || 'All'],
    ['Priority filter', report.filters.priority || 'All'],
    ['Assignee filter', report.filters.assigneeId || 'All'],
  ];
}
```

Spread `this.reportMetadataRows(report)` into the XLSX Summary rows. In the PDF
header, render the same rows before metrics:

```typescript
for (const [label, value] of this.reportMetadataRows(report)) {
  document.font('Helvetica-Bold').text(`${label}: `, { continued: true });
  document.font('Helvetica').text(value);
}
```

Continue deriving all task rows only from `report.tasks`.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand report-export.service.spec.ts
```

Expected: PASS with valid `PK` XLSX and `%PDF-` PDF headers.

- [ ] **Step 5: Commit**

```powershell
git add -- 'packages/backend/src/reports/report.service.ts' `
  'packages/backend/test/unit/report-export.service.spec.ts'
git commit -m "feat: add scope metadata to report exports"
```

---

### Task 5: Add frontend role defaults and filter normalization

**Files:**
- Create: `packages/frontend/src/components/Reports/report-controls.ts`
- Create: `packages/frontend/src/components/Reports/report-controls.spec.ts`
- Modify: `packages/frontend/src/api/reports.ts`
- Create: `packages/frontend/src/api/reports.spec.ts`

**Interfaces:**
- Consumes: tenant membership and department role.
- Produces:
  - `defaultReportScope(tenantRole, departmentRole)`
  - `buildReportParams(filters)`
  - `describeActiveReportFilters(filters)`

- [ ] **Step 1: Write failing role-default tests**

```typescript
it.each([
  ['member', 'employee', 'self'],
  ['member', 'manager', 'combined'],
  ['member', 'department_head', 'combined'],
  ['admin', undefined, 'combined'],
])('defaults %s/%s to %s', (tenantRole, departmentRole, expected) => {
  expect(defaultReportScope(tenantRole, departmentRole)).toBe(expected);
});

it('offers employees only self scope', () => {
  expect(allowedReportScopes('member', 'employee')).toEqual(['self']);
});

it('offers management all permission-checked scopes', () => {
  expect(allowedReportScopes('member', 'manager')).toEqual([
    'self',
    'individual',
    'combined',
  ]);
});

it('limits a manager person picker to self and employees', () => {
  expect(
    permittedReportMembers(
      [
        { userId: 'manager-1', role: 'manager' },
        { userId: 'manager-2', role: 'manager' },
        { userId: 'employee-1', role: 'employee' },
        { userId: 'head-1', role: 'department_head' },
      ],
      'manager',
      'manager-1',
    ).map((member) => member.userId),
  ).toEqual(['manager-1', 'employee-1']);
});

it('disables export when the current report has no tasks', () => {
  expect(canExportReport(true, 0, false)).toBe(false);
  expect(canExportReport(true, 1, false)).toBe(true);
});
```

Add a serialization test:

```typescript
it('omits empty filters and sends the effective scope', () => {
  expect(
    buildReportParams({
      departmentId: '',
      dateFrom: '',
      dateTo: '',
      scope: 'combined',
    }),
  ).toEqual({ scope: 'combined' });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend -- --run src/components/Reports/report-controls.spec.ts src/api/reports.spec.ts
```

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement helpers**

```typescript
export function defaultReportScope(
  tenantRole?: string,
  departmentRole?: string,
): ReportScope {
  if (tenantRole === 'admin') return 'combined';
  return departmentRole === 'manager' || departmentRole === 'department_head'
    ? 'combined'
    : 'self';
}

export function allowedReportScopes(
  tenantRole?: string,
  departmentRole?: string,
): ReportScope[] {
  return tenantRole === 'admin' ||
    departmentRole === 'admin' ||
    departmentRole === 'department_head' ||
    departmentRole === 'manager'
    ? ['self', 'individual', 'combined']
    : ['self'];
}

export function permittedReportMembers<T extends { userId: string; role: string }>(
  members: T[],
  viewerRole: string | undefined,
  currentUserId: string | undefined,
): T[] {
  if (viewerRole === 'employee') {
    return members.filter((member) => member.userId === currentUserId);
  }
  if (viewerRole === 'manager') {
    return members.filter(
      (member) => member.userId === currentUserId || member.role === 'employee',
    );
  }
  return members;
}

export function canExportReport(
  enabled: boolean,
  taskCount: number,
  exporting: boolean,
): boolean {
  return enabled && taskCount > 0 && !exporting;
}

export function buildReportParams(filters: ReportFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined),
  ) as Record<string, string>;
}
```

`describeActiveReportFilters` returns readable phrases such as
`Department: CEPA · Status: To do · Created from: 2026-07-01`.

- [ ] **Step 4: Use normalized parameters for screen and export**

```typescript
const params = buildReportParams(filters);
await apiClient.get('/reports/departments', { params });
await apiClient.get('/reports/departments/export', {
  params: { ...params, format },
  responseType: 'blob',
});
```

On export error, parse a safe backend message with:

```typescript
export async function reportExportErrorMessage(error: unknown): Promise<string> {
  if (!axios.isAxiosError(error)) {
    return 'The report could not be exported. Please retry.';
  }
  const payload =
    error.response?.data instanceof Blob
      ? await error.response.data.text()
      : error.response?.data;
  try {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    return typeof parsed?.message === 'string'
      ? parsed.message
      : 'The report could not be exported. Please retry.';
  } catch {
    return 'The report could not be exported. Please retry.';
  }
}
```

The export mutation catches its request error and throws
`new Error(await reportExportErrorMessage(error))`.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend -- --run src/components/Reports/report-controls.spec.ts src/api/reports.spec.ts
npm run typecheck --workspace=@wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- 'packages/frontend/src/components/Reports/report-controls.ts' `
  'packages/frontend/src/components/Reports/report-controls.spec.ts' `
  'packages/frontend/src/api/reports.ts' `
  'packages/frontend/src/api/reports.spec.ts'
git commit -m "fix: add role-aware report controls"
```

---

### Task 6: Show current rows and prevent empty exports

**Files:**
- Modify: `packages/frontend/src/components/Reports/ReportsPanel.tsx`

**Interfaces:**
- Consumes: Task 5 control helpers and `DepartmentReport.tasks`.
- Produces: correct initial scope, visible task table, active-filter empty state, and disabled empty export.

- [ ] **Step 1: Extend the frontend report type**

Add to `DepartmentReport` in `packages/frontend/src/api/reports.ts`:

```typescript
filters: Record<string, string | undefined>;
tasks: Array<{
  id: string;
  departmentName: string;
  title: string;
  assigneeName: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
}>;
```

The backend camel-case interceptor converts database aliases to this contract.

- [ ] **Step 2: Derive scope whenever the reporting context changes**

Replace the unconditional `useState('self')` behavior with:

```typescript
const { membership, user } = useAuth();
const reportContextKey = [
  membership?.role || '',
  departmentId || 'all',
  departmentRole || '',
].join(':');
const [scopeSelection, setScopeSelection] = useState<{
  contextKey: string;
  value: ReportScope;
} | null>(null);
const roleReady = isAdmin || !!departmentRole;
const scope =
  scopeSelection?.contextKey === reportContextKey
    ? scopeSelection.value
    : defaultReportScope(membership?.role, departmentRole);
const changeScope = (value: ReportScope) =>
  setScopeSelection({ contextKey: reportContextKey, value });
```

Bind the scope control to `scope` and `changeScope`. Enable the report query
only when `roleReady` is true. Changing departments now receives that
department's correct default instead of keeping an invalid scope from the
previous department.

Render scope options only from the permission helper:

```tsx
<select
  value={scope}
  onChange={(event) => changeScope(event.target.value as ReportScope)}
>
  {allowedReportScopes(membership?.role, departmentRole).map((option) => (
    <option key={option} value={option}>
      {option === 'self' ? 'My tasks' : option === 'individual' ? 'One person' : 'Combined team'}
    </option>
  ))}
</select>
```

Use the same permitted member list for `Report person` and `Assignee`:

```typescript
const reportMembers = permittedReportMembers(
  members.data || [],
  isAdmin ? 'admin' : departmentRole,
  user?.id,
);
```

Map both controls from `reportMembers` and clear incompatible selections when
the context changes:

```typescript
useEffect(() => {
  setTargetUserId('');
  setAssigneeId('');
}, [reportContextKey]);
```

- [ ] **Step 3: Make date labels explicit and export state truthful**

Rename labels to `Created from` and `Created to`. Disable buttons when:

```typescript
const canExport = canExportReport(enabled, data?.tasks.length || 0, !!exporting);
```

Display the caught error:

```typescript
catch (error) {
  toast.error(error instanceof Error ? error.message : 'Report export failed');
}
```

- [ ] **Step 4: Render active-filter empty state and task rows**

When the query fails, keep the controls mounted and render a retry action:

```tsx
{isError && (
  <EmptyState
    title="Report could not be loaded"
    description="Your filters are still selected. Retry when the connection is available."
    action={
      <button type="button" onClick={() => refetch()}>
        Retry report
      </button>
    }
  />
)}
```

When `data.tasks.length === 0`, render:

```tsx
<EmptyState
  title="No tasks match this report"
  description={describeActiveReportFilters(filters)}
/>
```

Otherwise render a responsive table with:

```tsx
{data.tasks.map((task) => (
  <tr key={task.id}>
    <td>{task.departmentName}</td>
    <td><Link to={`/tasks/${task.id}`}>{task.title}</Link></td>
    <td>{task.assigneeName || 'Unassigned'}</td>
    <td>{task.status.replace('_', ' ')}</td>
    <td>{task.priority}</td>
    <td>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}</td>
  </tr>
))}
```

- [ ] **Step 5: Verify frontend quality gates**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend
npm run typecheck --workspace=@wrike-clone/frontend
npm run lint --workspace=@wrike-clone/frontend
npm run build --workspace=@wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- 'packages/frontend/src/components/Reports/ReportsPanel.tsx' `
  'packages/frontend/src/api/reports.ts'
git commit -m "fix: show current report task data"
```

---

### Task 7: Refresh reports after every task write

**Files:**
- Modify: `packages/frontend/src/api/tasks.ts`
- Modify: `packages/frontend/src/api/task-locations.ts`
- Modify: `packages/frontend/src/api/tasks.spec.ts`

**Interfaces:**
- Consumes: every task mutation hook.
- Produces: `invalidateTaskDependentQueries(queryClient)` used after create,
  update, delete, assignment and movement.

- [ ] **Step 1: Write a failing invalidation-key test**

```typescript
it('defines reports as task-dependent server state', () => {
  expect(taskDependentQueryKeys).toContainEqual(['reports']);
  expect(taskDependentQueryKeys).toContainEqual(['tasks']);
  expect(taskDependentQueryKeys).toContainEqual(['folders']);
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend -- --run src/api/tasks.spec.ts
```

Expected: FAIL because the shared invalidation keys do not exist.

- [ ] **Step 3: Implement one invalidation helper**

```typescript
export const taskDependentQueryKeys = [
  ['tasks'],
  ['reports'],
  ['workspaces'],
  ['folders'],
] as const;

export function invalidateTaskDependentQueries(queryClient: QueryClient): void {
  for (const queryKey of taskDependentQueryKeys) {
    queryClient.invalidateQueries({ queryKey });
  }
}
```

Call it from the existing create, update, delete, add-assignee, and
remove-assignee success handlers in `tasks.ts`, and from the location-move
success handler in `task-locations.ts`. Preserve detail-cache updates where
they exist.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend -- --run src/api/tasks.spec.ts
npm run typecheck --workspace=@wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- 'packages/frontend/src/api/tasks.ts' `
  'packages/frontend/src/api/task-locations.ts' `
  'packages/frontend/src/api/tasks.spec.ts'
git commit -m "fix: refresh reports after task changes"
```

---

### Task 8: Verify report correctness against production data

**Files:**
- Modify only if verification finds a defect in files already named above.

**Interfaces:**
- Consumes: all Reliable Reports tasks.
- Produces: evidence that onscreen and exported rows match production task data.

- [ ] **Step 1: Run the full local report gate**

```powershell
npm test --workspace=@wrike-clone/shared -- --runInBand validation.spec.ts
npm test --workspace=@wrike-clone/backend -- --runInBand report-audience.spec.ts report.service.spec.ts report-export.service.spec.ts
npm test --workspace=@wrike-clone/frontend
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 2: Verify production source counts with read-only SQL**

```sql
SELECT
  count(*) FILTER (WHERE deleted_at IS NULL) AS organization_tasks,
  count(*) FILTER (
    WHERE deleted_at IS NULL
      AND assignee_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = tasks.id
          AND ta.tenant_id = tasks.tenant_id
      )
  ) AS unassigned_tasks
FROM tasks;
```

Record the counts for comparison; do not mutate production rows.

- [ ] **Step 3: Push the completed release**

```powershell
git push origin main
```

Expected: GitHub accepts the exact local commit range.

- [ ] **Step 4: Verify the production report story**

1. Wait for the exact commit on Railway and Vercel.
2. Log in as the admin account.
3. Confirm initial scope is Combined team and organization task total matches
   the read-only SQL count.
4. Select a department and confirm the total narrows correctly.
5. Confirm task title, assignee, status, priority and due date appear onscreen.
6. Export XLSX and verify Summary, Per user, and Tasks worksheets.
7. Export PDF and verify the same task titles and scope/filter labels.
8. Choose a filter with no matches and confirm export buttons are disabled.
9. Create or move a task and confirm the open report refreshes.
10. Confirm Railway health is 200 and Vercel runtime-error scan is clean.

- [ ] **Step 5: Commit a correction only if verification discovered one**

If no correction was required, skip this step. Otherwise:

```powershell
git add -- 'packages/shared/src/validation/index.ts' `
  'packages/shared/test/validation.spec.ts' `
  'packages/backend/src/reports/report-audience.ts' `
  'packages/backend/src/reports/report.service.ts' `
  'packages/backend/test/unit/report-audience.spec.ts' `
  'packages/backend/test/unit/report.service.spec.ts' `
  'packages/backend/test/unit/report-export.service.spec.ts' `
  'packages/frontend/src/api/reports.ts' `
  'packages/frontend/src/api/reports.spec.ts' `
  'packages/frontend/src/api/tasks.ts' `
  'packages/frontend/src/api/task-locations.ts' `
  'packages/frontend/src/api/tasks.spec.ts' `
  'packages/frontend/src/components/Reports/report-controls.ts' `
  'packages/frontend/src/components/Reports/report-controls.spec.ts' `
  'packages/frontend/src/components/Reports/ReportsPanel.tsx'
git commit -m "fix: complete production report verification"
git push origin main
```
