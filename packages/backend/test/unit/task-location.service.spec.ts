import { TaskLocationService } from '../../src/task/task-location.service';
import { tenantContext } from '../../src/common/tenant-context';

type Row = Record<string, any>;
interface Rows {
  folders: Row[];
  projects: Row[];
  tasks: Row[];
  task_folder_links: Row[];
  activity_logs: Row[];
  [table: string]: Row[];
}

const initialRows = (): Rows => ({
  folders: [
    {
      id: 'folder-1',
      tenant_id: 'tenant-1',
      workspace_id: 'dept-1',
      name: 'Delivery',
      is_system_general: false,
      is_archived: false,
      sort_order: 1,
      deleted_at: null,
    },
    {
      id: 'folder-2',
      tenant_id: 'tenant-1',
      workspace_id: 'dept-1',
      name: 'Operations',
      is_system_general: false,
      is_archived: false,
      sort_order: 2,
      deleted_at: null,
    },
    {
      id: 'folder-tag',
      tenant_id: 'tenant-1',
      workspace_id: 'dept-1',
      name: 'Reference',
      is_system_general: false,
      is_archived: false,
      sort_order: 3,
      deleted_at: null,
    },
    {
      id: 'folder-dept-2',
      tenant_id: 'tenant-1',
      workspace_id: 'dept-2',
      name: 'Other department',
      is_system_general: false,
      is_archived: false,
      sort_order: 1,
      deleted_at: null,
    },
    {
      id: 'folder-archived',
      tenant_id: 'tenant-1',
      workspace_id: 'dept-1',
      name: 'Archived',
      is_system_general: false,
      is_archived: true,
      sort_order: 4,
      deleted_at: null,
    },
  ],
  projects: [
    {
      id: 'project-1',
      tenant_id: 'tenant-1',
      folder_id: 'folder-1',
      owner_id: 'user-1',
      name: 'Website',
      visibility: 'department',
      status: 'active',
      is_system: false,
      deleted_at: null,
    },
    {
      id: 'project-2',
      tenant_id: 'tenant-1',
      folder_id: 'folder-2',
      owner_id: 'user-1',
      name: 'Planning',
      visibility: 'department',
      status: 'active',
      is_system: false,
      deleted_at: null,
    },
    {
      id: 'project-archived-folder',
      tenant_id: 'tenant-1',
      folder_id: 'folder-archived',
      owner_id: 'user-1',
      name: 'Old project',
      visibility: 'department',
      status: 'active',
      is_system: false,
      deleted_at: null,
    },
  ],
  tasks: [
    {
      id: 'task-1',
      tenant_id: 'tenant-1',
      project_id: 'project-1',
      title: 'Keep this title',
      status: 'in_progress',
      priority: 'high',
      deleted_at: null,
    },
  ],
  task_folder_links: [
    {
      tenant_id: 'tenant-1',
      task_id: 'task-1',
      folder_id: 'folder-1',
      is_home: true,
    },
    {
      tenant_id: 'tenant-1',
      task_id: 'task-1',
      folder_id: 'folder-tag',
      is_home: false,
    },
  ],
  activity_logs: [],
});

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private selected: string[] = [];
  private joins: Array<{ table: string; alias?: string }> = [];
  private orders: Array<{ column: string; direction: string }> = [];
  private operation:
    | { kind: 'select' }
    | {
        kind: 'insert';
        values: Row | Row[];
        ignoreConflict: boolean;
        mergeConflict?: Row;
      }
    | { kind: 'update'; values: Row }
    | { kind: 'delete' } = { kind: 'select' };

  constructor(
    private readonly database: FakeDatabase,
    private readonly table: string,
  ) {}

  where(columnOrValues: string | Row | ((query: FakeQuery) => void), value?: unknown): this {
    if (typeof columnOrValues === 'function') {
      // Visibility callbacks are bypassed by the admin test context.
      columnOrValues(this);
      return this;
    }
    if (typeof columnOrValues === 'object') {
      for (const [column, expected] of Object.entries(columnOrValues)) {
        this.filters.push((row) => this.value(row, column) === expected);
      }
      return this;
    }
    this.filters.push((row) => this.value(row, columnOrValues) === value);
    return this;
  }

  andWhere(columnOrValues: string | Row, value?: unknown): this {
    return this.where(columnOrValues, value);
  }

  whereNull(column: string): this {
    this.filters.push((row) => this.value(row, column) == null);
    return this;
  }

  whereIn(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(this.value(row, column)));
    return this;
  }

  join(table: string, _left: string, _right: string): this {
    this.joins.push({ table });
    return this;
  }

  leftJoin(tableOrAlias: string | Row, ..._args: unknown[]): this {
    if (typeof tableOrAlias === 'string') {
      this.joins.push({ table: tableOrAlias });
    } else {
      const [alias, table] = Object.entries(tableOrAlias)[0]!;
      this.joins.push({ table, alias });
    }
    return this;
  }

  select(...columns: string[]): this {
    this.selected.push(...columns);
    return this;
  }

  orderBy(column: string, direction = 'asc'): this {
    this.orders.push({ column, direction });
    return this;
  }

  insert(values: Row | Row[]): this {
    this.operation = { kind: 'insert', values, ignoreConflict: false };
    return this;
  }

  onConflict(..._columns: unknown[]): this {
    return this;
  }

  ignore(): this {
    if (this.operation.kind === 'insert') this.operation.ignoreConflict = true;
    return this;
  }

  merge(values: Row): this {
    if (this.operation.kind === 'insert') this.operation.mergeConflict = values;
    return this;
  }

  update(values: Row): this {
    this.operation = { kind: 'update', values };
    return this;
  }

  del(): this {
    this.operation = { kind: 'delete' };
    return this;
  }

  forUpdate(): this {
    this.database.taskRowWasLocked = true;
    this.database.taskLockQuery = this;
    return this;
  }

  async first(): Promise<Row | undefined> {
    if (this.database.taskLockQuery === this) {
      const staleHomeFolderId = this.joins.some((join) => join.table === 'task_folder_links')
        ? this.database.rows.task_folder_links.find(
            (link) => link.task_id === 'task-1' && link.is_home === true,
          )?.folder_id
        : undefined;
      await this.database.waitForTaskLock();
      const task = (await this.executeSelect())[0];
      if (task && staleHomeFolderId) task.folder_id = staleHomeFolderId;
      return task;
    }
    return (await this.executeSelect())[0];
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private value(row: Row, column: string): unknown {
    return row[column] ?? row[column.split('.').at(-1)!];
  }

  private async execute(): Promise<Row[]> {
    if (this.operation.kind === 'select') return this.executeSelect();
    const source = this.database.rows[this.table]!;
    if (this.operation.kind === 'insert') {
      if (this.table === 'activity_logs' && this.database.failActivityInsert) {
        this.database.failActivityInsert = false;
        throw new Error('activity insert failed');
      }
      const values = Array.isArray(this.operation.values)
        ? this.operation.values
        : [this.operation.values];
      for (const value of values) {
        if (
          this.table === 'projects' &&
          value.is_system === true &&
          this.database.raceSystemProjectInsert
        ) {
          this.database.raceSystemProjectInsert = false;
          source.push({
            ...value,
            id: 'project-created-by-other-request',
            name: 'General Tasks',
          });
          if (this.operation.ignoreConflict) continue;
          throw Object.assign(new Error('duplicate key value violates unique constraint'), {
            code: '23505',
          });
        }
        const duplicate = source.find((row) => this.isDuplicate(row, value));
        if (duplicate && this.operation.mergeConflict) {
          Object.assign(duplicate, this.operation.mergeConflict);
          continue;
        }
        if (duplicate && this.operation.ignoreConflict) continue;
        if (duplicate) throw Object.assign(new Error('duplicate key'), { code: '23505' });
        source.push(structuredClone(value));
      }
      return values;
    }
    const matches = source.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.operation.kind === 'update') {
      for (const row of matches) Object.assign(row, this.operation.values);
      return matches;
    }
    for (const row of matches) source.splice(source.indexOf(row), 1);
    return matches;
  }

  private isDuplicate(row: Row, value: Row): boolean {
    if (this.table === 'task_folder_links') {
      return row.task_id === value.task_id && row.folder_id === value.folder_id;
    }
    if (this.table === 'folders' && value.is_system_general) {
      return (
        row.tenant_id === value.tenant_id &&
        row.workspace_id === value.workspace_id &&
        row.is_system_general &&
        row.deleted_at == null
      );
    }
    if (this.table === 'projects' && value.is_system) {
      return (
        row.tenant_id === value.tenant_id &&
        row.folder_id === value.folder_id &&
        row.is_system &&
        row.deleted_at == null
      );
    }
    return value.id != null && row.id === value.id;
  }

  private async executeSelect(): Promise<Row[]> {
    if (this.table === 'task_folder_links') {
      this.database.queryEvents.push('home-link:read');
    }
    let rows = this.database.rows[this.table]!.map((row) => ({ ...row }));
    if (this.table === 'projects' && this.joins.some((join) => join.table === 'folders')) {
      rows = rows.flatMap((project) => {
        const folder = this.database.rows.folders!.find(
          (candidate) => candidate.id === project.folder_id,
        );
        if (!folder) return [];
        return [
          {
            ...project,
            resolved_folder_id: folder.id,
            folder_name: folder.name,
            department_id: folder.workspace_id,
            folder_deleted_at: folder.deleted_at,
            folder_is_archived: folder.is_archived,
            'folders.id': folder.id,
            'folders.name': folder.name,
            'folders.workspace_id': folder.workspace_id,
            'folders.deleted_at': folder.deleted_at,
            'folders.is_archived': folder.is_archived,
          },
        ];
      });
    }
    if (this.table === 'tasks' && this.joins.some((join) => join.table === 'task_folder_links')) {
      rows = rows.map((task) => ({
        ...task,
        folder_id: this.database.rows.task_folder_links!.find(
          (link) =>
            link.task_id === task.id && link.tenant_id === task.tenant_id && link.is_home === true,
        )?.folder_id,
      }));
    }
    rows = rows.filter((row) => this.filters.every((filter) => filter(row)));
    for (const { column, direction } of [...this.orders].reverse()) {
      rows.sort((left, right) => {
        const a = this.value(left, column);
        const b = this.value(right, column);
        const comparison = a === b ? 0 : a! < b! ? -1 : 1;
        return direction === 'desc' ? -comparison : comparison;
      });
    }
    if (this.selected.length === 0 || this.selected.some((column) => column.endsWith('.*'))) {
      return rows;
    }
    return rows.map((row) => {
      const projected: Row = {};
      for (const column of this.selected) {
        const aliasMatch = column.match(/^(.+)\s+as\s+(.+)$/i);
        if (aliasMatch) {
          projected[aliasMatch[2]!] = this.value(row, aliasMatch[1]!);
        } else {
          projected[column.split('.').at(-1)!] = this.value(row, column);
        }
      }
      return projected;
    });
  }
}

