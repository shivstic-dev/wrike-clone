# Gantt Timeline and Production Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver working project and dashboard Gantt timelines with persisted scheduling, complete dependency semantics, role-aware editing, critical-path highlighting, and a verified Supabase/Railway/Vercel release.

**Architecture:** Add a focused NestJS `TimelineModule` that owns date-window reads, schedule writes, dependency graph validation, per-task capabilities, and critical-path calculation. Rebuild the dormant Gantt as small React components driven by dedicated timeline contracts and React Query, using optimistic schedule mutations with rollback. Deploy additive database integrity first, Railway backend second, and Vercel frontend last.

**Tech Stack:** PostgreSQL 17 / Supabase, Knex 3, NestJS 11, Zod, React 19, TanStack Query 5, TanStack Virtual 3, date-fns 4, SVG, Pointer Events, Jest, Vitest, Vercel, Railway.

## Global Constraints

- Gantt must exist in both Dashboard Timeline and Project Timeline.
- Day, week, and month zoom are required.
- Unscheduled tasks must remain in an explicit lane; no fake dates.
- Managers and department heads may edit tasks and dependencies in their existing scope.
- Employees may edit only tasks they already have permission to manage.
- Backend authorization is authoritative; frontend capabilities only control presentation.
- Support finish-to-start, start-to-start, finish-to-finish, and start-to-finish dependencies with integer lag days.
- Reject invalid date ranges, self-dependencies, cycles, cross-tenant links, stale writes, and unauthorized edits.
- More than 100 tasks must not be silently omitted.
- Failed optimistic edits must visibly roll back.
- Do not add resource leveling or automatic schedule optimization.
- No paid service or new file-storage system is introduced.
- Existing dirty worktree changes belong to the user and must not be reset or overwritten.
- Execute this plan after `2026-07-30-handoff-confirmation-dashboard.md`.

---

## File Structure

### Create

- `packages/backend/src/migrations/022_timeline_integrity.ts` — Railway dependency/date integrity migration.
- `supabase/migrations/20260730101000_timeline_integrity.sql` — equivalent production Supabase migration.
- `packages/backend/test/unit/timeline-integrity-migration.spec.ts` — migration contract.
- `packages/backend/src/timeline/timeline.module.ts` — module boundary.
- `packages/backend/src/timeline/timeline.controller.ts` — timeline, schedule, and dependency routes.
- `packages/backend/src/timeline/timeline.service.ts` — scoped reads and schedule writes.
- `packages/backend/src/timeline/dependency.service.ts` — tenant-safe dependency commands.
- `packages/backend/src/timeline/dependency-graph.ts` — pure cycle and critical-path algorithms.
- `packages/backend/src/timeline/dependency-graph.spec.ts` — graph unit tests.
- `packages/backend/test/unit/timeline.service.spec.ts` — read, scope, cursor, and schedule tests.
- `packages/backend/test/unit/dependency.service.spec.ts` — command and RBAC tests.
- `packages/backend/test/unit/timeline.controller.spec.ts` — route and schema tests.
- `packages/frontend/src/api/timeline.ts` — query keys, reads, and mutations.
- `packages/frontend/src/api/timeline.spec.ts` — request serialization and rollback.
- `packages/frontend/src/components/Gantt/timeline-scale.ts` — date-to-pixel scale utilities.
- `packages/frontend/src/components/Gantt/timeline-scale.spec.ts` — zoom/date calculations.
- `packages/frontend/src/components/Gantt/dependency-path.ts` — SVG anchor/path calculation.
- `packages/frontend/src/components/Gantt/dependency-path.spec.ts` — all dependency anchors.
- `packages/frontend/src/components/Gantt/TimelineToolbar.tsx` — zoom, date, filter controls.
- `packages/frontend/src/components/Gantt/TimelineToolbar.spec.tsx` — toolbar accessibility.
- `packages/frontend/src/components/Gantt/UnscheduledTasksPanel.tsx` — tasks without both dates.
- `packages/frontend/src/components/Gantt/TimelineView.tsx` — query/error/empty orchestration.
- `packages/frontend/src/components/Gantt/GanttChart.spec.tsx` — rendering and interactions.

### Modify

