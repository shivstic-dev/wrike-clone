# Handoff Confirmation and Actionable Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a lightweight final-handoff confirmation before task completion, keep not-yet-delivered work visible, and make dashboard totals reveal their underlying tasks.

**Architecture:** Store current handoff metadata on `tasks` and immutable transitions in `activity_logs`. Route every completion path through a dedicated `TaskCompletionService`; ordinary updates may reopen tasks but may not bypass confirmation. Expose dashboard bucket rows through the same scoped query used for dashboard metrics, then use shared React Query mutations and an accessible confirmation dialog across task detail, forms, and Kanban.

**Tech Stack:** PostgreSQL 17 / Supabase migrations, Knex 3, NestJS 11, Zod, shared TypeScript contracts, React 19, TanStack Query 5, Vitest, Jest.

## Global Constraints

- Final handoff is required by default.
- Copy must use `intended recipient`, `task owner`, `Ready for handoff`, and `Handoff confirmed`; do not use `customer`.
- OpenWork must not upload, store, email, or transmit deliverables for this feature.
- The task owner is the creator initially and the actor who most recently assigns or reassigns the task.
- `Not yet` must leave the task incomplete.
- Confirmation is made by the task completer; no separate recipient approval is added.
- Employees may change status only where existing RBAC allows it; managers and department heads retain their current department scope.
- All tenant, department, task, and actor checks remain server-side.
- Existing completed tasks are historical and backfill to `not_required`.
- Existing dirty worktree changes belong to the user and must not be reset or overwritten.

---

## File Structure

### Create

- `packages/backend/src/migrations/021_handoff_confirmation.ts` — Knex migration used by Railway.
- `supabase/migrations/20260730100000_handoff_confirmation.sql` — production Supabase migration with equivalent schema.
- `packages/backend/test/unit/handoff-confirmation-migration.spec.ts` — migration contract checks.
- `packages/backend/src/task/task-completion.service.ts` — authoritative completion/reopen state machine.
- `packages/backend/test/unit/task-completion.service.spec.ts` — state-machine, RBAC, idempotency, and transaction tests.
- `packages/frontend/src/components/Task/HandoffCompletionDialog.tsx` — accessible Yes/Not yet dialog.
- `packages/frontend/src/components/Task/HandoffCompletionDialog.spec.tsx` — dialog behavior and copy.
- `packages/frontend/src/components/Task/useTaskCompletionFlow.ts` — shared interaction state for completion entry points.
- `packages/frontend/src/components/Dashboard/DashboardTaskDrawer.tsx` — list behind a dashboard total.
- `packages/frontend/src/components/Dashboard/DashboardTaskDrawer.spec.tsx` — drawer accessibility and task rendering.

### Modify

