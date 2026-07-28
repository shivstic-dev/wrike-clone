# Quick Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized users create a task from any screen without manually creating a folder or project, then browse and move that task within its department.

**Architecture:** Keep `tasks.project_id` required. Add an idempotent `TaskLocationService` that resolves an explicit project or provisions a visible department General folder and hidden per-folder General Tasks project. Store one canonical home-folder link per task and route all movement through a transactional location endpoint.

**Tech Stack:** NestJS, Knex, PostgreSQL/Supabase, Zod, React 19, React Router, TanStack Query, TypeScript, Jest, Vitest.

**Approved design:** `docs/superpowers/specs/2026-07-28-quick-tasks-and-reliable-reports-design.md`

**Execution order:** Complete this plan before
`docs/superpowers/plans/2026-07-28-reliable-reports.md`; the reports plan then
consolidates cache invalidation and performs the final cross-feature production
check.

## Global Constraints

- Each department owns its own automatic `General` folder.
- Tasks may move only between folders and projects in the same department.
- Only tenant admins, department heads, and managers may create or move tasks.
- Managers may assign only themselves and employees in the selected department.
- System projects are hidden from ordinary project lists and selectors.
- The General folder remains visible and selectable.
- Task creation and movement must be atomic and tenant-scoped.
- Existing project-based task creation must remain backward compatible.
- Do not stage or modify the user's existing `.env.example` change.

---

## File Structure

- `supabase/migrations/20260728114500_quick_task_locations.sql`: schema flags, uniqueness, home-link backfill and indexes.
- `packages/backend/src/migrations/017_quick_task_locations.ts`: Railway/Knex wrapper for the Supabase SQL migration.
- `packages/backend/test/unit/quick-task-locations-migration.spec.ts`: migration contract tests.
- `packages/shared/src/validation/index.ts`: location-aware creation and movement schemas.
- `packages/shared/src/types/api.ts`: request/response location contracts.
- `packages/shared/src/types/domain.ts`: task, folder and project system/location fields.
- `packages/shared/test/validation.spec.ts`: validation tests.
- `packages/backend/src/task/task-location.service.ts`: provisioning, destination resolution, listing and movement.
- `packages/backend/src/task/task-location.types.ts`: focused internal location types.
- `packages/backend/src/task/task.module.ts`: registers and exports the location service.
- `packages/backend/src/task/task.service.ts`: integrates canonical location into task reads and creation.
- `packages/backend/src/task/task.controller.ts`: task movement route.
- `packages/backend/src/task/department-workflow.controller.ts`: department location-list route.
- `packages/backend/test/unit/task-location.service.spec.ts`: service behavior and permission tests.
- `packages/backend/test/unit/task.service.spec.ts`: creation integration regression tests.
- `packages/backend/src/project/project.service.ts`: hides/protects system projects.
- `packages/backend/src/folder/folder.service.ts`: protects the system General folder.
- `packages/backend/test/unit/system-container-protection.spec.ts`: project/folder protection tests.
- `packages/frontend/src/api/task-locations.ts`: location queries and move mutation.
- `packages/frontend/src/api/tasks.ts`: quick-create input, folder filter serialization and cache invalidation.
- `packages/frontend/src/api/tasks.spec.ts`: request serialization and cache-key tests.
- `packages/frontend/src/components/Task/QuickTaskModal.tsx`: compact global creation UI.
- `packages/frontend/src/components/Task/TaskLocationFields.tsx`: reusable department/folder/project controls.
- `packages/frontend/src/components/Task/quick-task-form.ts`: testable form normalization and role helpers.
- `packages/frontend/src/components/Task/quick-task-form.spec.ts`: pure UI behavior tests.
- `packages/frontend/src/layouts/DashboardLayout.tsx`: global action and modal host.
- `packages/frontend/src/pages/TaskDetailPage.tsx`: authorized location editor.
- `packages/frontend/src/components/Folder/FolderTree.tsx`: selectable folder nodes.
- `packages/frontend/src/pages/WorkspacePage.tsx`: selected-folder task list and hidden-project filtering.

---

### Task 1: Add system-container and canonical-home schema

**Files:**
- Create: `supabase/migrations/20260728114500_quick_task_locations.sql`
- Create: `packages/backend/src/migrations/017_quick_task_locations.ts`
- Create: `packages/backend/test/unit/quick-task-locations-migration.spec.ts`

**Interfaces:**
- Consumes: existing `folders`, `projects`, `tasks`, and `task_folder_links` tables.
- Produces: `folders.is_system_general`, `projects.is_system`, `ux_folders_system_general`, `ux_projects_system_folder`, and `ux_task_folder_links_home`.

- [ ] **Step 1: Create the migration file through the Supabase CLI**

Run:

```powershell
npx supabase migration new quick_task_locations
$generated = Get-ChildItem -LiteralPath 'supabase\migrations' -Filter '*_quick_task_locations.sql' |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1
if (-not $generated) { throw 'Supabase did not create the migration file' }
$target = (Resolve-Path 'supabase\migrations').Path + '\20260728114500_quick_task_locations.sql'
if (-not $generated.FullName.StartsWith((Resolve-Path 'supabase\migrations').Path)) {
  throw 'Generated migration is outside the repository migration directory'
}
if ($generated.FullName -ne $target) {
  Move-Item -LiteralPath $generated.FullName -Destination $target
}
```

Expected: one empty migration exists at
`supabase/migrations/20260728114500_quick_task_locations.sql`.

- [ ] **Step 2: Write the failing migration contract test**

```typescript
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260728114500_quick_task_locations.sql'),
  'utf8',
);

describe('quick task locations migration', () => {
  it('adds explicit system flags and one-home uniqueness', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_system_general BOOLEAN');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_system BOOLEAN');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_folders_system_general');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_system_folder');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_task_folder_links_home');
  });

  it('backfills missing task home folders from the current project folder', () => {
    expect(sql).toContain('INSERT INTO task_folder_links');
    expect(sql).toContain('JOIN projects p ON p.id = t.project_id');
    expect(sql).toContain('WHERE NOT EXISTS');
  });
});
```

- [ ] **Step 3: Run the migration test and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand quick-task-locations-migration.spec.ts
```

Expected: FAIL because the migration SQL is empty.

- [ ] **Step 4: Implement the migration SQL**

```sql
ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS is_system_general BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS ux_folders_system_general
  ON folders (tenant_id, workspace_id)
  WHERE is_system_general = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_system_folder
  ON projects (tenant_id, folder_id)
  WHERE is_system = true AND deleted_at IS NULL;

WITH ranked_homes AS (
  SELECT tenant_id, task_id, folder_id,
         row_number() OVER (
           PARTITION BY tenant_id, task_id
           ORDER BY is_home DESC, folder_id
         ) AS row_number
  FROM task_folder_links
)
UPDATE task_folder_links link
SET is_home = (ranked.row_number = 1)
FROM ranked_homes ranked
WHERE link.tenant_id = ranked.tenant_id
  AND link.task_id = ranked.task_id
  AND link.folder_id = ranked.folder_id;

INSERT INTO task_folder_links (tenant_id, task_id, folder_id, is_home)
SELECT t.tenant_id, t.id, p.folder_id, true
FROM tasks t
JOIN projects p ON p.id = t.project_id AND p.tenant_id = t.tenant_id
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM task_folder_links existing
    WHERE existing.tenant_id = t.tenant_id
      AND existing.task_id = t.id
      AND existing.is_home = true
  )
ON CONFLICT (task_id, folder_id)
DO UPDATE SET is_home = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_task_folder_links_home
  ON task_folder_links (tenant_id, task_id)
  WHERE is_home = true;

CREATE INDEX IF NOT EXISTS idx_task_folder_links_home_folder
  ON task_folder_links (tenant_id, folder_id, task_id)
  WHERE is_home = true;