- `packages/shared/src/types/domain.ts` — type-safe dependency type.
- `packages/shared/src/types/api.ts` — timeline response, capability, schedule, dependency contracts.
- `packages/shared/src/validation/index.ts` — timeline and command schemas.
- `packages/shared/src/index.ts` — export contracts if needed.
- `packages/backend/src/app.module.ts` — import `TimelineModule`.
- `packages/backend/src/task/task.controller.ts` — remove or delegate legacy dependency endpoints.
- `packages/backend/src/task/task.service.ts` — remove duplicate dependency command ownership after callers migrate.
- `packages/backend/test/unit/task.service.spec.ts` — remove replaced dependency tests while retaining task coverage.
- `packages/frontend/src/components/Gantt/GanttChart.tsx` — replace orphaned prototype with working renderer.
- `packages/frontend/src/pages/ProjectPage.tsx` — add Timeline tab and avoid using capped task data for it.
- `packages/frontend/src/pages/ProjectPage.spec.tsx` — create if absent; Timeline tab.
- `packages/frontend/src/pages/DashboardPage.tsx` — add Overview/Timeline view.
- `packages/frontend/src/pages/DashboardPage.spec.tsx` — dashboard timeline scope.
- `packages/frontend/src/styles/index.css` — only focused pointer/scroll styles not expressible with existing utilities.
- `packages/frontend/src/api/tasks.ts` — invalidate timeline queries after task changes.
- `RAILWAY_DEPLOYMENT.md` — exact migration, health, and rollback checks.
- `VERCEL_DEPLOYMENT.md` — production build and acceptance checks.

## Task 1: Add timeline contracts and dependency integrity migration

**Files:**
- Create: `packages/backend/src/migrations/022_timeline_integrity.ts`
- Create: `supabase/migrations/20260730101000_timeline_integrity.sql`
- Create: `packages/backend/test/unit/timeline-integrity-migration.spec.ts`
- Modify: `packages/shared/src/types/domain.ts`
- Modify: `packages/shared/src/types/api.ts`
- Modify: `packages/shared/src/validation/index.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces:

```ts
export interface TimelineQuery {
  from: string;
  to: string;
  departmentId?: string;
  projectId?: string;
  assigneeId?: string;
  status?: TaskStatus[];
  cursor?: string;
  perPage?: number;
  includeCriticalPath?: boolean;
}

export interface TimelineTask extends Task {
  capabilities: { canEditSchedule: boolean; canManageDependencies: boolean };
  isCritical: boolean;
}

export interface TimelineResponse {
  tasks: TimelineTask[];
  unscheduled: TimelineTask[];
  dependencies: TaskDependency[];
  meta: { from: string; to: string; nextCursor: string | null };
}

export type TimelineScope =
  | { kind: 'dashboard'; departmentId?: string }
  | { kind: 'project'; projectId: string };

export interface UpdateTaskScheduleRequest {
  startDate: string | null;
  dueDate: string | null;
  expectedUpdatedAt: string;
}

export interface UpdateDependencyRequest {
  dependencyType: DependencyType;
  lagDays: number;
}
```

- Produces: `timelineQuerySchema`, `updateTaskScheduleSchema`,
  `updateDependencySchema`.

- [ ] **Step 1: Write failing migration and validation tests**

Assert the SQL:

```ts
expect(sql).toContain('UPDATE task_dependencies td');
expect(sql).toContain('SET tenant_id = t.tenant_id');
expect(sql).toContain('dependency_type IN');
expect(sql).toContain('lag_days >= 0');
expect(sql).toContain('idx_task_dependencies_tenant_task');
expect(sql).toContain('idx_tasks_tenant_timeline_dates');
```

Assert query validation rejects reversed ranges and a page size above 500:

```ts
expect(() => timelineQuerySchema.parse({
  from: '2026-08-02T00:00:00.000Z',
  to: '2026-08-01T00:00:00.000Z',
})).toThrow();
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand timeline-integrity-migration
npm test -w @wrike-clone/shared
```

Expected: FAIL because the migration and timeline contracts do not exist.

- [ ] **Step 3: Add exact shared contracts and schemas**

Type `TaskDependency.dependencyType` as `DependencyType`. Restrict lag to
`0..3650`. Restrict the visible range to at most 730 days per request and
`perPage` to `1..500`. Use an opaque cursor string; clients never construct or
decode it.

Schedule validation requires either both dates or both null:

```ts
.refine(
  (value) =>
    (value.startDate === null && value.dueDate === null) ||
    (value.startDate !== null && value.dueDate !== null),
  { message: 'startDate and dueDate must be scheduled together' },
)
.refine(
  (value) =>
    value.startDate === null ||
    new Date(value.startDate).getTime() <= new Date(value.dueDate!).getTime(),
  { message: 'startDate must not be after dueDate' },
);
```

- [ ] **Step 4: Implement equivalent migrations**

Backfill `task_dependencies.tenant_id` from the dependent task, remove only
orphaned rows whose tasks no longer exist, normalize null lag to zero, and
reject invalid dependency types before adding checks.

Add:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_task_dependencies_edge
ON task_dependencies (tenant_id, task_id, depends_on_task_id);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_tenant_task
ON task_dependencies (tenant_id, task_id);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_tenant_predecessor
ON task_dependencies (tenant_id, depends_on_task_id);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_timeline_dates
ON tasks (tenant_id, start_date, due_date, id)
WHERE deleted_at IS NULL;
```