class FakeDatabase {
  rows = initialRows();
  failActivityInsert = false;
  raceSystemProjectInsert = false;
  taskRowWasLocked = false;
  taskLockQuery?: FakeQuery;
  queryEvents: string[] = [];
  private taskLockGate?: {
    started: Promise<void>;
    notifyStarted: () => void;
    released: Promise<void>;
    release: () => void;
  };

  readonly knex = Object.assign((table: string) => new FakeQuery(this, table), {
    transaction: async <T>(callback: (trx: FakeDatabase['knex']) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone(this.rows);
      try {
        return await callback(this.knex);
      } catch (error) {
        this.rows = snapshot;
        throw error;
      }
    },
  });

  failNextActivityInsert(): void {
    this.failActivityInsert = true;
  }

  failNextSystemProjectInsertWithUniqueViolation(): void {
    this.raceSystemProjectInsert = true;
  }

  blockNextTaskLock(): { started: Promise<void>; release: () => void } {
    let notifyStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.taskLockGate = { started, notifyStarted, released, release };
    return { started, release };
  }

  async waitForTaskLock(): Promise<void> {
    this.queryEvents.push('task-lock:waiting');
    if (this.taskLockGate) {
      this.taskLockGate.notifyStarted();
      await this.taskLockGate.released;
      this.taskLockGate = undefined;
    }
    this.queryEvents.push('task-lock:acquired');
  }
}