- `packages/shared/src/enums/index.ts` — add `HandoffStatus`.
- `packages/shared/src/types/domain.ts` — add handoff fields to `Task`.
- `packages/shared/src/types/api.ts` — add completion, handoff filter, and dashboard bucket contracts.
- `packages/shared/src/validation/index.ts` — validate handoff, completion, bulk completion, and bucket inputs.
- `packages/shared/src/index.ts` — export added contracts if not covered by existing wildcard exports.
- `packages/backend/src/task/task.module.ts` — register `TaskCompletionService` and import `NotificationModule`.
- `packages/backend/src/task/task.controller.ts` — add completion routes and correct mutation permissions.
- `packages/backend/src/task/task.service.ts` — enforce completion guard, owner updates, reopen reset, filters, and bulk behavior.
- `packages/backend/test/unit/task.service.spec.ts` — completion bypass, owner, filter, and self-assignment tests.
- `packages/backend/src/notification/notification.service.ts` — accept an optional transaction executor.
- `packages/backend/test/unit/notification.service.spec.ts` — transactional create behavior.
- `packages/backend/src/dashboard/dashboard-metrics.ts` — define reusable bucket predicates and ready count.
- `packages/backend/src/dashboard/dashboard-metrics.spec.ts` — metric and bucket consistency.
- `packages/backend/src/dashboard/dashboard.service.ts` — return scoped bucket tasks.
- `packages/backend/src/dashboard/dashboard.controller.ts` — add `GET /dashboard/tasks`.
- `packages/backend/src/dashboard/dashboard.service.spec.ts` — scoped task-bucket endpoint.
- `packages/frontend/src/api/tasks.ts` — completion mutations and handoff query serialization.
- `packages/frontend/src/api/tasks.spec.ts` — completion endpoints and invalidation.
- `packages/frontend/src/api/dashboard.ts` — dashboard bucket query.
- `packages/frontend/src/api/dashboard.spec.ts` — bucket parameter and request tests.
- `packages/frontend/src/components/Task/TaskForm.tsx` — handoff-required control and completion interception contract.
- `packages/frontend/src/components/Task/TaskForm.spec.tsx` — default and disabled handoff behavior.
- `packages/frontend/src/pages/TaskDetailPage.tsx` — dialog, handoff status, owner, and reopen behavior.
- `packages/frontend/src/pages/TaskDetailPage.spec.tsx` — both outcomes and audit presentation.
- `packages/frontend/src/components/Kanban/KanbanBoard.tsx` — completion flow on drag.
- `packages/frontend/src/components/Kanban/KanbanBoard.spec.tsx` — create if absent; completed-column interception.
- `packages/frontend/src/pages/MyTasksPage.tsx` — persistent Ready for handoff section.
- `packages/frontend/src/pages/MyTasksPage.spec.tsx` — create if absent; self-assignment and ready grouping.
- `packages/frontend/src/components/Dashboard/DepartmentPulse.tsx` — clickable metric controls including ready count.
- `packages/frontend/src/components/Dashboard/EmployeeDashboard.tsx` — pass bucket-selection callbacks.
- `packages/frontend/src/components/Dashboard/ManagerDashboard.tsx` — pass bucket-selection callbacks.
- `packages/frontend/src/components/Dashboard/DepartmentHeadDashboard.tsx` — pass bucket-selection callbacks.
- `packages/frontend/src/components/Dashboard/AdminDashboard.tsx` — pass bucket-selection callbacks.
- `packages/frontend/src/components/Dashboard/RoleDashboard.tsx` — shared callback contract.
- `packages/frontend/src/components/Dashboard/RoleDashboard.spec.tsx` — metric click behavior.
- `packages/frontend/src/pages/DashboardPage.tsx` — drawer state and ready lane.
- `packages/frontend/src/pages/DashboardPage.spec.tsx` — count-to-list and self-assigned visibility.

## Task 1: Add handoff schema and shared contracts

**Files:**
- Create: `packages/backend/src/migrations/021_handoff_confirmation.ts`
- Create: `supabase/migrations/20260730100000_handoff_confirmation.sql`
- Create: `packages/backend/test/unit/handoff-confirmation-migration.spec.ts`
- Modify: `packages/shared/src/enums/index.ts`
- Modify: `packages/shared/src/types/domain.ts`
- Modify: `packages/shared/src/types/api.ts`
- Modify: `packages/shared/src/validation/index.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `HandoffStatus = 'pending' | 'ready' | 'confirmed' | 'not_required'`.
- Produces: `TaskCompletionRequest { outcome: 'confirmed' | 'not_yet' }`.
- Produces: `BulkTaskCompletionRequest { items: Array<{ taskId: string; outcome: TaskCompletionOutcome }> }`.
- Produces:

```ts
export interface BulkTaskCompletionResult {
  data: Task[];
  errors: Array<{
    taskId: string;
    code: 'FORBIDDEN' | 'NOT_FOUND' | 'HANDOFF_CONFIRMATION_REQUIRED';
    message: string;
  }>;
}

export interface DashboardTaskSummary {
  id: string;
  title: string;
  projectId: string;
  projectName: string | null;
  departmentId: string;
  status: TaskStatus;
  handoffStatus: HandoffStatus;
  handoffOwner: Pick<User, 'id' | 'displayName' | 'email'> | null;
  assignees: TaskAssignee[];
  dueDate: string | null;
  handoffReadyAt: string | null;
}
```

- Produces: `DashboardTaskBucket = 'active' | 'completed' | 'overdue' | 'blocked' | 'unassigned' | 'ready_for_handoff'`.
- Produces: `taskCompletionSchema`, `bulkTaskCompletionSchema`, and handoff-aware task filters.

- [ ] **Step 1: Write failing migration and contract tests**

Add migration assertions:

```ts
expect(sql).toContain("handoff_status IN ('pending', 'ready', 'confirmed', 'not_required')");
expect(sql).toContain('handoff_required BOOLEAN NOT NULL DEFAULT true');
expect(sql).toContain('handoff_owner_id UUID');
expect(sql).toContain('handoff_confirmed_by UUID');
expect(sql).toContain('idx_tasks_tenant_handoff_ready');
expect(sql).toMatch(/status = 'completed'[\s\S]*handoff_status = 'not_required'/);
```

Add shared validation assertions beside existing validation tests:

```ts
expect(taskCompletionSchema.parse({ outcome: 'confirmed' })).toEqual({ outcome: 'confirmed' });
expect(taskCompletionSchema.parse({ outcome: 'not_yet' })).toEqual({ outcome: 'not_yet' });
expect(() => taskCompletionSchema.parse({ outcome: 'sent' })).toThrow();
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand handoff-confirmation-migration
npm test -w @wrike-clone/shared
```

Expected: FAIL because the migration and handoff contracts do not exist.

- [ ] **Step 3: Implement the shared contracts**

Add:

```ts
export enum HandoffStatus {
  PENDING = 'pending',
  READY = 'ready',
  CONFIRMED = 'confirmed',
  NOT_REQUIRED = 'not_required',
}