Do not add a database task-date check until malformed existing rows have been
reported and normalized explicitly by the migration.

- [ ] **Step 5: Run focused tests and builds**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand timeline-integrity-migration migration-runtime-resolvability
npm test -w @wrike-clone/shared
npm run build -w @wrike-clone/shared
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- packages/shared/src packages/backend/src/migrations/022_timeline_integrity.ts packages/backend/test/unit/timeline-integrity-migration.spec.ts supabase/migrations/20260730101000_timeline_integrity.sql
git commit -m "feat: add timeline contracts and integrity"
```

## Task 2: Implement pure dependency graph algorithms

**Files:**
- Create: `packages/backend/src/timeline/dependency-graph.ts`
- Create: `packages/backend/src/timeline/dependency-graph.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface DependencyEdge {
  taskId: string;
  dependsOnTaskId: string;
  dependencyType: DependencyType;
  lagDays: number;
}

export function wouldCreateCycle(
  edges: DependencyEdge[],
  candidate: DependencyEdge,
): boolean;

export function criticalPathTaskIds(
  tasks: Array<{ id: string; startDate: string | null; dueDate: string | null }>,
  edges: DependencyEdge[],
): Set<string>;
```

- [ ] **Step 1: Write failing graph tests**

Cover:

```ts
expect(wouldCreateCycle([{ taskId: 'b', dependsOnTaskId: 'a', ...fs }], {
  taskId: 'a',
  dependsOnTaskId: 'b',
  ...fs,
})).toBe(true);

expect(wouldCreateCycle(edges, unrelatedEdge)).toBe(false);
expect(criticalPathTaskIds(tasks, edges)).toEqual(new Set(['a', 'b', 'd']));
```

Include disconnected tasks, all four dependency types, lag, same-day
milestones, and unscheduled tasks. Critical path may approximate non-FS
constraints by their selected start/end anchors, but the rule must be explicit
and deterministic.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand dependency-graph
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement cycle detection**

Build adjacency from predecessor to dependent. Add the candidate edge and run
depth-first search with `visiting` and `visited` sets. Reject self-links before
DFS.

- [ ] **Step 4: Implement critical path**

Topologically sort scheduled tasks, compute duration in inclusive days, apply
lag to the selected dependency anchor, retain the highest predecessor score,
then backtrack from the maximum terminal score. Break equal-score ties by task
ID so output is stable.

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand dependency-graph
npm run typecheck -w @wrike-clone/backend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- packages/backend/src/timeline/dependency-graph.ts packages/backend/src/timeline/dependency-graph.spec.ts
git commit -m "feat: add timeline dependency graph"
```

## Task 3: Build scoped timeline reads

**Files:**
- Create: `packages/backend/src/timeline/timeline.module.ts`
- Create: `packages/backend/src/timeline/timeline.controller.ts`
- Create: `packages/backend/src/timeline/timeline.service.ts`
- Create: `packages/backend/test/unit/timeline.service.spec.ts`
- Create: `packages/backend/test/unit/timeline.controller.spec.ts`
- Modify: `packages/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `TimelineQuery`, `TimelineResponse`,
  `criticalPathTaskIds()`, `applyTaskAccessScope()`.
- Produces:
  - `GET /api/v1/timeline`
  - `GET /api/v1/projects/:projectId/timeline`

- [ ] **Step 1: Write failing service tests**

Cover:

- date overlap: `start_date <= to AND due_date >= from`;
- unscheduled means either date is null;
- tenant and soft-delete predicates always apply;
- employee visibility uses `applyTaskAccessScope`;
- department request calls `assertCanViewDepartment`;
- project request rejects an inaccessible project;
- cursor ordering is `(start_date, due_date, id)`;
- 501 tasks return 500 plus an opaque next cursor;
- dependencies include edges connecting returned scheduled tasks;
- per-task capabilities are false for unauthorized employees;
- critical path is omitted unless requested.

- [ ] **Step 2: Write failing controller tests**

Assert both routes parse `timelineQuerySchema`, require `task:read`, and pass
the path project ID separately from untrusted query data.

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand timeline.service timeline.controller
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement the timeline query**

Select task, project, department, assignee summary, handoff state, and
`updated_at`. Query scheduled and unscheduled rows separately. Apply filters
before pagination. Encode the last tuple as base64url JSON and validate decoded
cursor shape before use.

Return only dependencies whose two endpoints are in the response task set.
For a window boundary, include a dependency stub only when needed to draw an
edge and mark it read-only.

- [ ] **Step 5: Compute capabilities and critical path**

Resolve role once per department where possible. `canEditSchedule` follows the
same service rule as task management/status changes. Managers and department
heads may manage dependencies; employees may not create dependencies unless
existing RBAC explicitly grants task management.

- [ ] **Step 6: Register the module**

Import `RbacModule` into `TimelineModule`; register controller, timeline
service, and the later dependency service provider token. Import
`TimelineModule` into `AppModule`.

- [ ] **Step 7: Run focused tests and checks**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand timeline.service timeline.controller dependency-graph
npm run typecheck -w @wrike-clone/backend
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- packages/backend/src/timeline packages/backend/test/unit/timeline.service.spec.ts packages/backend/test/unit/timeline.controller.spec.ts packages/backend/src/app.module.ts
git commit -m "feat: add scoped timeline queries"
```