class FakeDepartmentAccess {
  createDenied = false;
  manageDenied = false;
  viewDenied = false;
  createExecutors: unknown[] = [];

  async assertCanCreateTask(_departmentId: string, executor?: unknown): Promise<'admin'> {
    this.createExecutors.push(executor);
    if (this.createDenied) throw new Error('Department access denied');
    return 'admin';
  }

  async assertCanManageTask(): Promise<'admin'> {
    if (this.manageDenied) throw new Error('Department access denied');
    return 'admin';
  }

  async assertCanViewDepartment(): Promise<'admin'> {
    if (this.viewDenied) throw new Error('Department access denied');
    return 'admin';
  }
}

describe('TaskLocationService', () => {
  let fakeDb: FakeDatabase;
  let departmentAccess: FakeDepartmentAccess;
  let service: TaskLocationService;
  const context = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    membershipId: 'membership-1',
    role: 'admin',
    permissions: ['*'],
  };

  beforeEach(() => {
    fakeDb = new FakeDatabase();
    departmentAccess = new FakeDepartmentAccess();
    const locationService = new TaskLocationService(fakeDb.knex as any, departmentAccess as any);
    service = new Proxy(locationService, {
      get(target, property, receiver) {
        const member = Reflect.get(target, property, receiver);
        if (typeof member !== 'function') return member;
        return (...args: unknown[]) => tenantContext.run(context, () => member.apply(target, args));
      },
    });
  });

  it('provisions General and a hidden system project for department-only creation', async () => {
    const result = await service.resolveForCreate({ departmentId: 'dept-1' }, fakeDb.knex as any);

    expect(result).toMatchObject({
      departmentId: 'dept-1',
      folderName: 'General',
      projectName: 'General Tasks',
      isSystemProject: true,
    });
    expect(fakeDb.rows.folders!.filter((row) => row.is_system_general)).toHaveLength(1);
    expect(fakeDb.rows.projects!.filter((row) => row.is_system)).toHaveLength(1);
    expect(departmentAccess.createExecutors).toEqual([fakeDb.knex]);
  });

  it('reuses the same system records on repeated requests', async () => {
    const first = await service.resolveForCreate({ departmentId: 'dept-1' }, fakeDb.knex as any);
    const second = await service.resolveForCreate({ departmentId: 'dept-1' }, fakeDb.knex as any);

    expect(second.folderId).toBe(first.folderId);
    expect(second.projectId).toBe(first.projectId);
    expect(fakeDb.rows.folders!.filter((row) => row.is_system_general)).toHaveLength(1);
    expect(fakeDb.rows.projects!.filter((row) => row.is_system)).toHaveLength(1);
  });

  it('rejects a destination in another department', async () => {
    await expect(
      service.resolveForMove('dept-1', { folderId: 'folder-dept-2' }, fakeDb.knex as any),
    ).rejects.toThrow('Destination must belong to the current department');
  });

  it('resolves a folder-only destination to that folders system project', async () => {
    const result = await service.resolveForCreate(
      { departmentId: 'dept-1', folderId: 'folder-1' },
      fakeDb.knex as any,
    );

    expect(result).toMatchObject({
      departmentId: 'dept-1',
      folderId: 'folder-1',
      isSystemProject: true,
    });
  });

  it('resolves a project-only destination and its containing folder', async () => {
    const result = await service.resolveForCreate({ projectId: 'project-1' }, fakeDb.knex as any);

    expect(result).toEqual({
      departmentId: 'dept-1',
      folderId: 'folder-1',
      folderName: 'Delivery',
      projectId: 'project-1',
      projectName: 'Website',
      isSystemProject: false,
    });
    expect(departmentAccess.createExecutors).toEqual([fakeDb.knex]);
  });

  it('rejects a folder and project that do not match', async () => {
    await expect(
      service.resolveForCreate(
        {
          departmentId: 'dept-1',
          folderId: 'folder-1',
          projectId: 'project-2',
        },
        fakeDb.knex as any,
      ),
    ).rejects.toThrow('Project does not belong to the selected folder');
  });

  it('treats archived folders and their projects as unavailable destinations', async () => {
    await expect(
      service.resolveForCreate(
        { departmentId: 'dept-1', folderId: 'folder-archived' },
        fakeDb.knex as any,
      ),
    ).rejects.toThrow('Folder not found');
    await expect(
      service.resolveForCreate({ projectId: 'project-archived-folder' }, fakeDb.knex as any),
    ).rejects.toThrow('Project not found');
  });

  it('recovers the winner after a concurrent provisioning conflict', async () => {
    fakeDb.failNextSystemProjectInsertWithUniqueViolation();

    const result = await service.resolveForCreate(
      { departmentId: 'dept-1', folderId: 'folder-1' },
      fakeDb.knex as any,
    );

    expect(result.projectId).toBe('project-created-by-other-request');
  });

  it('denies creation when department task creation permission is absent', async () => {
    departmentAccess.createDenied = true;

    await expect(
      service.resolveForCreate({ departmentId: 'dept-1' }, fakeDb.knex as any),
    ).rejects.toThrow('Department access denied');
    expect(fakeDb.rows.folders!.filter((row) => row.is_system_general)).toHaveLength(0);
  });

  it('moves only the canonical location and records the change in one transaction', async () => {
    await service.move('task-1', { projectId: 'project-2' });

    expect(fakeDb.taskRowWasLocked).toBe(true);
    expect(fakeDb.rows.tasks).toEqual([
      expect.objectContaining({
        id: 'task-1',
        project_id: 'project-2',
        title: 'Keep this title',
        status: 'in_progress',
        priority: 'high',
      }),
    ]);
    expect(fakeDb.rows.task_folder_links).toEqual(
      expect.arrayContaining([
        {
          tenant_id: 'tenant-1',
          task_id: 'task-1',
          folder_id: 'folder-2',
          is_home: true,
        },
        {
          tenant_id: 'tenant-1',
          task_id: 'task-1',
          folder_id: 'folder-tag',
          is_home: false,
        },
      ]),
    );
    expect(fakeDb.rows.task_folder_links).toHaveLength(2);
    expect(fakeDb.rows.activity_logs).toEqual([
      expect.objectContaining({
        tenant_id: 'tenant-1',
        actor_id: 'user-1',
        entity_type: 'task',
        entity_id: 'task-1',
        action: 'task:location:changed',
        changes: JSON.stringify({
          old: { folderId: 'folder-1', projectId: 'project-1' },
          new: { folderId: 'folder-2', projectId: 'project-2' },
        }),
      }),
    ]);
  });

  it('moves into an existing ordinary tag and preserves every other tag', async () => {
    fakeDb.rows.task_folder_links.push({
      tenant_id: 'tenant-1',
      task_id: 'task-1',
      folder_id: 'folder-2',
      is_home: false,
    });

    await service.move('task-1', { folderId: 'folder-tag' });

    expect(fakeDb.rows.task_folder_links).toEqual([
      {
        tenant_id: 'tenant-1',
        task_id: 'task-1',
        folder_id: 'folder-tag',
        is_home: true,
      },
      {
        tenant_id: 'tenant-1',
        task_id: 'task-1',
        folder_id: 'folder-2',
        is_home: false,
      },
    ]);
  });

  it('reads the canonical home after acquiring the task lock', async () => {
    const lock = fakeDb.blockNextTaskLock();
    const move = service.move('task-1', { projectId: 'project-1' });
    await lock.started;

    fakeDb.rows.tasks[0]!.project_id = 'project-2';
    fakeDb.rows.task_folder_links.find((link) => link.is_home)!.folder_id = 'folder-2';
    lock.release();
    await move;

    expect(fakeDb.queryEvents).toEqual([
      'task-lock:waiting',
      'task-lock:acquired',
      'home-link:read',
    ]);
    expect(JSON.parse(fakeDb.rows.activity_logs[0]!.changes).old).toEqual({
      folderId: 'folder-2',
      projectId: 'project-2',
    });
  });

  it('rolls back project, home link and audit changes when movement fails', async () => {
    fakeDb.failNextActivityInsert();

    await expect(service.move('task-1', { folderId: 'folder-2' })).rejects.toThrow(
      'activity insert failed',
    );

    expect(fakeDb.rows.tasks.find((task) => task.id === 'task-1')?.project_id).toBe('project-1');
    expect(
      fakeDb.rows.task_folder_links.find((link) => link.task_id === 'task-1' && link.is_home)
        ?.folder_id,
    ).toBe('folder-1');
    expect(fakeDb.rows.activity_logs).toHaveLength(0);
  });

  it('does not mutate task location when movement permission is absent', async () => {
    departmentAccess.manageDenied = true;

    await expect(service.move('task-1', { folderId: 'folder-2' })).rejects.toThrow(
      'Department access denied',
    );
    expect(fakeDb.rows.tasks[0]!.project_id).toBe('project-1');
    expect(fakeDb.rows.activity_logs).toHaveLength(0);
  });

  it('lists active folders with only normal active projects in the department', async () => {
    const result = await service.listDepartmentLocations('dept-1');

    expect(result).toEqual([
      {
        folderId: 'folder-1',
        folderName: 'Delivery',
        isGeneral: false,
        projects: [{ projectId: 'project-1', projectName: 'Website' }],
      },
      {
        folderId: 'folder-2',
        folderName: 'Operations',
        isGeneral: false,
        projects: [{ projectId: 'project-2', projectName: 'Planning' }],
      },
      {
        folderId: 'folder-tag',
        folderName: 'Reference',
        isGeneral: false,
        projects: [],
      },
    ]);
  });
});