export type TaskCompletionOutcome = 'confirmed' | 'not_yet';

export interface TaskCompletionRequest {
  outcome: TaskCompletionOutcome;
}

export interface BulkTaskCompletionRequest {
  items: Array<{ taskId: string; outcome: TaskCompletionOutcome }>;
}
```

Extend `Task` with:

```ts
handoffRequired: boolean;
handoffStatus: HandoffStatus;
handoffOwnerId: string | null;
handoffOwner?: Pick<User, 'id' | 'displayName' | 'email'> | null;
handoffReadyAt: Timestamp | null;
handoffConfirmedBy: string | null;
handoffConfirmedAt: Timestamp | null;
```

Add `handoffRequired` to create/update requests, `handoffStatus` to task filters,
and exact Zod schemas for completion, bulk completion, and dashboard buckets.

- [ ] **Step 4: Implement equivalent Knex and Supabase migrations**

The `up` migration and SQL migration must:

```sql
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS handoff_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handoff_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS handoff_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handoff_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handoff_confirmed_at TIMESTAMPTZ;

UPDATE tasks
SET handoff_required = false,
    handoff_status = 'not_required',
    handoff_owner_id = created_by_id
WHERE status = 'completed';

UPDATE tasks
SET handoff_owner_id = created_by_id
WHERE handoff_owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_handoff_ready
ON tasks (tenant_id, handoff_owner_id, handoff_ready_at DESC)
WHERE deleted_at IS NULL AND handoff_status = 'ready';
```

Add named checks that constrain the state values and require confirmation time
and actor only for `confirmed`. The Knex `down` drops only objects created by
021. The Supabase migration is forward-only.

- [ ] **Step 5: Run focused tests and builds**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand handoff-confirmation-migration migration-runtime-resolvability
npm test -w @wrike-clone/shared
npm run build -w @wrike-clone/shared
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- packages/shared/src packages/backend/src/migrations/021_handoff_confirmation.ts packages/backend/test/unit/handoff-confirmation-migration.spec.ts supabase/migrations/20260730100000_handoff_confirmation.sql
git commit -m "feat: add handoff confirmation schema"
```

## Task 2: Build the atomic completion state machine

**Files:**
- Create: `packages/backend/src/task/task-completion.service.ts`
- Create: `packages/backend/test/unit/task-completion.service.spec.ts`
- Modify: `packages/backend/src/task/task.module.ts`
- Modify: `packages/backend/src/notification/notification.service.ts`
- Modify: `packages/backend/test/unit/notification.service.spec.ts`

**Interfaces:**
- Consumes: `TaskCompletionRequest`, `HandoffStatus`.
- Produces:

```ts
class TaskCompletionService {
  complete(taskId: string, input: TaskCompletionRequest): Promise<Record<string, unknown>>;
  completeMany(input: BulkTaskCompletionRequest): Promise<BulkTaskCompletionResult>;
  reopenInTransaction(
    trx: Knex.Transaction,
    task: Record<string, unknown>,
    nextStatus: TaskStatus,
  ): Promise<Record<string, unknown>>;
}
```

- Produces: `NotificationService.create(input, executor?: Knex | Knex.Transaction)`.

- [ ] **Step 1: Write failing completion service tests**

Cover:

```ts
it('confirms handoff and completes in one transaction', async () => {
  const result = await service.complete(taskId, { outcome: 'confirmed' });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({
    status: 'completed',
    handoff_status: 'confirmed',
    handoff_confirmed_by: actorId,
  }));
  expect(result.status).toBe('completed');
});

it('marks ready without completing', async () => {
  const result = await service.complete(taskId, { outcome: 'not_yet' });
  expect(result).toMatchObject({ status: 'in_progress', handoff_status: 'ready' });
});

it('completes a not-required task without confirmation metadata', async () => {});
it('does not duplicate activity or notifications on retry', async () => {});
it('checks status permission before writing', async () => {});
it('rejects a deleted or cross-tenant task as not found', async () => {});
it('resets current confirmation when reopening', async () => {});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand task-completion.service notification.service
```