## Task 4: Add schedule and dependency commands

**Files:**
- Create: `packages/backend/src/timeline/dependency.service.ts`
- Create: `packages/backend/test/unit/dependency.service.spec.ts`
- Modify: `packages/backend/src/timeline/timeline.service.ts`
- Modify: `packages/backend/src/timeline/timeline.controller.ts`
- Modify: `packages/backend/src/timeline/timeline.module.ts`
- Modify: `packages/backend/test/unit/timeline.service.spec.ts`
- Modify: `packages/backend/test/unit/timeline.controller.spec.ts`
- Modify: `packages/backend/src/task/task.controller.ts`
- Modify: `packages/backend/src/task/task.service.ts`
- Modify: `packages/backend/test/unit/task.service.spec.ts`

**Interfaces:**
- Produces:

```ts
TimelineService.updateSchedule(
  taskId: string,
  input: UpdateTaskScheduleRequest,
): Promise<TimelineTask>;

DependencyService.create(input: CreateDependencyRequest): Promise<TaskDependency>;
DependencyService.update(id: string, input: UpdateDependencyRequest): Promise<TaskDependency>;
DependencyService.remove(id: string): Promise<void>;
```

- Produces:
  - `PATCH /api/v1/tasks/:taskId/schedule`
  - `POST /api/v1/tasks/dependencies`
  - `PATCH /api/v1/tasks/dependencies/:dependencyId`
  - `DELETE /api/v1/tasks/dependencies/:dependencyId`

- [ ] **Step 1: Write failing schedule tests**

Assert:

```ts
await expect(service.updateSchedule(taskId, {
  startDate,
  dueDate,
  expectedUpdatedAt: staleTimestamp,
})).rejects.toMatchObject({ response: { code: 'STALE_TASK' } });
```

Also cover successful date update, unscheduling with both null, reversed dates,
partial dates, unauthorized employee, tenant mismatch, and activity logging.

- [ ] **Step 2: Write failing dependency tests**

Cover all four types and lag, then self-link, duplicate edge, missing endpoint,
cross-tenant endpoint, unauthorized manager scope, cycle, update-created cycle,
delete, and tenant ID insertion:

```ts
expect(insert).toHaveBeenCalledWith(expect.objectContaining({
  tenant_id: tenantId,
  dependency_type: DependencyType.FINISH_TO_START,
  lag_days: 2,
}));
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand timeline.service dependency.service timeline.controller
```

Expected: FAIL on missing commands and validation.

- [ ] **Step 4: Implement optimistic-concurrency schedule writes**

Within a transaction, select the task tenant-scoped, authorize, and update with:

```ts
.where({
  id: taskId,
  tenant_id: ctx.tenantId,
  updated_at: new Date(input.expectedUpdatedAt),
})
```

If zero rows update, return:

```ts
throw new ConflictException({
  code: 'STALE_TASK',
  message: 'This task schedule changed elsewhere.',
  current: await currentSchedule(taskId),
});
```

- [ ] **Step 5: Implement dependency commands**

Load both endpoints with tenant and permission checks. Load current tenant
edges, call `wouldCreateCycle`, and write inside one transaction. Use stable
errors `DEPENDENCY_CYCLE`, `DEPENDENCY_EXISTS`, and `FORBIDDEN`.

- [ ] **Step 6: Move legacy dependency ownership**

Make `TimelineController` own the existing `/tasks/dependencies` paths. Remove
duplicate methods from `TaskController` and `TaskService` only after all tests
and callers target `DependencyService`. Preserve the public create/delete URLs
and add PATCH, so existing clients do not break.