```

- [ ] **Step 5: Add the Knex/Railway wrapper**

```typescript
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const migrationPath = resolve(
    __dirname,
    '../../../../supabase/migrations/20260728114500_quick_task_locations.sql',
  );
  await knex.raw(await readFile(migrationPath, 'utf8'));
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_task_folder_links_home_folder;
    DROP INDEX IF EXISTS ux_task_folder_links_home;
    DROP INDEX IF EXISTS ux_projects_system_folder;
    DROP INDEX IF EXISTS ux_folders_system_general;
    ALTER TABLE projects DROP COLUMN IF EXISTS is_system;
    ALTER TABLE folders DROP COLUMN IF EXISTS is_system_general;
  `);
}
```

- [ ] **Step 6: Verify GREEN and production-build migration discovery**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand quick-task-locations-migration.spec.ts
npm run build --workspace=@wrike-clone/backend
Get-ChildItem 'packages\backend\dist\migrations' -Filter '017_quick_task_locations.js'
```

Expected: test PASS and one compiled wrapper is listed.

- [ ] **Step 7: Commit**

```powershell
git add -- 'supabase/migrations/20260728114500_quick_task_locations.sql' `
  'packages/backend/src/migrations/017_quick_task_locations.ts' `
  'packages/backend/test/unit/quick-task-locations-migration.spec.ts'