Expected: FAIL because `TaskCompletionService` and transactional notification
creation do not exist.

- [ ] **Step 3: Make notification creation transaction-aware**

Change the signature without changing existing callers:

```ts
async create(
  input: CreateNotificationInput,
  executor: Knex | Knex.Transaction = this.db,
) {
  const ctx = requireTenantContext();
  const [notification] = await executor('notifications').insert({
    id: uuidv4(),
    tenant_id: ctx.tenantId,
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body || null,
    data: input.data ? JSON.stringify(input.data) : '{}',
    priority: input.priority || 0,
  }).returning('*');
  return notification;
}
```

- [ ] **Step 4: Implement the state machine**

Use a tenant-scoped `SELECT ... FOR UPDATE`, then call
`assertCanChangeStatus(department_id, id, assignee_id)`. Keep all task,
activity, and notification writes inside one Knex transaction.

Use stable exception bodies:

```ts
throw new ConflictException({
  code: 'HANDOFF_CONFIRMATION_REQUIRED',
  message: 'Confirm final handoff before completing this task.',
});
```

For `not_yet`, preserve the current non-completed status; if malformed legacy
data is already completed, restore `in_progress`. Insert at most one unread
`handoff_ready` notification per task/user by checking existing notification
JSON data before insertion. Recipients are every current assignee plus the
handoff owner when that owner is a different user. These remain in-app
notifications; do not call the email service or scheduler.

- [ ] **Step 5: Register the service**

Import `NotificationModule` in `TaskModule`, add `TaskCompletionService` to
providers, and export it for controller tests.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand task-completion.service notification.service
npm run typecheck -w @wrike-clone/backend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- packages/backend/src/task/task-completion.service.ts packages/backend/src/task/task.module.ts packages/backend/src/notification/notification.service.ts packages/backend/test/unit/task-completion.service.spec.ts packages/backend/test/unit/notification.service.spec.ts
git commit -m "feat: enforce atomic task handoff completion"
```

## Task 3: Integrate completion, reopening, owner tracking, and filters

**Files:**
- Modify: `packages/backend/src/task/task.controller.ts`
- Modify: `packages/backend/src/task/task.service.ts`
- Modify: `packages/backend/test/unit/task.service.spec.ts`
- Create or modify: `packages/backend/test/unit/task.controller.spec.ts`

**Interfaces:**
- Consumes: `TaskCompletionService.complete()` and `.completeMany()`.
- Produces:
  - `POST /api/v1/tasks/:taskId/completion`
  - `POST /api/v1/tasks/bulk-completion`
  - `GET /api/v1/tasks?handoffStatus=ready`

- [ ] **Step 1: Write failing controller and service tests**

Add exact cases:

```ts
await expect(service.update(taskId, { status: TaskStatus.COMPLETED }))
  .rejects.toMatchObject({
    response: { code: 'HANDOFF_CONFIRMATION_REQUIRED' },
  });

expect(taskService.create({
  projectId,
  title: 'Internal check',
  handoffRequired: false,
})).resolves.toMatchObject({
  handoff_required: false,
  handoff_status: 'not_required',
});
```

Also assert:

- default creation uses `pending` and creator as owner;
- assignment/reassignment stores current actor as owner;
- self-assignment during creation leaves creator as owner;
- reopening clears confirmation fields and returns `pending`;
- bulk generic completion is rejected;
- `handoffStatus=ready` adds the tenant-scoped query predicate;
- completion routes use a write permission decorator and parsed schemas.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand task.service task.controller
```

Expected: FAIL on missing routes and guards.

- [ ] **Step 3: Add completion routes**

Add routes before `@Get(':id')` so `bulk-completion` cannot be captured as an
ID:

```ts
@Post('bulk-completion')
@Permissions('task:status:update')
completeMany(@Body() body: unknown) {
  return this.taskCompletion.completeMany(bulkTaskCompletionSchema.parse(body));
}

@Post(':taskId/completion')
@Permissions('task:status:update')
complete(@Param('taskId') taskId: string, @Body() body: unknown) {
  return this.taskCompletion.complete(taskId, taskCompletionSchema.parse(body));
}
```