- [ ] **Step 7: Run focused tests and checks**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand timeline.service dependency.service timeline.controller task.service
npm run typecheck -w @wrike-clone/backend
npm run lint -w @wrike-clone/backend
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- packages/backend/src/timeline packages/backend/src/task/task.controller.ts packages/backend/src/task/task.service.ts packages/backend/test/unit/dependency.service.spec.ts packages/backend/test/unit/timeline.service.spec.ts packages/backend/test/unit/timeline.controller.spec.ts packages/backend/test/unit/task.service.spec.ts
git commit -m "feat: persist timeline schedules and dependencies"
```

## Task 5: Add frontend timeline API and geometry utilities

**Files:**
- Create: `packages/frontend/src/api/timeline.ts`
- Create: `packages/frontend/src/api/timeline.spec.ts`
- Create: `packages/frontend/src/components/Gantt/timeline-scale.ts`
- Create: `packages/frontend/src/components/Gantt/timeline-scale.spec.ts`
- Create: `packages/frontend/src/components/Gantt/dependency-path.ts`
- Create: `packages/frontend/src/components/Gantt/dependency-path.spec.ts`
- Modify: `packages/frontend/src/api/tasks.ts`

**Interfaces:**
- Produces:

```ts
timelineKeys.scope(scope: TimelineScope, query: TimelineQuery): readonly unknown[];
useTimeline(scope: TimelineScope, query: TimelineQuery): UseQueryResult<TimelineResponse>;
useUpdateTaskSchedule(): UseMutationResult<TimelineTask, Error, ScheduleVariables, RollbackContext>;
useCreateDependency(): UseMutationResult<TaskDependency, Error, CreateDependencyRequest>;
useUpdateDependency(): UseMutationResult<TaskDependency, Error, { id: string } & UpdateDependencyRequest>;
useDeleteDependency(): UseMutationResult<void, Error, string>;
```

- Produces:

```ts
createTimelineScale({ from, to, zoom }): {
  columnWidth: number;
  totalWidth: number;
  dateToX(date: string): number;
  xToDate(x: number): string;
  snapDelta(px: number): number;
};
```

- [ ] **Step 1: Write failing API tests**

Assert normalized query parameters, project versus dashboard URLs, query keys,
schedule PATCH body, dependency methods, and rollback:

```ts
expect(apiClient.patch).toHaveBeenCalledWith('/tasks/task-1/schedule', {
  startDate,
  dueDate,
  expectedUpdatedAt,
});
expect(queryClient.setQueryData).toHaveBeenLastCalledWith(key, previous);
```

- [ ] **Step 2: Write failing geometry tests**

For each zoom, verify date-to-pixel and pixel-to-date round trips, inclusive
same-day bar width, Today positioning, negative/offscreen positions, and
snapping.

For dependency paths, verify start/end anchors:

```ts
expect(dependencyAnchors(fs, predecessor, dependent)).toEqual({
  fromX: predecessor.right,
  toX: dependent.left,
});
expect(dependencyAnchors(ss, predecessor, dependent).fromX).toBe(predecessor.left);
expect(dependencyAnchors(ff, predecessor, dependent).toX).toBe(dependent.right);
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/api/timeline.spec.ts src/components/Gantt/timeline-scale.spec.ts src/components/Gantt/dependency-path.spec.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement API hooks with rollback**

In `onMutate`, cancel matching timeline queries, snapshot each matching cache,
and replace only the changed task. In `onError`, restore every snapshot. In
`onSettled`, invalidate timeline, task detail, dashboard, calendar, and project
queries.

- [ ] **Step 5: Implement pure geometry**

Use UTC day boundaries to avoid daylight-saving drift. Zoom widths:

- day: 40 px/day;
- week: 14 px/day with week labels;
- month: 4 px/day with month labels and minimum 28 px header cells.

Keep calculations independent from React and DOM measurements.

- [ ] **Step 6: Implement dependency paths**

Return a polyline path with a minimum 12 px elbow so backward and same-row
links remain visible. `lagDays` changes label content, not anchor semantics.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/api/timeline.spec.ts src/components/Gantt/timeline-scale.spec.ts src/components/Gantt/dependency-path.spec.ts
npm run typecheck -w @wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- packages/frontend/src/api/timeline.ts packages/frontend/src/api/timeline.spec.ts packages/frontend/src/api/tasks.ts packages/frontend/src/components/Gantt/timeline-scale.ts packages/frontend/src/components/Gantt/timeline-scale.spec.ts packages/frontend/src/components/Gantt/dependency-path.ts packages/frontend/src/components/Gantt/dependency-path.spec.ts
git commit -m "feat: add timeline client and geometry"
```

## Task 6: Rebuild the Gantt renderer

**Files:**
- Modify: `packages/frontend/src/components/Gantt/GanttChart.tsx`
- Create: `packages/frontend/src/components/Gantt/GanttChart.spec.tsx`
- Create: `packages/frontend/src/components/Gantt/TimelineToolbar.tsx`
- Create: `packages/frontend/src/components/Gantt/TimelineToolbar.spec.tsx`
- Create: `packages/frontend/src/components/Gantt/UnscheduledTasksPanel.tsx`
- Modify: `packages/frontend/src/styles/index.css`

**Interfaces:**
- Consumes: `TimelineResponse`, `createTimelineScale()`,
  `dependencyPath()`.
- Produces:

```ts
export interface GanttChartProps {
  data: TimelineResponse;
  zoom: 'day' | 'week' | 'month';
  selectedTaskId?: string;
  onScheduleChange(task: TimelineTask, next: { startDate: string; dueDate: string }): void;
  onOpenTask(taskId: string): void;
  onCreateDependency?(input: CreateDependencyRequest): void;
  onDeleteDependency?(dependencyId: string): void;
}
```

- [ ] **Step 1: Write failing renderer tests**

Assert:

- one row and one bar per scheduled task;
- same-day task has one-day minimum width;
- unscheduled tasks are not rendered at timeline origin;
- Today line appears only inside range;
- all dependency types use correct anchors;
- lag label renders;
- critical tasks have a distinct accessible label;
- unauthorized task has no drag/resize affordance;
- row can be opened with Enter.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/components/Gantt/GanttChart.spec.tsx src/components/Gantt/TimelineToolbar.spec.tsx
```