git commit -m "feat: add quick task location schema"
```

---

### Task 2: Define location-aware shared contracts

**Files:**
- Modify: `packages/shared/src/validation/index.ts`
- Modify: `packages/shared/src/types/api.ts`
- Modify: `packages/shared/src/types/domain.ts`
- Modify: `packages/shared/test/validation.spec.ts`

**Interfaces:**
- Consumes: `createTaskSchema`, `CreateTaskRequest`, `Task`, `Folder`, and `Project`.
- Produces: `taskLocationInputSchema`, `moveTaskLocationSchema`, `TaskLocationInput`, `MoveTaskLocationInput`, `TaskLocationOption`, and location metadata on `Task`.

- [ ] **Step 1: Write failing validation tests**

```typescript
describe('quick task location validation', () => {
  it('accepts a department-only quick task', () => {
    expect(
      createTaskSchema.safeParse({
        departmentId: '00000000-0000-4000-8000-000000000001',
        title: 'Prepare banner',
      }).success,
    ).toBe(true);
  });

  it('keeps project-only creation backward compatible', () => {
    expect(
      createTaskSchema.safeParse({
        projectId: '00000000-0000-4000-8000-000000000002',
        title: 'Prepare banner',
      }).success,
    ).toBe(true);
  });

  it('rejects creation without a department or project', () => {
    expect(createTaskSchema.safeParse({ title: 'Prepare banner' }).success).toBe(false);
  });

  it('requires a folder or project when moving', () => {
    expect(moveTaskLocationSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the shared test and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/shared -- --runInBand validation.spec.ts
```

Expected: FAIL because `moveTaskLocationSchema` does not exist and `projectId` is required.

- [ ] **Step 3: Implement schemas and inferred types**

```typescript
export const taskLocationInputSchema = z
  .object({
    departmentId: uuidField.optional(),
    folderId: uuidField.optional(),
    projectId: uuidField.optional(),
  })
  .refine((value) => !!value.departmentId || !!value.projectId, {
    message: 'departmentId or projectId is required',
    path: ['departmentId'],
  });

export const moveTaskLocationSchema = z
  .object({
    folderId: uuidField.optional(),
    projectId: uuidField.optional(),
  })
  .refine((value) => !!value.folderId || !!value.projectId, {
    message: 'folderId or projectId is required',
    path: ['folderId'],
  });

export const createTaskSchema = taskLocationInputSchema.and(
  z.object({
    parentTaskId: uuidField.optional(),
    assigneeId: uuidField.optional(),
    assigneeIds: z.array(uuidField).max(50).optional(),
    title: z.string().min(1).max(500),
    description: z.string().max(10000).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    estimatedHours: z.number().nonnegative().optional(),
    startDate: isoDate.optional(),
    dueDate: isoDate.optional(),
    visibility: z.enum(['global', 'department']).optional().default('department'),
    customFields: z.record(z.unknown()).optional(),
  }),
);

export type TaskLocationInput = z.infer<typeof taskLocationInputSchema>;
export type MoveTaskLocationInput = z.infer<typeof moveTaskLocationSchema>;
```

- [ ] **Step 4: Extend API/domain types**

```typescript
export interface CreateTaskRequest {
  departmentId?: string;
  folderId?: string;
  projectId?: string;
  parentTaskId?: string;
  assigneeId?: string;
  assigneeIds?: string[];
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedHours?: number;
  startDate?: string;
  dueDate?: string;
  visibility?: 'global' | 'department';
  customFields?: Record<string, unknown>;
}

export interface MoveTaskLocationRequest {
  folderId?: string;
  projectId?: string;
}

export interface TaskLocationOption {
  folderId: string;
  folderName: string;
  isGeneral: boolean;
  projects: Array<{ projectId: string; projectName: string }>;
}
```

Add to `Task`:

```typescript
folderId?: string;
folderName?: string;
projectName?: string;
isSystemProject?: boolean;
```

Add to `Folder` and `Project`:

```typescript
// Folder
isSystemGeneral: boolean;

// Project
isSystem: boolean;
```

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm test --workspace=@wrike-clone/shared -- --runInBand validation.spec.ts
npm run typecheck --workspace=@wrike-clone/shared
npm run build --workspace=@wrike-clone/shared
```

Expected: all commands PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- 'packages/shared/src/validation/index.ts' `
  'packages/shared/src/types/api.ts' `
  'packages/shared/src/types/domain.ts' `
  'packages/shared/test/validation.spec.ts'
git commit -m "feat: define task location contracts"
```

---

### Task 3: Build the transactional TaskLocationService

**Files:**
- Create: `packages/backend/src/task/task-location.types.ts`
- Create: `packages/backend/src/task/task-location.service.ts`
- Create: `packages/backend/test/unit/task-location.service.spec.ts`
- Modify: `packages/backend/src/task/task.module.ts`

**Interfaces:**
- Consumes: `DepartmentAccessService`, authenticated tenant context, and Task 2 location inputs.
- Produces:
  - `resolveForCreate(input, trx): Promise<ResolvedTaskLocation>`
  - `resolveForMove(departmentId, input, trx): Promise<ResolvedTaskLocation>`
  - `writeHomeLink(taskId, folderId, trx): Promise<void>`
  - `listDepartmentLocations(departmentId): Promise<TaskLocationOption[]>`
  - `move(taskId, input): Promise<void>`

- [ ] **Step 1: Define the internal result type**

```typescript
export interface ResolvedTaskLocation {
  departmentId: string;
  folderId: string;
  folderName: string;
  projectId: string;
  projectName: string;
  isSystemProject: boolean;
}

export interface TaskLocationFolderRow {
  id: string;
  workspace_id: string;
  name: string;
  is_system_general: boolean;
}
```

- [ ] **Step 2: Write failing service tests**

Use a small table-aware fake database that records inserts and transaction
updates. Test real service decisions rather than query-builder call counts:

```typescript
it('provisions General and a hidden system project for department-only creation', async () => {
  const result = await service.resolveForCreate({ departmentId: 'dept-1' }, db);
  expect(result).toMatchObject({
    departmentId: 'dept-1',
    folderName: 'General',
    projectName: 'General Tasks',
    isSystemProject: true,
  });
  expect(rows.folders.filter((row) => row.is_system_general)).toHaveLength(1);
  expect(rows.projects.filter((row) => row.is_system)).toHaveLength(1);
});

it('reuses the same system records on repeated requests', async () => {
  const first = await service.resolveForCreate({ departmentId: 'dept-1' }, db);
  const second = await service.resolveForCreate({ departmentId: 'dept-1' }, db);
  expect(second.folderId).toBe(first.folderId);
  expect(second.projectId).toBe(first.projectId);
});

it('rejects a destination in another department', async () => {
  await expect(
    service.resolveForMove('dept-1', { folderId: 'folder-dept-2' }, db),
  ).rejects.toThrow('Destination must belong to the current department');
});

it('resolves a folder-only destination to that folders system project', async () => {
  const result = await service.resolveForCreate(
    { departmentId: 'dept-1', folderId: 'folder-1' },
    db,
  );
  expect(result).toMatchObject({
    departmentId: 'dept-1',
    folderId: 'folder-1',
    isSystemProject: true,
  });
});

it('resolves a project-only destination and its containing folder', async () => {
  const result = await service.resolveForCreate({ projectId: 'project-1' }, db);
  expect(result).toMatchObject({
    departmentId: 'dept-1',
    folderId: 'folder-1',
    projectId: 'project-1',
    isSystemProject: false,
  });
});

it('rejects a folder and project that do not match', async () => {
  await expect(
    service.resolveForCreate(
      { departmentId: 'dept-1', folderId: 'folder-1', projectId: 'project-2' },
      db,
    ),
  ).rejects.toThrow('Project does not belong to the selected folder');
});

it('recovers the winner after a concurrent provisioning conflict', async () => {
  fakeDb.failNextSystemProjectInsertWithUniqueViolation();
  const result = await service.resolveForCreate(
    { departmentId: 'dept-1', folderId: 'folder-1' },
    db,
  );
  expect(result.projectId).toBe('project-created-by-other-request');
});

it('rolls back project, home link and audit changes when movement fails', async () => {
  fakeDb.failNextActivityInsert();
  await expect(
    service.move('task-1', { folderId: 'folder-2' }),
  ).rejects.toThrow('activity insert failed');
  expect(rows.tasks.find((task) => task.id === 'task-1')?.project_id).toBe('project-1');
  expect(rows.task_folder_links.find((link) => link.task_id === 'task-1')?.folder_id)
    .toBe('folder-1');
});
```

- [ ] **Step 3: Run the service test and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand task-location.service.spec.ts
```

Expected: FAIL because `TaskLocationService` is not implemented.

- [ ] **Step 4: Implement destination resolution**

Use the following public shape and keep provisioning helpers private:

```typescript
@Injectable()
export class TaskLocationService {
  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccess: DepartmentAccessService,
  ) {}

  async resolveForCreate(
    input: TaskLocationInput,
    trx: Knex.Transaction,
  ): Promise<ResolvedTaskLocation> {
    if (input.projectId) {
      const destination = await this.resolveProject(
        input.projectId,
        input.departmentId,
        input.folderId,
        trx,
      );
      await this.departmentAccess.assertCanCreateTask(destination.departmentId);
      return destination;
    }
    const departmentId = input.departmentId!;
    await this.departmentAccess.assertCanCreateTask(departmentId);
    const folder = input.folderId
      ? await this.requireFolder(input.folderId, departmentId, trx)
      : await this.getOrCreateGeneralFolder(departmentId, trx);
    return this.resolveSystemProject(folder, trx);
  }
}
```

Implement conflict-safe provisioning:

```typescript
private async getOrCreateGeneralFolder(
  departmentId: string,
  trx: Knex.Transaction,
) {
  const ctx = requireTenantContext();
  const read = () =>
    trx('folders')
      .where({
        tenant_id: ctx.tenantId,
        workspace_id: departmentId,
        is_system_general: true,
      })
      .whereNull('deleted_at')
      .first();
  const existing = await read();
  if (existing) return existing;
  await trx('folders')
    .insert({
      id: uuidv4(),
      tenant_id: ctx.tenantId,
      workspace_id: departmentId,
      parent_folder_id: null,
      name: 'General',
      description: 'Tasks created without a selected folder',
      is_system_general: true,
      sort_order: 0,
    })
    .onConflict()
    .ignore();
  const winner = await read();
  if (!winner) throw new InternalServerErrorException('General folder could not be provisioned');
  return winner;
}

private async resolveSystemProject(
  folder: TaskLocationFolderRow,
  trx: Knex.Transaction,
): Promise<ResolvedTaskLocation> {
  const ctx = requireTenantContext();
  const read = () =>
    trx('projects')
      .where({
        tenant_id: ctx.tenantId,
        folder_id: folder.id,
        is_system: true,
      })
      .whereNull('deleted_at')
      .first();
  let project = await read();
  if (!project) {
    await trx('projects')
      .insert({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        folder_id: folder.id,
        owner_id: ctx.userId,
        name: 'General Tasks',
        description: 'Automatic project for direct tasks',
        visibility: 'department',
        is_system: true,
      })
      .onConflict()
      .ignore();
    project = await read();
  }
  if (!project) {
    throw new InternalServerErrorException('System project could not be provisioned');
  }
  return {
    departmentId: folder.workspace_id,
    folderId: folder.id,
    folderName: folder.name,
    projectId: project.id,
    projectName: project.name,
    isSystemProject: true,
  };
}
```

Implement tenant-, activity-, visibility-, and department-aware resolution:

```typescript
private async requireFolder(
  folderId: string,
  departmentId: string,
  trx: Knex.Transaction,
) {
  const ctx = requireTenantContext();
  const query = trx('folders')
    .where({ id: folderId, tenant_id: ctx.tenantId })
    .whereNull('deleted_at');
  applyFolderVisibilityScope(query, ctx);
  const folder = await query.first();
  if (!folder) throw new NotFoundException('Folder not found');
  if (folder.workspace_id !== departmentId) {
    throw new ForbiddenException('Destination must belong to the current department');
  }
  return folder;
}

private async resolveProject(
  projectId: string,
  departmentId: string | undefined,
  folderId: string | undefined,
  trx: Knex.Transaction,
): Promise<ResolvedTaskLocation> {
  const ctx = requireTenantContext();
  const query = trx('projects')
    .join('folders', 'folders.id', 'projects.folder_id')
    .where('projects.id', projectId)
    .where('projects.tenant_id', ctx.tenantId)
    .where('projects.is_system', false)
    .whereNull('projects.deleted_at')
    .whereNull('folders.deleted_at')
    .select(
      'projects.*',
      'folders.id as resolved_folder_id',
      'folders.name as folder_name',
      'folders.workspace_id as department_id',
    );
  applyVisibilityScope(query, ctx, 'folders.workspace_id', 'projects.visibility');
  const project = await query.first();
  if (!project) throw new NotFoundException('Project not found');
  if (departmentId && project.department_id !== departmentId) {
    throw new ForbiddenException('Destination must belong to the current department');
  }
  if (folderId && project.resolved_folder_id !== folderId) {
    throw new BadRequestException('Project does not belong to the selected folder');
  }
  return {
    departmentId: project.department_id,
    folderId: project.resolved_folder_id,
    folderName: project.folder_name,
    projectId: project.id,
    projectName: project.name,
    isSystemProject: false,
  };
}
```

- [ ] **Step 5: Implement canonical home-link writes and movement**

```typescript
async writeHomeLink(
  taskId: string,
  folderId: string,
  trx: Knex.Transaction,
): Promise<void> {
  const ctx = requireTenantContext();
  await trx('task_folder_links')
    .where({ tenant_id: ctx.tenantId, task_id: taskId, is_home: true })
    .del();
  await trx('task_folder_links').insert({
    tenant_id: ctx.tenantId,
    task_id: taskId,
    folder_id: folderId,
    is_home: true,
  });
}

async move(taskId: string, input: MoveTaskLocationInput) {
  const ctx = requireTenantContext();
  return this.db.transaction(async (trx) => {
    const task = await this.requireTaskWithLocation(taskId, trx, { forUpdate: true });
    await this.departmentAccess.assertCanManageTask(task.department_id);
    const destination = await this.resolveForMove(task.department_id, input, trx);
    await trx('tasks')
      .where({ id: taskId, tenant_id: ctx.tenantId })
      .update({ project_id: destination.projectId, updated_at: new Date() });
    await this.writeHomeLink(taskId, destination.folderId, trx);
    await trx('activity_logs').insert({
      id: uuidv4(),
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity_type: 'task',
      entity_id: taskId,
      action: 'task:location:changed',
      changes: JSON.stringify({
        old: { folderId: task.folder_id, projectId: task.project_id },
        new: { folderId: destination.folderId, projectId: destination.projectId },
      }),
      metadata: '{}',
    });
  });
}
```

Lock and resolve the current task inside the movement transaction:

```typescript
private async requireTaskWithLocation(
  taskId: string,
  trx: Knex | Knex.Transaction = this.db,
  options: { forUpdate?: boolean } = {},
) {
  const ctx = requireTenantContext();
  const query = trx('tasks')
    .leftJoin({ home_link: 'task_folder_links' }, function () {
      this.on('home_link.task_id', '=', 'tasks.id')
        .andOn('home_link.tenant_id', '=', 'tasks.tenant_id')
        .andOnVal('home_link.is_home', '=', true);
    })
    .where('tasks.id', taskId)
    .where('tasks.tenant_id', ctx.tenantId)
    .whereNull('tasks.deleted_at')
    .select('tasks.*', 'home_link.folder_id');
  if (options.forUpdate) query.forUpdate();
  const task = await query.first();
  if (!task) throw new NotFoundException('Task not found');
  return task;
}
```

- [ ] **Step 6: Implement valid destination listing**

```typescript
async listDepartmentLocations(departmentId: string): Promise<TaskLocationOption[]> {
  await this.departmentAccess.assertCanViewDepartment(departmentId);
  const ctx = requireTenantContext();
  const folders = await this.db('folders')
    .where({ tenant_id: ctx.tenantId, workspace_id: departmentId, deleted_at: null })
    .orderBy('is_system_general', 'desc')
    .orderBy('sort_order', 'asc');
  const projects = await this.db('projects')
    .join('folders', 'folders.id', 'projects.folder_id')
    .where('projects.tenant_id', ctx.tenantId)
    .where('folders.workspace_id', departmentId)
    .where('projects.is_system', false)
    .whereNull('projects.deleted_at')
    .select('projects.id', 'projects.name', 'projects.folder_id');
  return folders.map((folder) => ({
    folderId: folder.id,
    folderName: folder.name,
    isGeneral: folder.is_system_general,
    projects: projects
      .filter((project) => project.folder_id === folder.id)
      .map((project) => ({ projectId: project.id, projectName: project.name })),
  }));
}
```

- [ ] **Step 7: Register the provider and verify GREEN**

```typescript
@Module({
  imports: [RbacModule, WorkspaceModule],
  controllers: [TaskController, DepartmentWorkflowController],
  providers: [TaskService, TaskLocationService],
  exports: [TaskService, TaskLocationService],
})
export class TaskModule {}
```

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand task-location.service.spec.ts
npm run typecheck --workspace=@wrike-clone/backend
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- 'packages/backend/src/task/task-location.types.ts' `
  'packages/backend/src/task/task-location.service.ts' `
  'packages/backend/src/task/task.module.ts' `
  'packages/backend/test/unit/task-location.service.spec.ts'
git commit -m "feat: add transactional task locations"
```

---

### Task 4: Integrate quick creation, reads and movement routes

**Files:**
- Modify: `packages/backend/src/task/task.service.ts`
- Modify: `packages/backend/src/task/task.controller.ts`
- Modify: `packages/backend/src/task/department-workflow.controller.ts`
- Modify: `packages/backend/test/unit/task.service.spec.ts`
- Create: `packages/backend/test/unit/task-location.controller.spec.ts`

**Interfaces:**
- Consumes: `TaskLocationService` from Task 3 and schemas from Task 2.
- Produces:
  - `GET /api/v1/departments/:departmentId/task-locations`
  - `PATCH /api/v1/tasks/:taskId/location`
  - task creation that accepts department/folder without project.

- [ ] **Step 1: Write failing creation integration tests**

```typescript
const taskLocations = {
  resolveForCreate: jest.fn(),
  writeHomeLink: jest.fn(),
  move: jest.fn(),
};

// Add this provider to the existing TestingModule in task.service.spec.ts:
{ provide: TaskLocationService, useValue: taskLocations }

it('creates a department-only quick task using the resolved system project', async () => {
  taskLocations.resolveForCreate.mockResolvedValue({
    departmentId: 'dept-1',
    folderId: 'folder-general',
    folderName: 'General',
    projectId: 'project-general',
    projectName: 'General Tasks',
    isSystemProject: true,
  });
  const result = await service.create({ departmentId: 'dept-1', title: 'Quick task' });
  expect(taskLocations.writeHomeLink).toHaveBeenCalledWith(
    expect.any(String),
    'folder-general',
    expect.anything(),
  );
  expect(result).toMatchObject({ folderId: 'folder-general', projectId: 'project-general' });
});
```

Keep the existing project-only creation test and assert it still passes through
the location resolver.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand task.service.spec.ts
```

Expected: FAIL because `TaskService` still directly requires `input.projectId`.

- [ ] **Step 3: Integrate one transaction in `TaskService.create`**

```typescript
const task = await this.db.transaction(async (trx) => {
  const location = await this.taskLocations.resolveForCreate(input, trx);
  await this.departmentAccess.assertCanCreateTask(location.departmentId);
  const [created] = await trx('tasks')
    .insert({
      id,
      tenant_id: ctx.tenantId,
      project_id: location.projectId,
      department_id: location.departmentId,
      parent_task_id: input.parentTaskId || null,
      assignee_id: assigneeIds[0] || null,
      created_by_id: ctx.userId,
      title: input.title,
      description: input.description || null,
      status: input.status || TaskStatus.TODO,
      priority: input.priority || TaskPriority.LOW,
      estimated_hours: input.estimatedHours || null,
      start_date: input.startDate || null,
      due_date: input.dueDate || null,
      visibility: input.visibility || 'department',
      custom_fields: input.customFields ? JSON.stringify(input.customFields) : '{}',
      sort_order: 0,
    })
    .returning('*');
  await this.replaceTaskAssignees(id, assigneeIds, trx);
  await this.taskLocations.writeHomeLink(id, location.folderId, trx);
  return { ...created, ...location };
});
```

Validate assignees against `location.departmentId`. Do not perform project or
folder provisioning outside this transaction.

- [ ] **Step 4: Attach location metadata to task reads**

Update the base task query used by `findVisibleTask`, `findAll`, and
`findDepartmentTasksGrouped`:

```typescript
.leftJoin({ home_link: 'task_folder_links' }, function () {
  this.on('home_link.task_id', '=', 'tasks.id')
    .andOn('home_link.tenant_id', '=', 'tasks.tenant_id')
    .andOnVal('home_link.is_home', '=', true);
})
.leftJoin({ task_project: 'projects' }, 'task_project.id', 'tasks.project_id')
.leftJoin({ home_folder: 'folders' }, 'home_folder.id', 'home_link.folder_id')
.select(
  'tasks.*',
  'home_folder.id as folder_id',
  'home_folder.name as folder_name',
  'task_project.name as project_name',
  'task_project.is_system as is_system_project',
)
```

When applying `filter.folderId`, filter through `home_link.folder_id` and
`home_link.is_home = true`; do not match a historical non-home link.

- [ ] **Step 5: Write failing controller route tests**

```typescript
const validFolderId = '00000000-0000-4000-8000-000000000001';
const locations = {
  listDepartmentLocations: jest.fn(),
};
const taskService = {
  moveLocation: jest.fn(),
};
const departmentController = new DepartmentWorkflowController(
  taskService as never,
  {} as never,
  locations as never,
);
const taskController = new TaskController(taskService as never);

it('lists task locations for a department', async () => {
  locations.listDepartmentLocations.mockResolvedValue([]);
  await departmentController.listLocations('dept-1');
  expect(locations.listDepartmentLocations).toHaveBeenCalledWith('dept-1');
});

it('moves a task using validated location input', async () => {
  taskService.moveLocation.mockResolvedValue({ id: 'task-1' });
  await taskController.moveLocation('task-1', { folderId: validFolderId });
  expect(taskService.moveLocation).toHaveBeenCalledWith(
    'task-1',
    { folderId: validFolderId },
  );
});
```

- [ ] **Step 6: Add controller routes**

Inject `TaskLocationService` into `DepartmentWorkflowController` and add the
department-relative route there:

```typescript
@Get(':id/task-locations')
@Permissions('task:read')
listLocations(@Param('id') id: string) {
  return this.taskLocations.listDepartmentLocations(id);
}
```

Import `moveTaskLocationSchema` in `TaskController` and add:

```typescript
@Patch(':taskId/location')
@Permissions('task:read')
moveLocation(@Param('taskId') taskId: string, @Body() body: unknown) {
  return this.taskService.moveLocation(taskId, moveTaskLocationSchema.parse(body));
}
```

Add this wrapper in `TaskService` so the controller returns the same fully
hydrated task shape as ordinary reads:

```typescript
async moveLocation(id: string, input: MoveTaskLocationInput) {
  await this.taskLocations.move(id, input);
  return this.findById(id);
}
```

- [ ] **Step 7: Verify GREEN and regressions**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand task.service.spec.ts task-location.controller.spec.ts
npm test --workspace=@wrike-clone/backend -- --runInBand
npm run typecheck --workspace=@wrike-clone/backend
```

Expected: all backend unit tests PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- 'packages/backend/src/task/task.service.ts' `
  'packages/backend/src/task/task.controller.ts' `
  'packages/backend/src/task/department-workflow.controller.ts' `
  'packages/backend/test/unit/task.service.spec.ts' `
  'packages/backend/test/unit/task-location.controller.spec.ts'
git commit -m "feat: support quick task creation and movement"
```

---

### Task 5: Hide and protect system containers

**Files:**
- Modify: `packages/backend/src/project/project.service.ts`
- Modify: `packages/backend/src/folder/folder.service.ts`
- Create: `packages/backend/test/unit/system-container-protection.spec.ts`

**Interfaces:**
- Consumes: system flags from Task 1.
- Produces: normal project lists without system projects and mutation guards for system containers.

- [ ] **Step 1: Write failing protection tests**

```typescript
function createProtectionQuery(firstRow: Record<string, unknown>) {
  const query: any = {};
  for (const method of [
    'where',
    'andWhere',
    'whereNull',
    'leftJoin',
    'join',
    'select',
    'modify',
    'clearSelect',
    'count',
    'clone',
    'orderBy',
    'limit',
    'offset',
    'update',
  ]) {
    query[method] = jest.fn(() => query);
  }
  query.first = jest.fn().mockResolvedValue(firstRow);
  query.returning = jest.fn().mockResolvedValue([firstRow]);
  query.then = (resolve: (value: unknown[]) => unknown) =>
    Promise.resolve([]).then(resolve);
  return query;
}

const projectQuery = createProtectionQuery({ count: 0 });
const folderQuery = createProtectionQuery({
  id: 'folder-1',
  is_system_general: true,
});
const projectDb = Object.assign(jest.fn(() => projectQuery), {
  raw: jest.fn(),
});
const folderDb = jest.fn(() => folderQuery);
const projectService = new ProjectService(projectDb as never);
const folderService = new FolderService(folderDb as never);

beforeEach(() => {
  jest.clearAllMocks();
  projectQuery.first.mockResolvedValue({ count: 0 });
  folderQuery.first.mockResolvedValue({
    id: 'folder-1',
    is_system_general: true,
  });
  tenantContext.enterWith({
    tenantId: 'tenant-1',
    userId: 'admin-1',
    membershipId: 'membership-1',
    role: 'admin',
    permissions: ['*'],
  });
});

it('excludes system projects from normal project lists', async () => {
  await projectService.findAll({ workspaceId: 'dept-1' });
  expect(projectQuery.where).toHaveBeenCalledWith('projects.is_system', false);
});

it('rejects renaming the system General folder', async () => {
  folderQuery.first.mockResolvedValue({ id: 'folder-1', is_system_general: true });
  await expect(folderService.update('folder-1', { name: 'Renamed' })).rejects.toThrow(
    'The General folder is managed by the system',
  );
});

it('rejects deleting a hidden system project', async () => {
  projectQuery.first.mockResolvedValueOnce({
    id: 'project-1',
    is_system: true,
  });
  await expect(projectService.remove('project-1')).rejects.toThrow(
    'System projects are managed automatically',
  );
});

it('rejects archiving the system General folder', async () => {
  await expect(
    folderService.update('folder-1', { isArchived: true }),
  ).rejects.toThrow('The General folder is managed by the system');
});

it('rejects deleting the system General folder', async () => {
  await expect(folderService.remove('folder-1')).rejects.toThrow(
    'The General folder is managed by the system',
  );
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand system-container-protection.spec.ts
```

Expected: FAIL because system rows are neither filtered nor protected.

- [ ] **Step 3: Implement project filtering and mutation guards**

In `ProjectService.findAll`:

```typescript
.where('projects.is_system', false)
```

In `ProjectService.update` and `remove`:

```typescript
const existing = await this.findById(id, { includeSystem: true });
if (existing.is_system) {
  throw new ForbiddenException('System projects are managed automatically');
}
```

Change the method signature to:

```typescript
async findById(id: string, options: { includeSystem?: boolean } = {}) {
```

and add this to its existing query:

```typescript
.modify((query) => {
  if (!options.includeSystem) query.where('projects.is_system', false);
  if (ctx.role !== 'admin') {
    applyVisibilityScope(query, ctx, 'folders.workspace_id', 'projects.visibility');
  }
})
```

Only `update` and `remove` pass `{ includeSystem: true }`. The ordinary
controller call passes no option, so `GET /projects/:id` cannot expose a hidden
system project.

- [ ] **Step 4: Implement General-folder guards**

```typescript
const existing = await this.findById(id);
if (existing.is_system_general) {
  throw new ForbiddenException('The General folder is managed by the system');
}
```

Apply before update and remove. Normal reads and task-location selection still
show the General folder.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm test --workspace=@wrike-clone/backend -- --runInBand system-container-protection.spec.ts
npm run lint --workspace=@wrike-clone/backend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- 'packages/backend/src/project/project.service.ts' `
  'packages/backend/src/folder/folder.service.ts' `
  'packages/backend/test/unit/system-container-protection.spec.ts'
git commit -m "fix: protect automatic task containers"
```

---

### Task 6: Add frontend location APIs and testable form rules

**Files:**
- Create: `packages/frontend/src/api/task-locations.ts`
- Modify: `packages/frontend/src/api/tasks.ts`
- Modify: `packages/frontend/src/api/tasks.spec.ts`
- Create: `packages/frontend/src/components/Task/quick-task-form.ts`
- Create: `packages/frontend/src/components/Task/quick-task-form.spec.ts`

**Interfaces:**
- Consumes: Task 2 request and location option types.
- Produces:
  - `useTaskLocations(departmentId)`
  - `useMoveTaskLocation()`
  - `canCreateQuickTask(departments, tenantRole)`
  - `permittedQuickTaskAssignees(members, viewerRole, currentUserId)`
  - `normalizeQuickTaskInput(state)`

- [ ] **Step 1: Write failing API/helper tests**

```typescript
it('serializes folderId in task list filters', () => {
  expect(Object.fromEntries(buildTaskSearchParams({ folderId: 'folder-1' }))).toEqual({
    folderId: 'folder-1',
  });
});

it('omits projectId for a folder-only quick task', () => {
  expect(
    normalizeQuickTaskInput({
      ...createQuickTaskFormState('dept-1'),
      title: 'Banner',
      folderId: 'folder-1',
    }),
  ).toMatchObject({
    title: 'Banner',
    departmentId: 'dept-1',
    folderId: 'folder-1',
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend -- --run src/api/tasks.spec.ts src/components/Task/quick-task-form.spec.ts
```

Expected: FAIL because the folder filter and helper do not exist.

- [ ] **Step 3: Implement request helpers**

Add to `buildTaskSearchParams`:

```typescript
if (filters.folderId) params.set('folderId', filters.folderId);
```

Implement:

```typescript
export interface QuickTaskFormState {
  title: string;
  departmentId: string;
  folderId: string;
  projectId: string;
  assigneeIds: string[];
  dueDate: string;
  description: string;
  priority: TaskPriority;
  startDate: string;
  estimatedHours: number | '';
  visibility: 'global' | 'department';
}

export function createQuickTaskFormState(departmentId = ''): QuickTaskFormState {
  return {
    title: '',
    departmentId,
    folderId: '',
    projectId: '',
    assigneeIds: [],
    dueDate: '',
    description: '',
    priority: TaskPriority.LOW,
    startDate: '',
    estimatedHours: '',
    visibility: 'department',
  };
}

export function changeQuickTaskDepartment(
  state: QuickTaskFormState,
  departmentId: string,
): QuickTaskFormState {
  return {
    ...state,
    departmentId,
    folderId: '',
    projectId: '',
    assigneeIds: [],
  };
}

export function normalizeQuickTaskInput(state: QuickTaskFormState): CreateTaskRequest {
  return {
    title: state.title.trim(),
    departmentId: state.departmentId,
    folderId: state.folderId || undefined,
    projectId: state.projectId || undefined,
    assigneeIds: state.assigneeIds,
    dueDate: state.dueDate ? new Date(state.dueDate).toISOString() : undefined,
    description: state.description.trim() || undefined,
    priority: state.priority,
    startDate: state.startDate ? new Date(state.startDate).toISOString() : undefined,
    estimatedHours:
      state.estimatedHours === '' ? undefined : Number(state.estimatedHours),
    visibility: state.visibility,
  };
}
```

Implement:

```typescript
export function canCreateQuickTask(
  departments: Array<{ departmentRole?: string }>,
  tenantRole?: string,
): boolean {
  return (
    tenantRole === 'admin' ||
    departments.some((department) =>
      ['admin', 'department_head', 'manager'].includes(
        department.departmentRole || '',
      ),
    )
  );
}

export function permittedQuickTaskAssignees<
  T extends { userId: string; role: string },
>(
  members: T[],
  viewerRole: string | undefined,
  currentUserId: string | undefined,
): T[] {
  return viewerRole === 'manager'
    ? members.filter(
        (member) => member.userId === currentUserId || member.role === 'employee',
      )
    : members;
}
```

- [ ] **Step 4: Add location hooks**

```typescript
export function useTaskLocations(departmentId: string) {
  return useQuery({
    queryKey: ['task-locations', departmentId],
    queryFn: async () => {
      const { data } = await apiClient.get<TaskLocationOption[]>(
        `/departments/${departmentId}/task-locations`,
      );
      return data;
    },
    enabled: !!departmentId,
  });
}

export function useMoveTaskLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, ...input }: MoveTaskLocationRequest & { taskId: string }) => {
      const { data } = await apiClient.patch<Task>(`/tasks/${taskId}/location`, input);
      return data;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}
```

Apply the same `taskKeys.all`, `['reports']`, `folderKeys.all`, and
`workspaceKeys.all` invalidations to `useCreateTask`. This refreshes Dashboard,
My Tasks, Calendar, folder trees, normal project lists, and open reports after
the server lazily provisions a location and creates the task.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend -- --run src/api/tasks.spec.ts src/components/Task/quick-task-form.spec.ts
npm run typecheck --workspace=@wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- 'packages/frontend/src/api/task-locations.ts' `
  'packages/frontend/src/api/tasks.ts' `
  'packages/frontend/src/api/tasks.spec.ts' `
  'packages/frontend/src/components/Task/quick-task-form.ts' `
  'packages/frontend/src/components/Task/quick-task-form.spec.ts'
git commit -m "feat: add quick task client contracts"
```

---

### Task 7: Build the global Quick task modal

**Files:**
- Create: `packages/frontend/src/components/Task/TaskLocationFields.tsx`
- Create: `packages/frontend/src/components/Task/QuickTaskModal.tsx`
- Modify: `packages/frontend/src/layouts/DashboardLayout.tsx`

**Interfaces:**
- Consumes: `useWorkspaces`, `useWorkspaceMembers`, `useTaskLocations`, `useCreateTask`, and Task 6 helpers.
- Produces: global `+ Create task` action and role-correct compact form.

- [ ] **Step 1: Add a failing role-helper case before UI code**

```typescript
it('hides quick task from employee-only users', () => {
  expect(
    canCreateQuickTask([{ id: 'dept-1', departmentRole: 'employee' }], 'member'),
  ).toBe(false);
});

it('shows quick task to a department manager', () => {
  expect(
    canCreateQuickTask([{ id: 'dept-1', departmentRole: 'manager' }], 'member'),
  ).toBe(true);
});

it('preselects the department supplied by the current route', () => {
  expect(createQuickTaskFormState('dept-1').departmentId).toBe('dept-1');
});

it('clears incompatible values when the department changes', () => {
  const next = changeQuickTaskDepartment(
    {
      ...createQuickTaskFormState('dept-1'),
      folderId: 'folder-1',
      projectId: 'project-1',
      assigneeIds: ['employee-1'],
    },
    'dept-2',
  );
  expect(next).toMatchObject({
    departmentId: 'dept-2',
    folderId: '',
    projectId: '',
    assigneeIds: [],
  });
});

it('limits a manager assignee picker to self and employees', () => {
  expect(
    permittedQuickTaskAssignees(
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
```

- [ ] **Step 2: Run and verify RED, then implement the helper cases**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend -- --run src/components/Task/quick-task-form.spec.ts
```

Expected: first run FAIL; after implementing the role cases, PASS.

- [ ] **Step 3: Implement reusable location fields**

```tsx
interface TaskLocationFieldsProps {
  departmentId: string;
  folderId: string;
  projectId: string;
  departments: Array<{ id: string; name: string }>;
  locations: TaskLocationOption[];
  onDepartmentChange: (departmentId: string) => void;
  onFolderChange: (folderId: string) => void;
  onProjectChange: (projectId: string) => void;
}

export function TaskLocationFields({
  departmentId,
  folderId,
  projectId,
  departments,
  locations,
  onDepartmentChange,
  onFolderChange,
  onProjectChange,
}: TaskLocationFieldsProps) {
  const selectedFolder = locations.find((item) => item.folderId === folderId);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <label>
        Department
        <select
          required
          value={departmentId}
          onChange={(event) => onDepartmentChange(event.target.value)}
        >
          <option value="">Choose department</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Folder
        <select
          value={folderId}
          disabled={!departmentId}
          onChange={(event) => onFolderChange(event.target.value)}
        >
          <option value="">General (default)</option>
          {locations
            .filter((location) => !location.isGeneral)
            .map((location) => (
              <option key={location.folderId} value={location.folderId}>
                {location.folderName}
              </option>
            ))}
        </select>
      </label>
      <label>
        Project (optional)
        <select
          value={projectId}
          disabled={!selectedFolder}
          onChange={(event) => onProjectChange(event.target.value)}
        >
          <option value="">General Tasks</option>
          {(selectedFolder?.projects || []).map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.projectName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
```

The department change handler must clear folder, project, and assignees. The
folder change handler must clear project.

- [ ] **Step 4: Implement the compact modal**

```tsx
export function QuickTaskModal({ open, initialDepartmentId, onClose }: QuickTaskModalProps) {
  const { data: departments = [] } = useWorkspaces();
  const { membership, user } = useAuth();
  const navigate = useNavigate();
  const createTask = useCreateTask();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState(() => createQuickTaskFormState(initialDepartmentId));
  const { data: locations = [] } = useTaskLocations(state.departmentId);
  const { data: departmentMembers = [] } = useWorkspaceMembers(state.departmentId);
  const creatableDepartments = departments.filter(
    (department) =>
      membership?.role === 'admin' ||
      ['admin', 'department_head', 'manager'].includes(department.departmentRole || ''),
  );
  const selectedDepartment = departments.find(
    (department) => department.id === state.departmentId,
  );
  const canSetVisibility =
    membership?.role === 'admin' ||
    selectedDepartment?.departmentRole === 'admin' ||
    selectedDepartment?.departmentRole === 'department_head';
  const assignableMembers = permittedQuickTaskAssignees(
    departmentMembers,
    membership?.role === 'admin' ? 'admin' : selectedDepartment?.departmentRole,
    user?.id,
  );

  function handleDepartmentChange(departmentId: string) {
    setState(changeQuickTaskDepartment(state, departmentId));
  }

  function handleFolderChange(folderId: string) {
    setState({ ...state, folderId, projectId: '' });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const task = await createTask.mutateAsync(normalizeQuickTaskInput(state));
    toast.custom((toastInstance) => (
      <div className="rounded-lg bg-white p-4 shadow-lg">
        <span>
          Task saved in {task.folderName || 'General'} / {task.projectName || 'General Tasks'}
        </span>
        <button
          type="button"
          onClick={() => {
            toast.dismiss(toastInstance.id);
            navigate(`/tasks/${task.id}`);
          }}
        >
          Open task
        </button>
      </div>
    ));
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      restoreFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-task-title"
        tabIndex={-1}
        className="w-full max-w-3xl rounded-xl bg-white p-6"
      >
        <h2 id="quick-task-title">Create task</h2>
        <form onSubmit={submit}>
          <label>
            Task title
            <input
              required
              autoFocus
              value={state.title}
              onChange={(event) => setState({ ...state, title: event.target.value })}
            />
          </label>
          <TaskLocationFields
            departmentId={state.departmentId}
            folderId={state.folderId}
            projectId={state.projectId}
            departments={creatableDepartments}
            locations={locations}
            onDepartmentChange={handleDepartmentChange}
            onFolderChange={handleFolderChange}
            onProjectChange={(projectId) => setState({ ...state, projectId })}
          />
          <label>
            Assignees
            <select
              multiple
              value={state.assigneeIds}
              onChange={(event) =>
                setState({
                  ...state,
                  assigneeIds: Array.from(
                    event.currentTarget.selectedOptions,
                    (option) => option.value,
                  ),
                })
              }
            >
              {assignableMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName} ({member.email})
                </option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input
              type="date"
              value={state.dueDate}
              onChange={(event) => setState({ ...state, dueDate: event.target.value })}
            />
          </label>
          <details>
            <summary>More details</summary>
            <label>
              Description
              <textarea
                value={state.description}
                onChange={(event) => setState({ ...state, description: event.target.value })}
              />
            </label>
            <label>
              Priority
              <select
                value={state.priority}
                onChange={(event) =>
                  setState({ ...state, priority: event.target.value as TaskPriority })
                }
              >
                {Object.values(TaskPriority).map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input
                type="date"
                value={state.startDate}
                onChange={(event) => setState({ ...state, startDate: event.target.value })}
              />
            </label>
            <label>
              Estimated hours
              <input
                type="number"
                min="0"
                step="0.25"
                value={state.estimatedHours}
                onChange={(event) =>
                  setState({
                    ...state,
                    estimatedHours:
                      event.target.value === '' ? '' : Number(event.target.value),
                  })
                }
              />
            </label>
            {canSetVisibility && (
              <label>
                Visibility
                <select
                  value={state.visibility}
                  onChange={(event) =>
                    setState({
                      ...state,
                      visibility: event.target.value as 'global' | 'department',
                    })
                  }
                >
                  <option value="department">Department</option>
                  <option value="global">Organization</option>
                </select>
              </label>
            )}
          </details>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={createTask.isPending}>Create task</button>
        </form>
      </div>
    </div>
  );
}
```

Use semantic labels, `role="dialog"`, `aria-modal="true"`, Escape-to-close, and
restore focus to the trigger on close.

- [ ] **Step 5: Host the action in the top bar**

In `DashboardLayout`:

```tsx
const [quickTaskOpen, setQuickTaskOpen] = useState(false);
const canQuickCreate = canCreateQuickTask(workspaces || [], membership?.role);

{canQuickCreate && (
  <button className="btn-primary btn-sm" onClick={() => setQuickTaskOpen(true)}>
    + Create task
  </button>
)}
<QuickTaskModal
  open={quickTaskOpen}
  initialDepartmentId={workspaceId || ''}
  onClose={() => setQuickTaskOpen(false)}
/>
```

Place the action before the user menu and ensure it remains labelled on mobile.

- [ ] **Step 6: Verify the frontend**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend
npm run typecheck --workspace=@wrike-clone/frontend
npm run lint --workspace=@wrike-clone/frontend
npm run build --workspace=@wrike-clone/frontend
```

Expected: all commands PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- 'packages/frontend/src/components/Task/TaskLocationFields.tsx' `
  'packages/frontend/src/components/Task/QuickTaskModal.tsx' `
  'packages/frontend/src/components/Task/quick-task-form.ts' `
  'packages/frontend/src/components/Task/quick-task-form.spec.ts' `
  'packages/frontend/src/layouts/DashboardLayout.tsx'
git commit -m "feat: add global quick task action"
```

---

### Task 8: Add task movement and folder browsing UI

**Files:**
- Modify: `packages/frontend/src/pages/TaskDetailPage.tsx`
- Modify: `packages/frontend/src/components/Folder/FolderTree.tsx`
- Modify: `packages/frontend/src/pages/WorkspacePage.tsx`
- Modify: `packages/frontend/src/api/tasks.ts`

**Interfaces:**
- Consumes: location hooks from Task 6 and location metadata from Task 4.
- Produces: same-department task movement and folder-selected task lists.

- [ ] **Step 1: Write a failing folder filter serialization test**

```typescript
it('uses the canonical home folder when requesting folder tasks', () => {
  const params = buildTaskSearchParams({ folderId: 'folder-1', perPage: 100 });
  expect(params.get('folderId')).toBe('folder-1');
  expect(params.get('perPage')).toBe('100');
});
```

- [ ] **Step 2: Run and verify RED/GREEN**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend -- --run src/api/tasks.spec.ts
```

Expected: PASS only after Task 6's folder serialization is present.

- [ ] **Step 3: Make folder nodes selectable**

```tsx
interface FolderTreeProps {
  folders: Folder[];
  selectedFolderId?: string;
  onSelect?: (folder: Folder) => void;
}
```

Pass these props recursively. Apply selected styling and call `onSelect(folder)`
without breaking expand/collapse behavior.

- [ ] **Step 4: Show tasks and normal projects for the selected folder**

In `WorkspacePage`:

```tsx
const [selectedFolderId, setSelectedFolderId] = useState('');
const folderTasks = useTasks(
  { folderId: selectedFolderId, perPage: 100 },
  !!selectedFolderId,
);
const visibleProjects = (projects || []).filter(
  (project) => !project.isSystem && (!selectedFolderId || project.folderId === selectedFolderId),
);
```

Render `TaskTable` for the selected folder above its normal project cards.
General quick tasks are therefore accessible without exposing the system
project.

```tsx
{selectedFolderId && (
  <section>
    <h2>Tasks in this folder</h2>
    <TaskTable
      tasks={folderTasks.data?.data || []}
      isLoading={folderTasks.isLoading}
    />
  </section>
)}
```

Change the hook signature in `packages/frontend/src/api/tasks.ts` so an empty
selection does not issue an organization-wide request:

```typescript
export function useTasks(filters: TaskFilterParams = {}, enabled = true) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: async () => {
      const params = buildTaskSearchParams(filters);
      const { data } = await apiClient.get<PaginatedResponse<Task>>(
        `/tasks?${params.toString()}`,
      );
      return data;
    },
    enabled,
  });
}
```

- [ ] **Step 5: Add the Location editor to task detail**

```tsx
const moveLocation = useMoveTaskLocation();
const locations = useTaskLocations(task.departmentId);

async function handleMove(folderId: string, projectId?: string) {
  await moveLocation.mutateAsync({ taskId: task.id, folderId, projectId });
  toast.success('Task moved');
}
```

Render the section only for `canManage`. Department is read-only; folder and
project choices come only from `task.departmentId`:

```tsx
{canManage && (
  <section aria-labelledby="task-location-heading">
    <h2 id="task-location-heading">Location</h2>
    <label>
      Department
      <input value={task.departmentName || task.departmentId} readOnly />
    </label>
    <label>
      Folder
      <select
        value={task.folderId || ''}
        onChange={(event) => void handleMove(event.target.value)}
      >
        {(locations.data || []).map((location) => (
          <option key={location.folderId} value={location.folderId}>
            {location.folderName}
          </option>
        ))}
      </select>
    </label>
    <label>
      Project
      <select
        value={task.isSystemProject ? '' : task.projectId}
        onChange={(event) =>
          void handleMove(task.folderId!, event.target.value || undefined)
        }
      >
        <option value="">General Tasks</option>
        {(locations.data || [])
          .find((location) => location.folderId === task.folderId)
          ?.projects.map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.projectName}
            </option>
          ))}
      </select>
    </label>
  </section>
)}
```

- [ ] **Step 6: Verify complete frontend and backend builds**

Run:

```powershell
npm test --workspace=@wrike-clone/frontend
npm run lint --workspace=@wrike-clone/frontend
npm run typecheck --workspace=@wrike-clone/frontend
npm run build --workspace=@wrike-clone/frontend
npm run build --workspace=@wrike-clone/backend
```

Expected: all commands PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- 'packages/frontend/src/pages/TaskDetailPage.tsx' `
  'packages/frontend/src/components/Folder/FolderTree.tsx' `
  'packages/frontend/src/pages/WorkspacePage.tsx' `
  'packages/frontend/src/api/tasks.ts' `
  'packages/frontend/src/api/tasks.spec.ts'
git commit -m "feat: browse and move tasks by folder"
```

---

### Task 9: Apply, audit and verify Quick Tasks end to end

**Files:**
- Modify only if verification finds a defect in files already named above.

**Interfaces:**
- Consumes: all Quick Tasks tasks.
- Produces: applied production schema and a verified deployable release.

- [ ] **Step 1: Run the full local quality gate**

```powershell
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: every command PASS and only the user's `.env.example` remains
unstaged outside the planned work.

- [ ] **Step 2: Apply the SQL migration to the connected Supabase project**

Use the connected Supabase migration tool with project
`lsjeobyrmxiqewehhjai` and the exact contents of
`supabase/migrations/20260728114500_quick_task_locations.sql`.

Expected: migration succeeds once. Do not reapply if its migration history
already records success.

- [ ] **Step 3: Verify schema and backfill with read-only SQL**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'folders' AND column_name = 'is_system_general')
    OR (table_name = 'projects' AND column_name = 'is_system')
  )
ORDER BY table_name, column_name;

SELECT count(*) AS active_tasks_without_home
FROM tasks t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM task_folder_links link
    WHERE link.tenant_id = t.tenant_id
      AND link.task_id = t.id
      AND link.is_home = true
  );
```

Expected: both columns returned and `active_tasks_without_home = 0`.

- [ ] **Step 4: Run Supabase advisors**

Run the connected Supabase database advisors for security and performance.

Expected: no new finding caused by this migration. Existing Knex bookkeeping
table warnings are documented separately and are not application-data tables.

- [ ] **Step 5: Commit any verification-only corrections**

If no correction was needed, skip this commit. If a correction was required:

```powershell
git add -- 'supabase/migrations/20260728114500_quick_task_locations.sql' `
  'packages/backend/src/migrations/017_quick_task_locations.ts' `
  'packages/backend/test/unit/quick-task-locations-migration.spec.ts' `
  'packages/backend/src/task/task-location.types.ts' `
  'packages/backend/src/task/task-location.service.ts' `
  'packages/backend/src/task/task.module.ts' `
  'packages/backend/src/task/task.service.ts' `
  'packages/backend/src/task/task.controller.ts' `
  'packages/backend/src/task/department-workflow.controller.ts' `
  'packages/backend/test/unit/task-location.service.spec.ts' `
  'packages/backend/test/unit/task.service.spec.ts' `
  'packages/backend/test/unit/task-location.controller.spec.ts' `
  'packages/backend/src/project/project.service.ts' `
  'packages/backend/src/folder/folder.service.ts' `
  'packages/backend/test/unit/system-container-protection.spec.ts' `
  'packages/shared/src/validation/index.ts' `
  'packages/shared/src/types/api.ts' `
  'packages/shared/src/types/domain.ts' `
  'packages/shared/test/validation.spec.ts' `
  'packages/frontend/src/api/task-locations.ts' `
  'packages/frontend/src/api/tasks.ts' `
  'packages/frontend/src/api/tasks.spec.ts' `
  'packages/frontend/src/components/Task/TaskLocationFields.tsx' `
  'packages/frontend/src/components/Task/QuickTaskModal.tsx' `
  'packages/frontend/src/components/Task/quick-task-form.ts' `
  'packages/frontend/src/components/Task/quick-task-form.spec.ts' `
  'packages/frontend/src/layouts/DashboardLayout.tsx' `
  'packages/frontend/src/pages/TaskDetailPage.tsx' `
  'packages/frontend/src/components/Folder/FolderTree.tsx' `
  'packages/frontend/src/pages/WorkspacePage.tsx'
git commit -m "fix: complete quick task verification"
```

- [ ] **Step 6: Push and verify production story**

```powershell
git push origin main
```

Verify:

1. Exact commit reaches Railway and Vercel.
2. Admin/manager/head sees `+ Create task`; employee does not.
3. Title + department creates one General folder and one hidden project.
4. A repeat task reuses both records.
5. Task appears in General, Dashboard, and assignee My Tasks.
6. Moving to another folder preserves task ID, status, assignees and comments.
7. Railway health is 200 and Vercel has no new runtime errors.