Change task create/delete/assignee/dependency mutations from `task:read` to
`task:create`, `task:delete`, `task:assign`, or `task:write` respectively.
Use `task:status:update` on completion and the generic update/bulk routes so
employees retain their existing assigned-task status path; service-level RBAC
continues to reject non-status edits by employees.

- [ ] **Step 4: Integrate task creation and assignment ownership**

At task creation write:

```ts
handoff_required: input.handoffRequired ?? true,
handoff_status: input.handoffRequired === false ? 'not_required' : 'pending',
handoff_owner_id: ctx.userId,
```

Reject `status: completed` when handoff is required. If handoff is disabled,
set `completed_at` consistently.

Whenever `assigneeId` or `assigneeIds` actually changes, update
`handoff_owner_id` to `ctx.userId`. Do this in the same transaction as
`task_assignees`. Do not change owner on a no-op assignment or simple removal.

- [ ] **Step 5: Guard ordinary completion and reset reopening**

Before generic updates:

```ts
if (input.status === TaskStatus.COMPLETED && existing.status !== TaskStatus.COMPLETED) {
  throw handoffRequiredConflict();
}
```

When moving a completed task to a non-completed status, clear current handoff
confirmation and set `pending` or `not_required` according to
`handoff_required`. Apply the same rules to bulk updates.

- [ ] **Step 6: Add handoff reads and filtering**

Select the handoff owner using a left join alias and include:

```sql
json_build_object(
  'id', handoff_owner.id,
  'display_name', handoff_owner.display_name,
  'email', handoff_owner.email
) AS handoff_owner
```

Skip the JSON object when owner ID is null. Add a tenant-scoped
`tasks.handoff_status` predicate when the filter is supplied.

- [ ] **Step 7: Run task tests and backend checks**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand task.service task.controller task-completion.service
npm run typecheck -w @wrike-clone/backend
npm run lint -w @wrike-clone/backend
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- packages/backend/src/task/task.controller.ts packages/backend/src/task/task.service.ts packages/backend/test/unit/task.service.spec.ts packages/backend/test/unit/task.controller.spec.ts
git commit -m "feat: route task completion through handoff"
```

## Task 4: Add actionable dashboard task buckets

**Files:**
- Modify: `packages/backend/src/dashboard/dashboard-metrics.ts`
- Modify: `packages/backend/src/dashboard/dashboard-metrics.spec.ts`
- Modify: `packages/backend/src/dashboard/dashboard.service.ts`
- Modify: `packages/backend/src/dashboard/dashboard.controller.ts`
- Modify: `packages/backend/src/dashboard/dashboard.service.spec.ts`
- Modify: `packages/shared/src/types/api.ts`
- Modify: `packages/shared/src/validation/index.ts`

**Interfaces:**
- Consumes: `DashboardTaskBucket`.
- Produces:

```ts
export function taskMatchesDashboardBucket(
  row: DashboardTaskRow,
  bucket: DashboardTaskBucket,
  now: Date,
): boolean;

DashboardService.tasks(input: {
  departmentId?: string;
  days: 30;
  bucket: DashboardTaskBucket;
}): Promise<{ generatedAt: string; bucket: DashboardTaskBucket; data: DashboardTaskSummary[] }>;
```

- Produces: `GET /api/v1/dashboard/tasks?bucket=ready_for_handoff&departmentId=...&days=30`.

- [ ] **Step 1: Write failing metric consistency tests**

For a fixed row set, assert every total equals the matching bucket row count:

```ts
expect(metrics.totals.readyForHandoff).toBe(
  rows.filter((row) => taskMatchesDashboardBucket(row, 'ready_for_handoff', now)).length,
);
expect(metrics.totals.overdue).toBe(
  rows.filter((row) => taskMatchesDashboardBucket(row, 'overdue', now)).length,
);
```

Add service/controller tests proving employee, manager, department-head, and
admin scopes reuse `buildDashboardRowsQuery` and cannot request another
tenant's rows.

- [ ] **Step 2: Run dashboard tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand dashboard-metrics dashboard.service
```

Expected: FAIL on missing bucket functions and endpoint.

- [ ] **Step 3: Extract reusable bucket predicates**

Add `handoffStatus`, project, owner, and assignee summary fields to
`DashboardTaskRow`. Build `totals` and task-list filtering from the same pure
predicate function. `ready_for_handoff` means:

```ts
row.status !== 'completed' && row.handoffStatus === 'ready'
```

Keep the existing 30-day completion comparison semantics; do not accidentally
limit active, overdue, blocked, unassigned, or ready rows to tasks created in
the comparison window.