Expected: FAIL against the dormant prototype.

- [ ] **Step 3: Implement toolbar and unscheduled panel**

Toolbar controls are native buttons/selects with labels for zoom, previous,
next, Today, project, department, assignee, status, and critical path.
`UnscheduledTasksPanel` lists real tasks and opens task detail; authorized
users may schedule through two date inputs.

- [ ] **Step 4: Rebuild chart rendering**

Use CSS grid for labels/header and a horizontally scrolling timeline. Use
`useVirtualizer` for task rows. Render bars only when both dates exist. Use an
SVG overlay for dependency paths and unique marker IDs per chart instance.

Display task title, status, dates, overdue state, and handoff-ready badge.
Represent a milestone with a diamond when start and due dates are the same.

- [ ] **Step 5: Add accessible fallback**

Provide a `View as table` toggle. The table includes task, project, start, due,
status, owner/assignees, and editable date inputs when permitted.

- [ ] **Step 6: Run renderer tests and build**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/components/Gantt/GanttChart.spec.tsx src/components/Gantt/TimelineToolbar.spec.tsx
npm run typecheck -w @wrike-clone/frontend
npm run build -w @wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- packages/frontend/src/components/Gantt packages/frontend/src/styles/index.css
git commit -m "feat: rebuild accessible gantt renderer"
```

## Task 7: Add drag, resize, touch, and dependency interactions

**Files:**
- Modify: `packages/frontend/src/components/Gantt/GanttChart.tsx`
- Modify: `packages/frontend/src/components/Gantt/GanttChart.spec.tsx`

**Interfaces:**
- Consumes: callbacks defined in Task 6.
- Produces: pointer-capture interactions that emit snapped ISO date changes.

- [ ] **Step 1: Write failing interaction tests**

Using Pointer Events, cover:

```ts
fireEvent.pointerDown(bar, { pointerId: 1, clientX: 100 });
fireEvent.pointerMove(bar, { pointerId: 1, clientX: 140 });
fireEvent.pointerUp(bar, { pointerId: 1, clientX: 140 });
expect(onScheduleChange).toHaveBeenCalledWith(task, {
  startDate: nextStart,
  dueDate: nextDue,
});
```

Also test left resize, right resize, month/week snapping, pointer leaving the
chart while captured, Escape cancellation, touch pointer type, forbidden
controls, dependency create, and dependency delete.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/components/Gantt/GanttChart.spec.tsx
```

Expected: FAIL because interactions are not implemented.

- [ ] **Step 3: Implement one pointer interaction state machine**

Use:

```ts
type Interaction =
  | { kind: 'move'; taskId: string; pointerId: number; originX: number }
  | { kind: 'resize-start'; taskId: string; pointerId: number; originX: number }
  | { kind: 'resize-end'; taskId: string; pointerId: number; originX: number }
  | null;
```

Call `setPointerCapture`, update a temporary local preview, and emit one
mutation on pointer up. Clamp start not later than due. Escape restores the
original bar without a request.

- [ ] **Step 4: Implement dependency editing**

For authorized rows, an `Add dependency` control opens a compact form choosing
predecessor, type, and lag. Existing arrows are focusable through an adjacent
dependency list with Remove actions; the SVG itself remains presentation.

