# Recoverable Task Trash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve deleted task relationships, expose permission-scoped Trash and restore operations, and allow only tenant administrators to purge tasks after 30 days.

**Architecture:** Task deletion remains a soft delete but records the deleting user and no longer removes assignees. A focused `TaskTrashService` owns deleted-task reads, restores, and irreversible purge rules, while the normal `TaskService` continues to hide deleted rows.

**Tech Stack:** NestJS 11, Knex 3, PostgreSQL/Supabase RLS, React 19, React Router 7, TanStack Query 5, Jest, Vitest

## Global Constraints

- This plan runs after `2026-08-03-production-release-blockers.md`.
- Use migration number 024 because the email plan owns 023.
- Never delete `task_assignees` during soft deletion.
- Tenant admins can inspect/restore all tenant Trash; regular users can inspect/restore only tasks they deleted and can currently access.
- Permanent purge is tenant-admin-only and requires `deleted_at <= now - 30 days`.
- Keep API responses camelCase through the existing response interceptor.
- Do not auto-purge in this release.

---

### Task 1: Record who deleted each task

**Files:**
- Create: `packages/backend/src/migrations/024_task_deleted_by.ts`
- Create: `packages/backend/test/unit/task-deleted-by-migration.spec.ts`
- Modify: `packages/shared/src/types/domain.ts`

**Interfaces:**
- Produces: nullable `tasks.deleted_by UUID REFERENCES users(id) ON DELETE SET NULL`
- Produces: partial index `idx_tasks_tenant_deleted_at` for deleted task listing
- Produces: `Task.deletedBy: string | null`