- [ ] **Step 4: Implement the scoped bucket endpoint**

Parse `dashboardTasksQuerySchema`, resolve the same role scope used by
`overview()`, call `buildDashboardRowsQuery`, filter with the pure predicate,
sort deterministically by ready/due/update time, and return only safe task
summary fields.

- [ ] **Step 5: Run focused and type tests**

Run:

```powershell
npm test -w @wrike-clone/backend -- --runInBand dashboard-metrics dashboard.service
npm test -w @wrike-clone/shared
npm run typecheck -w @wrike-clone/backend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- packages/backend/src/dashboard packages/shared/src/types/api.ts packages/shared/src/validation/index.ts
git commit -m "feat: expose dashboard task buckets"
```

## Task 5: Add frontend completion API and reusable dialog flow

**Files:**
- Modify: `packages/frontend/src/api/tasks.ts`
- Modify: `packages/frontend/src/api/tasks.spec.ts`
- Create: `packages/frontend/src/components/Task/HandoffCompletionDialog.tsx`
- Create: `packages/frontend/src/components/Task/HandoffCompletionDialog.spec.tsx`
- Create: `packages/frontend/src/components/Task/useTaskCompletionFlow.ts`

**Interfaces:**
- Produces:

```ts
useCompleteTask(): UseMutationResult<Task, Error, { taskId: string; outcome: TaskCompletionOutcome }>;
useBulkCompleteTasks(): UseMutationResult<...>;

useTaskCompletionFlow(): {
  requestCompletion(task: Task): Promise<Task | null>;
  dialogProps: HandoffCompletionDialogProps;
}
```

- [ ] **Step 1: Write failing API and dialog tests**

Assert:

```ts
await mutate({ taskId: 'task-1', outcome: 'not_yet' });
expect(apiClient.post).toHaveBeenCalledWith('/tasks/task-1/completion', {
  outcome: 'not_yet',
});
expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tasks'] });
expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
```

Dialog tests must find the exact question, owner name, `Yes, handoff completed`,
and `Not yet` by accessible role and name.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/api/tasks.spec.ts src/components/Task/HandoffCompletionDialog.spec.tsx
```

Expected: FAIL because hooks and dialog do not exist.

- [ ] **Step 3: Add completion mutations and invalidation**

Add `['dashboard']` and `['timeline']` to task-dependent invalidation. On
success, set task detail data and invalidate lists, grouped tasks,
notifications, reports, dashboard, and timelines.

- [ ] **Step 4: Implement the accessible dialog**

Use a labelled `role="dialog"` with focus moved to the heading, Escape mapped
to cancel, body scroll preserved, and disabled actions while pending. Render
no upload, URL, email, proof, or attachment control.

- [ ] **Step 5: Implement the reusable flow hook**

`requestCompletion(task)`:

- calls the API immediately with `confirmed` only when
  `task.handoffRequired === false`;
- otherwise opens the dialog and resolves after Yes/Not yet;
- returns the authoritative task response;
- leaves the caller responsible only for success/error toast wording.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/api/tasks.spec.ts src/components/Task/HandoffCompletionDialog.spec.tsx
npm run typecheck -w @wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- packages/frontend/src/api/tasks.ts packages/frontend/src/api/tasks.spec.ts packages/frontend/src/components/Task/HandoffCompletionDialog.tsx packages/frontend/src/components/Task/HandoffCompletionDialog.spec.tsx packages/frontend/src/components/Task/useTaskCompletionFlow.ts
git commit -m "feat: add task handoff completion flow"
```

## Task 6: Wire every frontend completion path

**Files:**
- Modify: `packages/frontend/src/components/Task/TaskForm.tsx`
- Modify: `packages/frontend/src/components/Task/TaskForm.spec.tsx`
- Modify: `packages/frontend/src/pages/TaskDetailPage.tsx`
- Modify: `packages/frontend/src/pages/TaskDetailPage.spec.tsx`
- Modify: `packages/frontend/src/components/Kanban/KanbanBoard.tsx`
- Create or modify: `packages/frontend/src/components/Kanban/KanbanBoard.spec.tsx`

**Interfaces:**
- Consumes: `useTaskCompletionFlow()`.
- Produces: no direct generic `PATCH status=completed` from these components.

- [ ] **Step 1: Write failing integration tests**

Cover:

```ts
it('opens handoff confirmation when status changes to completed', async () => {});
it('submits not_yet and leaves the task outside Completed', async () => {});
it('submits confirmed and shows Handoff confirmed', async () => {});
it('completes a handoff-disabled task without opening the dialog', async () => {});
it('intercepts a Kanban drop into Completed', async () => {});
it('uses generic update when moving from Completed to In progress', async () => {});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/pages/TaskDetailPage.spec.tsx src/components/Task/TaskForm.spec.tsx src/components/Kanban/KanbanBoard.spec.tsx
```

Expected: FAIL because the current components patch completed directly.

- [ ] **Step 3: Add the task-form handoff switch**

Default new tasks to checked:

```tsx
<input
  id="handoffRequired"
  type="checkbox"
  checked={handoffRequired}
  onChange={(event) => setHandoffRequired(event.target.checked)}
/>
<label htmlFor="handoffRequired">Final handoff required</label>
```

Submit `handoffRequired`; show helper text explaining that OpenWork only asks
for confirmation and does not store or send the work.

- [ ] **Step 4: Intercept task-detail completion**

If the selected status is completed, call `requestCompletion(task)`. For any
other status use `useUpdateTask`. Show current handoff state, task owner,
confirmer, and time. After `not_yet`, toast `Saved in Ready for handoff`.
After confirmed, toast `Handoff confirmed and task completed`.

- [ ] **Step 5: Intercept Kanban completion**

On a drop into Completed call the same flow. Keep the task in its original
column while the dialog is open. `Not yet` relies on invalidated data and must
not optimistically place the card in Completed.

- [ ] **Step 6: Run focused tests and checks**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/pages/TaskDetailPage.spec.tsx src/components/Task/TaskForm.spec.tsx src/components/Kanban/KanbanBoard.spec.tsx
npm run typecheck -w @wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- packages/frontend/src/components/Task/TaskForm.tsx packages/frontend/src/components/Task/TaskForm.spec.tsx packages/frontend/src/pages/TaskDetailPage.tsx packages/frontend/src/pages/TaskDetailPage.spec.tsx packages/frontend/src/components/Kanban/KanbanBoard.tsx packages/frontend/src/components/Kanban/KanbanBoard.spec.tsx
git commit -m "feat: require handoff across task completion UI"
```

## Task 7: Add Ready for handoff to My Tasks

**Files:**
- Modify: `packages/frontend/src/pages/MyTasksPage.tsx`
- Create or modify: `packages/frontend/src/pages/MyTasksPage.spec.tsx`
- Modify: `packages/frontend/src/components/Table/TaskTable.tsx`

**Interfaces:**
- Consumes: `Task.handoffStatus`, `Task.handoffOwner`.
- Produces: a persistent ready section before the normal task table.

- [ ] **Step 1: Write failing My Tasks tests**

Test that a self-assigned task returned by `/tasks/my` renders, and that a
`handoffStatus: 'ready'` task appears under `Ready for handoff` with owner and
waiting time while remaining absent from a Completed grouping.

- [ ] **Step 2: Run the test and verify failure**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/pages/MyTasksPage.spec.tsx
```

Expected: FAIL because no ready section exists.

- [ ] **Step 3: Implement the ready section**

Partition without dropping rows:

```ts
const readyTasks = tasks.filter((task) => task.handoffStatus === 'ready');
const otherTasks = tasks.filter((task) => task.handoffStatus !== 'ready');
```

Render Ready for handoff first with a persistent count and links. Render the
remaining tasks below. Add a compact handoff badge to `TaskTable` rows.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/pages/MyTasksPage.spec.tsx
npm run typecheck -w @wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- packages/frontend/src/pages/MyTasksPage.tsx packages/frontend/src/pages/MyTasksPage.spec.tsx packages/frontend/src/components/Table/TaskTable.tsx
git commit -m "feat: surface tasks ready for handoff"
```

## Task 8: Make dashboard totals actionable

**Files:**
- Modify: `packages/frontend/src/api/dashboard.ts`
- Modify: `packages/frontend/src/api/dashboard.spec.ts`
- Create: `packages/frontend/src/components/Dashboard/DashboardTaskDrawer.tsx`
- Create: `packages/frontend/src/components/Dashboard/DashboardTaskDrawer.spec.tsx`
- Modify: `packages/frontend/src/components/Dashboard/DepartmentPulse.tsx`
- Modify: `packages/frontend/src/components/Dashboard/EmployeeDashboard.tsx`
- Modify: `packages/frontend/src/components/Dashboard/ManagerDashboard.tsx`
- Modify: `packages/frontend/src/components/Dashboard/DepartmentHeadDashboard.tsx`
- Modify: `packages/frontend/src/components/Dashboard/AdminDashboard.tsx`
- Modify: `packages/frontend/src/components/Dashboard/RoleDashboard.tsx`
- Modify: `packages/frontend/src/components/Dashboard/RoleDashboard.spec.tsx`
- Modify: `packages/frontend/src/pages/DashboardPage.tsx`
- Modify: `packages/frontend/src/pages/DashboardPage.spec.tsx`

**Interfaces:**
- Produces:

```ts
useDashboardTasks(filters: {
  bucket: DashboardTaskBucket;
  departmentId?: string;
  days: 30;
}, enabled?: boolean)
```

- Produces: `RoleDashboardProps.onSelectBucket(bucket)`.

- [ ] **Step 1: Write failing API, card, drawer, and page tests**

Assert:

- `ready_for_handoff` serializes exactly;
- selecting a metric requests `/dashboard/tasks` with current department;
- drawer heading matches the selected metric;
- returned task title, project, assignee, owner, and due date render;
- Escape and Close dismiss the drawer;
- count and list use the same bucket;
- self-assigned rows returned by the API are visible.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/api/dashboard.spec.ts src/components/Dashboard/DashboardTaskDrawer.spec.tsx src/components/Dashboard/RoleDashboard.spec.tsx src/pages/DashboardPage.spec.tsx
```