- [ ] **Step 5: Run interaction tests**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/components/Gantt/GanttChart.spec.tsx
npm run typecheck -w @wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- packages/frontend/src/components/Gantt/GanttChart.tsx packages/frontend/src/components/Gantt/GanttChart.spec.tsx
git commit -m "feat: add gantt scheduling interactions"
```

## Task 8: Build TimelineView and mount both product surfaces

**Files:**
- Create: `packages/frontend/src/components/Gantt/TimelineView.tsx`
- Modify: `packages/frontend/src/pages/ProjectPage.tsx`
- Create or modify: `packages/frontend/src/pages/ProjectPage.spec.tsx`
- Modify: `packages/frontend/src/pages/DashboardPage.tsx`
- Modify: `packages/frontend/src/pages/DashboardPage.spec.tsx`

**Interfaces:**
- Consumes: all timeline hooks and Gantt components.
- Produces:

```tsx
<TimelineView scope={{ kind: 'project', projectId }} />
<TimelineView scope={{ kind: 'dashboard', departmentId }} />
```

- [ ] **Step 1: Write failing page tests**

Project tests assert the third tab is `Timeline`, selecting it uses the
dedicated project endpoint, and Tasks/Board still use their existing query.

Dashboard tests assert `Overview` and `Timeline` views, selected department
propagation, all-department access only for admin, and preserved view/range
query parameters.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/pages/ProjectPage.spec.tsx src/pages/DashboardPage.spec.tsx
```

Expected: FAIL because the views are not mounted.

- [ ] **Step 3: Implement TimelineView orchestration**

Own zoom, visible range, filters, cursor accumulation, critical-path toggle,
and selected task. Render loading skeleton, retryable error, empty scheduled
state plus unscheduled panel, chart/table, and `Load more` when `nextCursor`
exists.

Call schedule/dependency mutations and show stable messages:

- `Schedule updated`
- `This task changed elsewhere. Timeline refreshed.`
- `That dependency would create a circular schedule.`
- `You do not have permission to edit this task.`

- [ ] **Step 4: Mount Project Timeline**

Change:

```ts
type Tab = 'tasks' | 'board' | 'timeline';
```

Render `TimelineView` only when selected so its bundle and data are lazy. The
timeline never receives `tasksData?.data`, removing the 100-task cap.

- [ ] **Step 5: Mount Dashboard Timeline**

Add a segmented Overview/Timeline control near the department filter. Store
`view=timeline`, `from`, `to`, and `zoom` in search parameters so refresh and
back navigation preserve context. Pass the current authorized department
scope.

- [ ] **Step 6: Run page and regression tests**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/pages/ProjectPage.spec.tsx src/pages/DashboardPage.spec.tsx src/components/Gantt
npm run typecheck -w @wrike-clone/frontend
npm run build -w @wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- packages/frontend/src/components/Gantt/TimelineView.tsx packages/frontend/src/pages/ProjectPage.tsx packages/frontend/src/pages/ProjectPage.spec.tsx packages/frontend/src/pages/DashboardPage.tsx packages/frontend/src/pages/DashboardPage.spec.tsx
git commit -m "feat: add project and dashboard timelines"
```

## Task 9: Full verification and code review

**Files:**
- Modify only concrete files required by failing checks or accepted review findings.

**Interfaces:**
- Produces: release candidate with complete automated evidence.

- [ ] **Step 1: Run all checks**

Run:

```powershell
npm run build
npm run typecheck
npm run lint
npm test
npm run typecheck:seed
git diff --check
```

Expected: PASS.

- [ ] **Step 2: Run focused backend safety suites**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand handoff timeline dependency dashboard task migration
```

Expected: PASS with no open handles or skipped critical tests.