- [ ] **Step 1: Write the failing migration test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('024 task deleted-by migration', () => {
  const source = readFileSync(join(process.cwd(), 'src/migrations/024_task_deleted_by.ts'), 'utf8');

  it('adds reversible deletion metadata without touching task assignees', () => {
    expect(source).toContain("table.uuid('deleted_by')");
    expect(source).toContain("onDelete('SET NULL')");
    expect(source).toContain('idx_tasks_tenant_deleted_at');
    expect(source).toContain('WHERE deleted_at IS NOT NULL');
    expect(source).not.toContain("dropTable('task_assignees')");
    expect(source).not.toContain("delete from task_assignees");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/task-deleted-by-migration.spec.ts`

Expected: FAIL because migration 024 does not exist.

- [ ] **Step 3: Implement the migration**

```ts
await knex.schema.alterTable('tasks', (table) => {
  table.uuid('deleted_by').references('id').inTable('users').onDelete('SET NULL');
});
await knex.raw(`
  CREATE INDEX idx_tasks_tenant_deleted_at
  ON tasks (tenant_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL
`);
```

`down()` drops the index and then the column. Do not change any existing row or relationship.

- [ ] **Step 4: Extend the shared task type**

Add `deletedBy: string | null` beside inherited deletion metadata in `Task`. Do not add snake-case transport fields.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/task-deleted-by-migration.spec.ts test/unit/migration-history-alignment.spec.ts`

Expected: PASS.

```bash
git add packages/backend/src/migrations/024_task_deleted_by.ts packages/backend/test/unit/task-deleted-by-migration.spec.ts packages/shared/src/types/domain.ts
git commit -m "feat: record task deletion ownership"
```

### Task 2: Preserve relationships during soft deletion

**Files:**
- Modify: `packages/backend/src/task/task.service.ts`
- Modify: `packages/backend/src/task/task.controller.ts`
- Modify: `packages/backend/test/unit/task.service.spec.ts`
- Modify: `packages/backend/test/unit/task.controller.spec.ts`

**Interfaces:**
- Produces: `TaskService.remove(id)` sets `deleted_at` and `deleted_by` only
- Produces: `DELETE /tasks/:id` requires `task:delete`, while service-level department authorization remains mandatory

- [ ] **Step 1: Write the failing preservation test**

```ts
it('soft-deletes a task without deleting assignees', async () => {
  await tenantContext.run({
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'member',
  } as never, () => service.remove('task-1'));

  expect(mockDb).not.toHaveBeenCalledWith('task_assignees');
  expect(taskQuery.update).toHaveBeenCalledWith({
    deleted_at: expect.any(Date),
    deleted_by: 'user-1',
  });
  expect(activityQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
    action: 'task:deleted',
    actor_id: 'user-1',
  }));
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/task.service.spec.ts`

Expected: FAIL because `remove()` deletes `task_assignees` and does not set `deleted_by`.

- [ ] **Step 3: Implement the minimal soft delete**

Inside one transaction, update only the matching active task:

```ts
const deletedAt = new Date();
const updated = await trx('tasks')
  .where({ id, tenant_id: ctx.tenantId })
  .whereNull('deleted_at')
  .update({ deleted_at: deletedAt, deleted_by: ctx.userId });
if (updated !== 1) throw new NotFoundException('Task not found');
await trx('activity_logs').insert({
  id: uuidv4(),
  tenant_id: ctx.tenantId,
  actor_id: ctx.userId,
  entity_type: 'task',
  entity_id: id,
  action: 'task:deleted',
  changes: JSON.stringify({ deletedAt: { new: deletedAt.toISOString() } }),
  metadata: '{}',
});
```

Do not call the best-effort `logActivity()` outside the transaction for this operation.

Change the controller decorator on `remove()` from `@Permissions('task:read')` to `@Permissions('task:delete')` and add this metadata assertion to `task.controller.spec.ts`:

```ts
expect(Reflect.getMetadata(
  PERMISSIONS_KEY,
  (TaskController as any).prototype.remove,
)).toEqual(['task:delete']);
```

- [ ] **Step 4: Run the focused test**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/task.service.spec.ts test/unit/task.controller.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/task/task.service.ts packages/backend/src/task/task.controller.ts packages/backend/test/unit/task.service.spec.ts packages/backend/test/unit/task.controller.spec.ts
git commit -m "fix: preserve task relationships on delete"
```

### Task 3: Add permission-scoped Trash APIs

**Files:**
- Create: `packages/backend/src/task/task-trash.service.ts`
- Create: `packages/backend/src/task/task-trash.controller.ts`
- Create: `packages/backend/test/unit/task-trash.service.spec.ts`
- Create: `packages/backend/test/unit/task-trash.controller.spec.ts`
- Modify: `packages/backend/src/task/task.module.ts`
- Modify: `packages/shared/src/types/api.ts`
- Modify: `packages/shared/src/validation/index.ts`

**Interfaces:**
- Produces: `trashFilterSchema` with `page`, `perPage`, `deletedBy`, `deletedBefore`, and `deletedAfter`
- Produces: `GET /task-trash`, `GET /task-trash/:id`, `POST /task-trash/:id/restore`, `DELETE /task-trash/:id/purge`
- Produces: `TrashFilterParams`, `TaskTrashItem`, `TaskTrashDetail`, and `TaskRestoreResult`

- [ ] **Step 1: Define shared API contracts**

```ts
export interface TaskTrashItem {
  id: string;
  title: string;
  projectId: string | null;
  departmentId: string;
  deletedAt: string;
  deletedBy: string | null;
  deletedByName: string | null;
  projectName: string | null;
  purgeEligibleAt: string;
}

export interface TaskRestoreResult {
  task: Task;
  locationAdjusted: boolean;
}

export interface TrashFilterParams {
  page?: number;
  perPage?: number;
  deletedBy?: string;
  deletedBefore?: string;
  deletedAfter?: string;
}

export interface TaskTrashDetail extends TaskTrashItem {
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: TaskAssignee[];
  folderName: string | null;
  departmentName: string | null;
}
```

- [ ] **Step 2: Write failing service authorization tests**

Cover these exact cases:

- admin lists every deleted task in the tenant;
- regular user query includes `deleted_by = ctx.userId` and `applyTaskAccessScope`;
- regular user cannot restore another user's task;
- restore clears `deleted_at` and `deleted_by` while preserving assignees;
- non-admin purge returns `ForbiddenException`;
- admin purge before 30 days returns `BadRequestException`;
- admin purge at exactly 30 days succeeds;
- every lookup includes `tenant_id`.

- [ ] **Step 3: Run service tests and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/task-trash.service.spec.ts`

Expected: FAIL because the Trash service does not exist.

- [ ] **Step 4: Implement Trash reads and restore**

Start list queries with:

```ts
let query = this.db('tasks')
  .leftJoin('users as deleter', 'deleter.id', 'tasks.deleted_by')
  .leftJoin('projects', 'projects.id', 'tasks.project_id')
  .where('tasks.tenant_id', ctx.tenantId)
  .whereNotNull('tasks.deleted_at');

if (!await this.departmentAccess.isTenantAdmin()) {
  query = applyTaskAccessScope(query, { ...ctx, role: 'member' })
    .andWhere('tasks.deleted_by', ctx.userId);
}
```

Restore in one transaction. Revalidate the optional project and home folder. If either no longer exists in the tenant, null the invalid project or remove the invalid home link and return `locationAdjusted: true`. Clear deletion fields, write `task:restored`, and leave assignee/comment rows untouched.

- [ ] **Step 5: Implement admin-only purge**

Resolve the row by tenant and task ID, require tenant admin, and compare `deleted_at` with `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)`. In one transaction: delete task-scoped `email_deliveries`; delete `approval_requests`, `time_entries`, `task_comments`, `task_dependencies` from both task columns, `task_folder_links`, `task_assignees`, and `notification_log`; set `files.task_id` to null; delete the task; then insert a minimal `task:purged` activity row containing only task ID and deletion timestamps. Existing foreign-key cascades are a safety net, not a substitute for this explicit order.

- [ ] **Step 6: Add the controller**

Use `@Controller('task-trash')`, `AuthGuard`, `RolesGuard`, and `@Permissions('task:read')` for reads/restores. The service performs the stricter ownership/admin checks. Purge also uses `@Permissions('tenant:manage')` and still rechecks tenant-admin status server-side.

- [ ] **Step 7: Run backend tests and commit**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/task-trash.service.spec.ts test/unit/task-trash.controller.spec.ts test/unit/task.service.spec.ts`

Expected: PASS.

```bash
git add packages/backend/src/task/task-trash.service.ts packages/backend/src/task/task-trash.controller.ts packages/backend/src/task/task.module.ts packages/backend/test/unit/task-trash.service.spec.ts packages/backend/test/unit/task-trash.controller.spec.ts packages/shared/src/types/api.ts packages/shared/src/validation/index.ts
git commit -m "feat: add permission-scoped task Trash API"
```

### Task 4: Add frontend Trash data hooks

**Files:**
- Create: `packages/frontend/src/api/task-trash.ts`
- Create: `packages/frontend/src/api/task-trash.spec.ts`
- Modify: `packages/frontend/src/api/tasks.ts`

**Interfaces:**
- Produces: `taskTrashKeys`, `useTaskTrash`, `useTaskTrashDetail`, `useRestoreTask`, `usePurgeTask`

- [ ] **Step 1: Write failing hook tests**

```ts
it('restores a task and invalidates Trash plus task dependents', async () => {
  const mutate = mountMutation(queryClient, useRestoreTask);
  await mutate({ taskId: 'task-1' });
  expect(apiClient.post).toHaveBeenCalledWith('/task-trash/task-1/restore');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['task-trash'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
});
```

Also assert purge calls `DELETE /task-trash/:id/purge` and `useDeleteTask()` invalidates `['task-trash']` after soft deletion.

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -w @wrike-clone/frontend -- src/api/task-trash.spec.ts`

Expected: FAIL because the API module does not exist.

- [ ] **Step 3: Implement hooks**

Use these keys:

```ts
export const taskTrashKeys = {
  all: ['task-trash'] as const,
  list: (filters: TrashFilterParams) => ['task-trash', 'list', filters] as const,
  detail: (id: string) => ['task-trash', 'detail', id] as const,
};
```

All mutations invalidate `taskTrashKeys.all`, `taskKeys.all`, `['dashboard']`, `['search']`, and `['notifications']` as applicable.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -w @wrike-clone/frontend -- src/api/task-trash.spec.ts src/api/tasks.spec.ts`

Expected: PASS.

```bash
git add packages/frontend/src/api/task-trash.ts packages/frontend/src/api/task-trash.spec.ts packages/frontend/src/api/tasks.ts
git commit -m "feat: add task Trash data hooks"
```

### Task 5: Add the lazy-loaded Trash page and navigation

**Files:**
- Create: `packages/frontend/src/pages/TrashPage.tsx`
- Create: `packages/frontend/src/pages/TrashPage.spec.tsx`
- Modify: `packages/frontend/src/App.tsx`
- Modify: `packages/frontend/src/design/navigation.ts`
- Modify: `packages/frontend/src/layouts/AppShell.tsx`
- Modify: `packages/frontend/src/layouts/AppShell.spec.tsx`

**Interfaces:**
- Consumes: Trash hooks from Task 4
- Produces: protected `/trash` route and role-aware Trash navigation item

- [ ] **Step 1: Write failing page behavior tests**

Test empty, loading, error, populated, restore-confirmation, and purge-confirmation states. Assert regular users never see purge controls and admins see purge only when `new Date(purgeEligibleAt) <= new Date()`.

```tsx
expect(screen.getByRole('heading', { name: 'Trash' })).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Restore Prepare report' }));
expect(screen.getByRole('dialog', { name: 'Restore task' })).toBeInTheDocument();
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -w @wrike-clone/frontend -- src/pages/TrashPage.spec.tsx src/layouts/AppShell.spec.tsx`

Expected: FAIL because the page, route, icon, and navigation item do not exist.

- [ ] **Step 3: Implement the page**

Use existing `PageHeader`, `Panel`, `StatePanel`, `Skeleton`, and `Button` primitives. Render title, project, deleting user, deletion time, and purge eligibility. Require a modal confirmation for restore and a stronger admin confirmation for purge that repeats the task title and says the action is irreversible.

- [ ] **Step 4: Add lazy route and navigation**

Add `const TrashPage = lazy(() => import('./pages/TrashPage'));` and `<Route path="/trash" element={<TrashPage />} />`. Add a `trash` icon to `NavigationItem['icon']` and `iconPaths`, then add `{ label: 'Trash', path: '/trash', section: 'manage', icon: 'trash' }` for every authenticated role.

- [ ] **Step 5: Run frontend verification**

Run: `npm test -w @wrike-clone/frontend -- src/pages/TrashPage.spec.tsx src/layouts/AppShell.spec.tsx src/api/task-trash.spec.ts`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/pages/TrashPage.tsx packages/frontend/src/pages/TrashPage.spec.tsx packages/frontend/src/App.tsx packages/frontend/src/design/navigation.ts packages/frontend/src/layouts/AppShell.tsx packages/frontend/src/layouts/AppShell.spec.tsx
git commit -m "feat: add recoverable task Trash interface"
```