Expected: FAIL on missing endpoint hook and selection contract.

- [ ] **Step 3: Add the dashboard bucket hook**

Create a query key including normalized department, days, and bucket. Enable
only when a bucket is selected and the overview scope is valid.

- [ ] **Step 4: Convert metric displays to accessible buttons**

Each metric control must have an accessible name such as
`Show 4 overdue tasks`. Add `Ready for handoff` using
`overview.totals.readyForHandoff`. Preserve the existing visual tokens and
role-specific composition.

- [ ] **Step 5: Implement the drawer and page state**

Use `DashboardPage` as the single owner of `selectedBucket`. Pass
`onSelectBucket` through `RoleDashboard`. Render loading, error/retry, empty,
and task-list states in `DashboardTaskDrawer`. Closing the drawer clears the
selection and does not reset department filters.

- [ ] **Step 6: Run frontend tests and build**

Run:

```powershell
npm test -w @wrike-clone/frontend -- src/api/dashboard.spec.ts src/components/Dashboard/DashboardTaskDrawer.spec.tsx src/components/Dashboard/RoleDashboard.spec.tsx src/pages/DashboardPage.spec.tsx
npm run typecheck -w @wrike-clone/frontend
npm run build -w @wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- packages/frontend/src/api/dashboard.ts packages/frontend/src/api/dashboard.spec.ts packages/frontend/src/components/Dashboard packages/frontend/src/pages/DashboardPage.tsx packages/frontend/src/pages/DashboardPage.spec.tsx
git commit -m "feat: reveal tasks behind dashboard totals"
```

## Task 9: Verify the complete handoff subsystem

**Files:**
- Modify only files needed to fix failures found by this task.

**Interfaces:**
- Produces: a testable handoff/dashboard subsystem ready for timeline work.

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm run build
npm run typecheck
npm run lint
npm test -- --runInBand
git diff --check
```

Expected: all commands PASS. If root Jest options do not forward cleanly to
Vitest, run `npm test` without `--runInBand`, then run backend Jest separately
with `--runInBand`.

- [ ] **Step 2: Run migration safety checks**

Run the backend migration test suite and verify `021_handoff_confirmation.ts`
is discovered by the runtime migration resolver. Compare the Supabase SQL and
Knex migration column names, defaults, checks, indexes, and backfill rules.

- [ ] **Step 3: Perform local browser acceptance**

Verify:

1. Self-assigned task appears in My Tasks.
2. `Not yet` creates Ready for handoff without completion.
3. The owner sees Awaiting handoff.
4. `Yes, handoff completed` records actor/time and completes.
5. Reopen requires a fresh confirmation.
6. Handoff-disabled task completes directly.
7. Every dashboard metric opens matching tasks.
8. No handoff screen offers upload, email, or file storage.

- [ ] **Step 4: Review against the approved spec**

Use `superpowers:requesting-code-review`. Resolve every critical or important
finding, rerun the affected tests, and record any intentionally deferred
non-goal.

- [ ] **Step 5: Commit verification fixes**

Inspect `git status --short`, stage each path changed solely by accepted review
or verification fixes, then inspect `git diff --cached --name-only` before:

```powershell
git commit -m "fix: harden handoff and dashboard workflows"
```

Skip the commit when verification required no changes.