- [ ] **Step 3: Run focused frontend interaction suites**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/components/Gantt src/components/Task src/components/Kanban src/components/Dashboard src/pages/ProjectPage.spec.tsx src/pages/DashboardPage.spec.tsx src/pages/MyTasksPage.spec.tsx
```

Expected: PASS.

- [ ] **Step 4: Request two-stage review**

Use `superpowers:requesting-code-review` for spec compliance and code quality.
Resolve every critical and important finding. Rerun the smallest affected test
suite, then rerun root build and typecheck.

- [ ] **Step 5: Create a release commit if review changed files**

Stage the exact paths reported by `git status --short` that were changed solely
to resolve accepted review findings. Inspect `git diff --cached --name-only`
before committing:

```powershell
git commit -m "fix: harden handoff and timeline release"
```

Skip when no review fix was necessary.

## Task 10: Migrate Supabase and deploy Railway backend

**Files:**
- Modify: `RAILWAY_DEPLOYMENT.md`
- Modify only deployment configuration proven necessary by build or health evidence.

**Interfaces:**
- Consumes: migrations 021 and 022 and a clean reviewed release commit.
- Produces: healthy production schema and Railway API.

- [ ] **Step 1: Capture a production preflight**

Record:

- current Supabase migration versions;
- current schema presence for handoff columns and dependency constraints;
- Supabase security/performance advisors;
- Railway deployment ID, health, readiness, and recent error logs;
- current Git release commit.

Do not print secrets.

- [ ] **Step 2: Apply Supabase migrations in order**

Use the connected Supabase tools to apply:

1. `20260730100000_handoff_confirmation.sql`
2. `20260730101000_timeline_integrity.sql`

Verify exact columns, checks, foreign keys, partial indexes, dependency indexes,
and historical backfill counts. Rerun security and performance advisors.

- [ ] **Step 3: Synchronize Railway Knex migration history**

Deploy the backend release so Railway runs 021 and 022 through the existing
Knex migration command. Confirm `knex_migrations` records both files exactly
once and does not rerun Supabase-equivalent SQL destructively.

If production executes both migration systems against the same schema, rely on
the idempotent `IF NOT EXISTS`/`hasColumn` guards and verify the final schema
rather than editing migration history by hand.

- [ ] **Step 4: Verify Railway**

Check:

```text
GET /api/v1/health       -> 200
GET /api/v1/health/ready -> 200
```

Verify CORS from the Vercel origin, authentication, task completion, dashboard
bucket, project timeline, dashboard timeline, stale schedule rejection, and
cycle rejection. Inspect logs for migration, SQL, 5xx, and authorization
errors.

- [ ] **Step 5: Update Railway runbook and commit**

Document the actual deployment identifier, migration verification queries,
health endpoints, rollback behavior, and log locations. Stage only
`RAILWAY_DEPLOYMENT.md` plus any proven deployment-config fix:

```powershell
git commit -m "docs: record railway timeline rollout"
```

Skip when the runbook already contains the exact verified process and no file
changed.

## Task 11: Deploy Vercel frontend and run production acceptance

**Files:**
- Modify: `VERCEL_DEPLOYMENT.md`
- Modify only frontend/deployment files required by production evidence.

**Interfaces:**
- Consumes: verified Railway API URL and clean release commit.
- Produces: production Vercel deployment and acceptance evidence.

- [ ] **Step 1: Verify Vercel configuration**

Confirm:

- project root is `packages/frontend`;
- `VITE_API_URL` targets the verified Railway `/api/v1`;
- production build uses the clean release commit;
- no backend catch-all rewrite captures static assets.

- [ ] **Step 2: Deploy the frontend**

Use the connected Vercel API or CLI to create a production deployment from the
reviewed commit. Wait for terminal `READY` status. Inspect build logs for
warnings that indicate missing environment values or oversized chunks caused
by accidental eager Gantt loading.

- [ ] **Step 3: Run logged-in production acceptance**

Using the available in-app browser automation:

1. Create and self-assign a handoff-required task.
2. Confirm My Tasks and dashboard lists show it.
3. Choose Not yet and verify Ready for handoff.
4. Confirm handoff and verify actor/time/completion.
5. Reopen and verify a new confirmation is required.
6. Complete a handoff-disabled internal task.
7. Open Dashboard Timeline and Project Timeline.
8. Verify day/week/month, Today, filters, unscheduled lane, table fallback, and
   more-than-100-task pagination behavior.
9. Drag and resize an authorized task; refresh and verify persistence.
10. Create each dependency type with lag, remove one, and reject a cycle.
11. Verify an employee cannot edit an unauthorized task.
12. Check mobile-width layout, keyboard controls, browser console, failed
    network requests, and CORS.

- [ ] **Step 4: Monitor both deployments**

After acceptance, inspect Vercel status/logs and Railway health/logs again.
Confirm no increase in 5xx responses, failed completion commands, migration
errors, or timeline query timeouts.

- [ ] **Step 5: Record release evidence**

Update `VERCEL_DEPLOYMENT.md` with the production deployment URL/ID, release
commit, API target, test date, and acceptance result. Commit only the runbook
when changed:

```powershell
git commit -m "docs: record verified gantt production release"
```

## Task 12: Final completion audit

**Files:**
- No code changes expected.

**Interfaces:**
- Produces: evidence-backed completion statement or a precise unresolved blocker.

- [ ] **Step 1: Run verification-before-completion**

Invoke `superpowers:verification-before-completion`. Recheck the current test,
build, deployment, health, advisor, browser, and Git evidence; do not rely on
earlier claims.

- [ ] **Step 2: Confirm specification coverage**

Map every Success Criteria item in
`docs/superpowers/specs/2026-07-30-handoff-confirmation-and-gantt-design.md` to
a passing automated test or production acceptance observation.

- [ ] **Step 3: Confirm ChatGPT submission status**

Record that the repository remains a REST application, not an MCP server. Do
not generate `chatgpt-app-submission.json`. Treat a future ChatGPT App as a
separate approved project.

- [ ] **Step 4: Report the release**

Provide the production URLs, release commit, migrations applied, major test
commands, production acceptance result, and any non-blocking follow-up. If a
required check failed, report the exact evidence and continue remediation
instead of claiming completion.
