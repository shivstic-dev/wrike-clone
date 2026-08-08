/**
 * Task service unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from '../../src/task/task.service';
import { DATABASE_PROVIDER } from '../../src/database/database.module';
import { tenantContext } from '../../src/common/tenant-context';
import { DepartmentAccessService } from '../../src/rbac/department-access.service';
import { TaskLocationService } from '../../src/task/task-location.service';
import { TaskCompletionService } from '../../src/task/task-completion.service';
import { MemoryCacheService } from '../../src/common/cache/memory-cache.service';
import { TaskStatus } from '@wrike-clone/shared';
import knex, { type Knex } from 'knex';
import * as visibilityScope from '../../src/common/visibility.scope';

const noop = () => {};

function createQb(): any {
  const qb: any = {};
  const self = qb;
  const methods = [
    'from',
    'select',
    'where',
    'andWhere',
    'whereIn',
    'whereNull',
    'whereNot',
    'whereNotExists',
    'join',
    'leftJoin',
    'orderBy',
    'orderByRaw',
    'limit',
    'offset',
    'clearSelect',
    'insert',
    'update',
    'clone',
    'count',
    'modify',
    'groupBy',
    'forUpdate',
  ];
  for (const m of methods) qb[m] = jest.fn(() => self);
  qb.first = jest.fn();
  qb.del = jest.fn();
  qb.returning = jest.fn();
  qb.raw = jest.fn();
  qb.transaction = jest.fn((cb: (q: any) => any) => cb(qb));
  return qb;
}

describe('TaskService', () => {
  let service: TaskService;
  let qb: any;
  let mockDb: jest.Mock;
  const departmentAccess = {
    isTenantAdmin: jest.fn().mockResolvedValue(true),
    assertCanCreateTask: jest.fn().mockResolvedValue('admin'),
    assertCanManageTask: jest.fn().mockResolvedValue('admin'),
    assertCanSetVisibility: jest.fn().mockResolvedValue('admin'),
    assertCanChangeStatus: jest.fn().mockResolvedValue(undefined),
    assertCanAssignTo: jest.fn().mockResolvedValue(undefined),
    assertCanViewGroupedTasks: jest.fn().mockResolvedValue('department_head'),
  };
  const taskLocations = {
    resolveForCreate: jest.fn(),
    writeHomeLink: jest.fn(),
    move: jest.fn(),
  };
  const taskCompletion = { reopenInTransaction: jest.fn() };

  beforeEach(async () => {
    qb = createQb();
    mockDb = jest.fn().mockReturnValue(qb);
    (mockDb as any).raw = jest.fn(() => qb);
    (mockDb as any).transaction = jest.fn((cb: (q: any) => any) => cb(mockDb));
    qb.first.mockResolvedValue(null);
    qb.returning.mockResolvedValue([{}]);
    qb.del.mockResolvedValue(1);
    taskLocations.resolveForCreate.mockResolvedValue({
      departmentId: 'dept-1',
      folderId: 'folder-1',
      folderName: 'Folder',
      projectId: 'proj-1',
      projectName: 'Project',
      isSystemProject: false,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        MemoryCacheService,
        { provide: DATABASE_PROVIDER, useValue: mockDb },
        { provide: DepartmentAccessService, useValue: departmentAccess },
        { provide: TaskLocationService, useValue: taskLocations },
        { provide: TaskCompletionService, useValue: taskCompletion },
      ],
    }).compile();

    service = module.get<TaskService>(TaskService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('does not share access-scoped cached results between viewers in the same tenant', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'manager-membership',
        role: 'member',
        permissions: ['task:read'],
      });
      departmentAccess.isTenantAdmin.mockResolvedValue(false);
      qb.first.mockResolvedValueOnce({ count: '1' });
      qb.offset.mockResolvedValueOnce([{ id: 'manager-task', title: 'Manager task' }]);

      const managerResult = await service.findAll({ page: 1, perPage: 25 });

      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'employee-1',
        membershipId: 'employee-membership',
        role: 'member',
        permissions: ['task:read'],
      });
      qb.first.mockResolvedValueOnce({ count: '1' });
      qb.offset.mockResolvedValueOnce([{ id: 'employee-task', title: 'Employee task' }]);

      const employeeResult = await service.findAll({ page: 1, perPage: 25 });

      expect(managerResult.data).toEqual([expect.objectContaining({ id: 'manager-task' })]);
      expect(employeeResult.data).toEqual([expect.objectContaining({ id: 'employee-task' })]);
      expect(departmentAccess.isTenantAdmin).toHaveBeenCalledTimes(2);
    });

    it('applies the same task access scope to rows and pagination totals', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'manager',
        permissions: ['task:read'],
      });
      departmentAccess.isTenantAdmin.mockResolvedValueOnce(false);
      qb.first.mockResolvedValueOnce({ count: '0' });
      qb.offset.mockResolvedValue([]);
      const accessScope = jest.spyOn(visibilityScope, 'applyTaskAccessScope');

      await service.findAll({ page: 1, perPage: 25 });

      expect(accessScope).toHaveBeenCalledTimes(2);
      expect(accessScope.mock.calls[0]?.[1]).toMatchObject({
        tenantId: 't1',
        userId: 'manager-1',
      });
      expect(accessScope.mock.calls[1]?.[1]).toEqual(accessScope.mock.calls[0]?.[1]);
    });

    it('returns paginated tasks', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValueOnce({ count: '42' });
      qb.offset.mockResolvedValue([
        { id: 'task-1', title: 'Task 1' },
        { id: 'task-2', title: 'Task 2' },
      ]);

      const result = await service.findAll({ page: 1, perPage: 25 });
      expect(result.meta.total).toBe(42);
      expect(result.data).toHaveLength(2);
      expect(qb.where).toHaveBeenCalledWith('tasks.tenant_id', 't1');
    });

    it('applies project filter', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValueOnce({ count: '5' });
      qb.offset.mockResolvedValue([]);

      await service.findAll({ page: 1, perPage: 25, projectId: 'proj-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('tasks.project_id', 'proj-1');
    });

    it('handles empty results', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValueOnce({ count: '0' });
      qb.offset.mockResolvedValue([]);

      const result = await service.findAll({ page: 1, perPage: 25 });
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('filters ready-for-handoff tasks inside the current tenant query', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValueOnce({ count: '0' });
      qb.offset.mockResolvedValue([]);

      await service.findAll({ page: 1, perPage: 25, handoffStatus: 'ready' as any });

      expect(qb.where).toHaveBeenCalledWith('tasks.tenant_id', 't1');
      expect(qb.andWhere).toHaveBeenCalledWith('tasks.handoff_status', 'ready');
    });

    it('hydrates canonical home and project metadata and filters only the home folder', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValueOnce({ count: '0' });
      qb.offset.mockResolvedValue([]);

      await service.findAll({ page: 1, perPage: 25, folderId: 'folder-home' });

      expectCanonicalLocationJoin(qb);
      expectTenantSafeHandoffOwnerJoin(qb);
      expect(qb.andWhere).toHaveBeenCalledWith('home_link.folder_id', 'folder-home');
      expect(qb.select).toHaveBeenCalled();
    });

    it('compiles handoff-owner and metadata fields into the list projection', async () => {
      const database = knex({ client: 'pg' });
      const projectionBuilder = (
        TaskService as unknown as {
          buildListProjection(db: Knex): Array<string | Knex.Raw>;
        }
      ).buildListProjection;

      try {
        const sql = database('tasks')
          .select(...projectionBuilder(database))
          .toSQL()
          .sql.replace(/\s+/gu, ' ')
          .toLowerCase();

        expect(sql).toContain('"workspaces"."name" as "department_name"');
        expect(sql).toContain('"home_folder"."id" as "folder_id"');
        expect(sql).toContain('"task_project"."name" as "project_name"');
        expect(sql).toContain("json_build_object('id', handoff_owner.id");
        expect(sql).toContain('as handoff_owner');
        expect(sql).toContain('as assignee');
      } finally {
        await database.destroy();
      }
    });
  });

  describe('findById', () => {
    it('returns task with related data', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({ id: 'task-1', title: 'Test Task', tenant_id: 't1' });
      (qb.orderBy as jest.Mock).mockReturnValue(qb);
      qb._data = [{ id: 'c1', content: 'Nice work' }];
      // Make awaiting the query builder resolve to _data
      qb.then = (resolve: any) => resolve(qb._data);
      qb.catch = noop;

      const result = await service.findById('task-1');
      expect(result.id).toBe('task-1');
      expect(result.title).toBe('Test Task');
    });

    it('throws when task does not exist', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue(null);
      await expect(service.findById('nonexistent')).rejects.toThrow('Task not found');
    });

    it('hydrates canonical home and project metadata for a visible task', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({ id: 'task-1', tenant_id: 't1' });
      qb.then = (resolve: any) => resolve([]);
      qb.catch = noop;

      await service.findById('task-1');

      expectCanonicalLocationJoin(qb);
      expectTenantSafeHandoffOwnerJoin(qb);
      expect(qb.select).toHaveBeenCalledWith(
        'tasks.*',
        'workspaces.name as department_name',
        'home_folder.id as folder_id',
        'home_folder.name as folder_name',
        'task_project.name as project_name',
        'task_project.is_system as is_system_project',
        expect.anything(),
      );
    });
  });

  describe('create', () => {
    it('creates a task pending handoff with its creator as owner by default', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.returning.mockResolvedValue([{ id: 'task-new', title: 'Internal check', status: 'todo' }]);

      await service.create({ projectId: 'proj-1', title: 'Internal check' });

      expect(qb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          handoff_required: true,
          handoff_status: 'pending',
          handoff_owner_id: 'u1',
        }),
      );
    });

    it('allows an explicitly not-required task to start completed', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.returning.mockResolvedValue([
        { id: 'task-new', title: 'Internal check', status: 'completed' },
      ]);

      await expect(
        service.create({
          projectId: 'proj-1',
          title: 'Internal check',
          handoffRequired: false,
          status: TaskStatus.COMPLETED,
        }),
      ).resolves.toMatchObject({ status: 'completed' });

      expect(qb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          handoff_required: false,
          handoff_status: 'not_required',
          completed_at: expect.any(Date),
        }),
      );
    });

    it('keeps the creator as handoff owner when self-assigning during creation', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({ user_id: 'u1' });
      qb.returning.mockResolvedValue([
        { id: 'task-new', title: 'Internal check', assignee_id: 'u1' },
      ]);

      await service.create({ projectId: 'proj-1', title: 'Internal check', assigneeId: 'u1' });

      expect(qb.insert).toHaveBeenCalledWith(expect.objectContaining({ handoff_owner_id: 'u1' }));
    });
    it('keeps project-only creation routed through canonical location resolution', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.returning.mockResolvedValue([{ id: 'task-new', title: 'New Task', status: 'todo' }]);

      const input = {
        projectId: 'proj-1',
        title: 'New Task',
        visibility: 'department',
      } as const;
      const result = await service.create(input);

      expect(taskLocations.resolveForCreate).toHaveBeenCalledWith(input, mockDb);
      expect(taskLocations.writeHomeLink).toHaveBeenCalledWith(
        expect.any(String),
        'folder-1',
        mockDb,
      );
      expect(result).toMatchObject({
        id: 'task-new',
        folderId: 'folder-1',
        projectId: 'proj-1',
      });
    });

    it('creates a department-only quick task using the resolved system project', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      taskLocations.resolveForCreate.mockResolvedValue({
        departmentId: 'dept-1',
        folderId: 'folder-general',
        folderName: 'General',
        projectId: 'project-general',
        projectName: 'General Tasks',
        isSystemProject: true,
      });
      qb.returning.mockResolvedValue([{ id: 'task-quick', title: 'Quick task', status: 'todo' }]);

      const result = await service.create({
        departmentId: 'dept-1',
        title: 'Quick task',
      });

      expect(taskLocations.writeHomeLink).toHaveBeenCalledWith(
        expect.any(String),
        'folder-general',
        mockDb,
      );
      expect(result).toMatchObject({
        id: 'task-quick',
        folderId: 'folder-general',
        folderName: 'General',
        projectId: 'project-general',
        projectName: 'General Tasks',
        isSystemProject: true,
      });
    });

    it('validates visibility and assignees against the resolved department', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      taskLocations.resolveForCreate.mockResolvedValue({
        departmentId: 'resolved-dept',
        folderId: 'folder-1',
        folderName: 'Folder',
        projectId: 'proj-1',
        projectName: 'Project',
        isSystemProject: false,
      });
      qb.first.mockResolvedValue({ user_id: 'assignee-1' });
      qb.returning.mockResolvedValue([
        { id: 'task-new', title: 'New Task', assignee_id: 'assignee-1' },
      ]);

      await service.create({
        projectId: 'proj-1',
        title: 'New Task',
        visibility: 'global',
        assigneeIds: ['assignee-1'],
      });

      expect(departmentAccess.assertCanSetVisibility).toHaveBeenCalledWith('resolved-dept', mockDb);
      expect(departmentAccess.assertCanAssignTo).toHaveBeenCalledWith(
        'resolved-dept',
        'assignee-1',
        mockDb,
      );
    });
  });

  describe('update', () => {
    it('locks and re-reads the task before authorizing a single update in the same transaction', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      const locked = {
        id: 'task-1',
        tenant_id: 't1',
        department_id: 'dept-after-lock',
        title: 'Old',
        status: TaskStatus.TODO,
        assignee_id: 'u1',
      };
      qb.first.mockResolvedValueOnce(locked);
      qb.returning.mockResolvedValueOnce([{ ...locked, title: 'New' }]);
      qb.then = (resolve: any) => resolve([]);
      qb.catch = noop;

      await service.update('task-1', { title: 'New' });

      expect(qb.forUpdate).toHaveBeenCalledWith('tasks');
      expect(departmentAccess.assertCanManageTask).toHaveBeenCalledWith(
        'dept-after-lock',
        'task-1',
        mockDb,
      );
      expect(qb.forUpdate.mock.invocationCallOrder[0]).toBeLessThan(
        departmentAccess.assertCanManageTask.mock.invocationCallOrder[0]!,
      );
    });

    it('rejects generic completion until final handoff is confirmed', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({ id: 'task-1', status: TaskStatus.IN_PROGRESS, tenant_id: 't1' });

      await expect(
        service.update('task-1', { status: TaskStatus.COMPLETED }),
      ).rejects.toMatchObject({
        response: { code: 'HANDOFF_CONFIRMATION_REQUIRED' },
      });
    });

    it('records the current actor as owner when assignments change', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.TODO,
        title: 'Old',
        tenant_id: 't1',
        department_id: 'dept-1',
        assignee_id: 'u1',
      });
      qb.then = (resolve: any) => resolve([{ user_id: 'u1' }]);
      qb.catch = noop;
      qb.returning.mockResolvedValue([{ id: 'task-1', assignee_id: 'u2' }]);

      await service.update('task-1', { assigneeIds: ['u2'] });

      expect(qb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          assignee_id: 'u2',
          handoff_owner_id: 'manager-1',
        }),
      );
    });

    it('does not change the owner for a no-op assignment', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.TODO,
        title: 'Same',
        tenant_id: 't1',
        department_id: 'dept-1',
        assignee_id: 'u1',
      });
      qb.then = (resolve: any) => resolve([{ user_id: 'u1' }]);
      qb.catch = noop;

      await service.update('task-1', { assigneeIds: ['u1'] });

      expect(qb.update).not.toHaveBeenCalled();
    });

    it('resets handoff state when handoff is disabled', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({
        id: 'task-1',
        tenant_id: 't1',
        department_id: 'dept-1',
        status: TaskStatus.COMPLETED,
        handoff_required: true,
        handoff_status: 'ready',
        handoff_ready_at: new Date(),
        handoff_confirmed_by: 'u2',
        handoff_confirmed_at: new Date(),
      });
      qb.returning.mockResolvedValue([
        { id: 'task-1', handoff_required: false, handoff_status: 'not_required' },
      ]);

      await service.update('task-1', { handoffRequired: false });

      expect(qb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          handoff_required: false,
          handoff_status: 'not_required',
          handoff_ready_at: null,
          handoff_confirmed_by: null,
          handoff_confirmed_at: null,
        }),
      );
    });

    it('resets handoff state to pending when handoff is enabled', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({
        id: 'task-1',
        tenant_id: 't1',
        department_id: 'dept-1',
        status: TaskStatus.IN_PROGRESS,
        handoff_required: false,
        handoff_status: 'not_required',
      });
      qb.returning.mockResolvedValue([
        { id: 'task-1', handoff_required: true, handoff_status: 'pending' },
      ]);

      await service.update('task-1', { handoffRequired: true });

      expect(qb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          handoff_required: true,
          handoff_status: 'pending',
          handoff_ready_at: null,
          handoff_confirmed_by: null,
          handoff_confirmed_at: null,
        }),
      );
    });

    it('rejects enabling handoff on a task that remains completed', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({
        id: 'task-1',
        tenant_id: 't1',
        department_id: 'dept-1',
        status: TaskStatus.COMPLETED,
        handoff_required: false,
        handoff_status: 'not_required',
      });

      await expect(service.update('task-1', { handoffRequired: true })).rejects.toMatchObject({
        response: { code: 'HANDOFF_CONFIRMATION_REQUIRED' },
      });
      expect(qb.update).not.toHaveBeenCalled();
    });

    it('keeps other PATCH fields while reopening clears handoff confirmation', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      const completed = {
        id: 'task-1',
        title: 'Original',
        status: TaskStatus.COMPLETED,
        tenant_id: 't1',
        department_id: 'dept-1',
        assignee_id: 'u1',
        handoff_required: true,
      };
      qb.first.mockResolvedValue(completed);
      taskCompletion.reopenInTransaction.mockResolvedValue({
        ...completed,
        status: TaskStatus.IN_PROGRESS,
        handoff_status: 'pending',
        handoff_confirmed_by: null,
        handoff_confirmed_at: null,
      });
      qb.returning.mockResolvedValue([
        {
          ...completed,
          title: 'Revised',
          status: TaskStatus.IN_PROGRESS,
          handoff_status: 'pending',
          handoff_confirmed_by: null,
          handoff_confirmed_at: null,
        },
      ]);
      qb.then = (resolve: any) => resolve([]);
      qb.catch = noop;

      const result = await service.update('task-1', {
        status: TaskStatus.IN_PROGRESS,
        title: 'Revised',
      });

      expect(taskCompletion.reopenInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        completed,
        TaskStatus.IN_PROGRESS,
      );
      expect(qb.update).toHaveBeenCalledWith(expect.objectContaining({ title: 'Revised' }));
      expect(result).toMatchObject({
        title: 'Revised',
        status: TaskStatus.IN_PROGRESS,
        handoff_status: 'pending',
        handoff_confirmed_by: null,
        handoff_confirmed_at: null,
      });
    });
    it('updates task with valid changes', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Old',
        status: 'todo',
        priority: 'medium',
        tenant_id: 't1',
      });
      qb.returning.mockResolvedValue([{ id: 'task-1', title: 'New Title' }]);

      const result = await service.update('task-1', { title: 'New Title' });
      expect(result.title).toBe('New Title');
    });

    it('no-ops when nothing changed', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({ id: 'task-1', title: 'Same', tenant_id: 't1' });

      const result = await service.update('task-1', { title: 'Same' });
      expect(qb.update).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdate', () => {
    it('enables handoff and clears stale confirmation state for every locked task', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      const existing = {
        id: 'task-1',
        tenant_id: 't1',
        department_id: 'dept-1',
        status: TaskStatus.IN_PROGRESS,
        handoff_required: false,
        handoff_status: 'not_required',
        handoff_ready_at: new Date(),
        handoff_confirmed_by: 'u1',
        handoff_confirmed_at: new Date(),
      };
      qb.then = (resolve: any) => resolve([existing]);
      qb.catch = noop;
      qb.returning.mockResolvedValue([
        { ...existing, handoff_required: true, handoff_status: 'pending' },
      ]);

      await service.bulkUpdate({ taskIds: ['task-1'], updates: { handoffRequired: true } });

      expect(qb.forUpdate).toHaveBeenCalled();
      expect(departmentAccess.assertCanManageTask).toHaveBeenCalledWith('dept-1', 'task-1', mockDb);
      expect(qb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          handoff_required: true,
          handoff_status: 'pending',
          handoff_ready_at: null,
          handoff_confirmed_by: null,
          handoff_confirmed_at: null,
        }),
      );
    });

    it('disables handoff and clears stale confirmation state for every locked task', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      const existing = {
        id: 'task-1',
        tenant_id: 't1',
        department_id: 'dept-1',
        status: TaskStatus.COMPLETED,
        handoff_required: true,
        handoff_status: 'confirmed',
        handoff_ready_at: new Date(),
        handoff_confirmed_by: 'u1',
        handoff_confirmed_at: new Date(),
      };
      qb.then = (resolve: any) => resolve([existing]);
      qb.catch = noop;
      qb.returning.mockResolvedValue([
        { ...existing, handoff_required: false, handoff_status: 'not_required' },
      ]);

      await service.bulkUpdate({ taskIds: ['task-1'], updates: { handoffRequired: false } });

      expect(qb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          handoff_required: false,
          handoff_status: 'not_required',
          handoff_ready_at: null,
          handoff_confirmed_by: null,
          handoff_confirmed_at: null,
        }),
      );
    });

    it('rejects enabling handoff on a locked task that remains completed', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.then = (resolve: any) =>
        resolve([
          {
            id: 'task-1',
            tenant_id: 't1',
            department_id: 'dept-1',
            status: TaskStatus.COMPLETED,
            handoff_required: false,
            handoff_status: 'not_required',
          },
        ]);
      qb.catch = noop;

      await expect(
        service.bulkUpdate({
          taskIds: ['task-1'],
          updates: { handoffRequired: true },
        }),
      ).rejects.toMatchObject({ response: { code: 'HANDOFF_CONFIRMATION_REQUIRED' } });
      expect(qb.forUpdate).toHaveBeenCalled();
      expect(qb.update).not.toHaveBeenCalled();
    });

    it('rejects generic bulk completion until final handoff is confirmed', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });

      await expect(
        service.bulkUpdate({ taskIds: ['task-1'], updates: { status: TaskStatus.COMPLETED } }),
      ).rejects.toMatchObject({
        response: { code: 'HANDOFF_CONFIRMATION_REQUIRED' },
      });
    });

    it('keeps the handoff owner when bulk assignment only removes people', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb._data = [
        {
          id: 'task-1',
          title: 'A',
          status: TaskStatus.TODO,
          tenant_id: 't1',
          department_id: 'dept-1',
          assignee_id: 'u1',
        },
      ];
      qb.then = (resolve: any) => resolve(qb._data);
      qb.catch = noop;
      qb.returning.mockResolvedValue([{ id: 'task-1', assignee_id: null }]);

      await service.bulkUpdate({ taskIds: ['task-1'], updates: { assigneeIds: [] } });

      expect(
        qb.update.mock.calls.some(
          ([updates]: [Record<string, unknown>]) => 'handoff_owner_id' in updates,
        ),
      ).toBe(false);
    });

    it('does not rewrite or log a bulk assignment when every target already has it', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      const existingTask = {
        id: 'task-1',
        title: 'A',
        status: TaskStatus.TODO,
        tenant_id: 't1',
        department_id: 'dept-1',
        assignee_id: 'u1',
      };
      const taskQb = createQb();
      taskQb.then = (resolve: any) => resolve([existingTask]);
      taskQb.catch = noop;
      taskQb.returning.mockResolvedValue([existingTask]);
      const assigneeQb = createQb();
      assigneeQb.then = (resolve: any) =>
        resolve([{ task_id: 'task-1', user_id: 'u1', is_primary: true }]);
      assigneeQb.catch = noop;
      const activityQb = createQb();
      const memberQb = createQb();
      memberQb.first.mockResolvedValue({ user_id: 'u1' });
      mockDb.mockImplementation((table: string) => {
        if (table === 'tasks') return taskQb;
        if (table === 'task_assignees') return assigneeQb;
        if (table === 'activity_logs') return activityQb;
        if (table === 'workspace_members') return memberQb;
        return createQb();
      });

      const result = await service.bulkUpdate({
        taskIds: ['task-1'],
        updates: { assigneeIds: ['u1'] },
      });

      expect(result).toEqual([existingTask]);
      expect(taskQb.update).not.toHaveBeenCalled();
      expect(assigneeQb.del).not.toHaveBeenCalled();
      expect(assigneeQb.insert).not.toHaveBeenCalled();
      expect(activityQb.insert).not.toHaveBeenCalled();
    });

    it('checks visibility and mutation authorization before returning an assignment no-op', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'manager',
        permissions: ['task:write'],
      });
      const existingTask = {
        id: 'task-peer',
        tenant_id: 't1',
        department_id: 'dept-1',
        assignee_id: 'manager-2',
      };
      const taskQb = createQb();
      taskQb.then = (resolve: any) => resolve([existingTask]);
      taskQb.catch = noop;
      const assigneeQb = createQb();
      assigneeQb.then = (resolve: any) => resolve([{ task_id: 'task-peer', user_id: 'manager-2' }]);
      assigneeQb.catch = noop;
      mockDb.mockImplementation((table: string) =>
        table === 'tasks' ? taskQb : table === 'task_assignees' ? assigneeQb : createQb(),
      );
      const accessScope = jest.spyOn(visibilityScope, 'applyTaskAccessScope');
      departmentAccess.assertCanManageTask.mockRejectedValueOnce(new Error('peer task denied'));

      await expect(
        service.bulkUpdate({
          taskIds: ['task-peer'],
          updates: { assigneeIds: ['manager-2'] },
        }),
      ).rejects.toThrow('peer task denied');

      expect(accessScope).toHaveBeenCalledWith(
        taskQb,
        expect.objectContaining({ userId: 'manager-1' }),
      );
      expect(departmentAccess.assertCanManageTask).toHaveBeenCalledWith(
        'dept-1',
        'task-peer',
        mockDb,
      );
      expect(taskQb.update).not.toHaveBeenCalled();
    });

    it('treats assignee ordering as an assignment no-op after authorization', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      const existingTask = {
        id: 'task-1',
        tenant_id: 't1',
        department_id: 'dept-1',
        assignee_id: 'u1',
      };
      const taskQb = createQb();
      taskQb.then = (resolve: any) => resolve([existingTask]);
      taskQb.catch = noop;
      const assigneeQb = createQb();
      assigneeQb.then = (resolve: any) =>
        resolve([
          { task_id: 'task-1', user_id: 'u2' },
          { task_id: 'task-1', user_id: 'u1' },
        ]);
      assigneeQb.catch = noop;
      const memberQb = createQb();
      memberQb.first.mockResolvedValue({ user_id: 'member' });
      mockDb.mockImplementation((table: string) =>
        table === 'tasks'
          ? taskQb
          : table === 'task_assignees'
            ? assigneeQb
            : table === 'workspace_members'
              ? memberQb
              : createQb(),
      );

      const result = await service.bulkUpdate({
        taskIds: ['task-1'],
        updates: { assigneeIds: ['u1', 'u2'] },
      });

      expect(result).toEqual([existingTask]);
      expect(departmentAccess.assertCanManageTask).toHaveBeenCalledWith('dept-1', 'task-1', mockDb);
      expect(taskQb.update).not.toHaveBeenCalled();
      expect(assigneeQb.del).not.toHaveBeenCalled();
    });

    it('resets handoff state when completed tasks are reopened in bulk', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      const completed = {
        id: 'task-1',
        tenant_id: 't1',
        department_id: 'dept-1',
        assignee_id: 'u1',
        status: TaskStatus.COMPLETED,
        handoff_required: true,
        handoff_status: 'confirmed',
        handoff_ready_at: new Date(),
        handoff_confirmed_by: 'u1',
        handoff_confirmed_at: new Date(),
      };
      qb._data = [completed];
      qb.then = (resolve: any) => resolve(qb._data);
      qb.catch = noop;
      qb.returning.mockResolvedValue([{ ...completed, status: TaskStatus.IN_PROGRESS }]);
      taskCompletion.reopenInTransaction.mockResolvedValue({
        ...completed,
        status: TaskStatus.IN_PROGRESS,
        handoff_status: 'pending',
        handoff_ready_at: null,
        handoff_confirmed_by: null,
        handoff_confirmed_at: null,
      });

      await service.bulkUpdate({
        taskIds: ['task-1'],
        updates: { status: TaskStatus.IN_PROGRESS },
      });

      expect(taskCompletion.reopenInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        completed,
        TaskStatus.IN_PROGRESS,
      );
    });

    it('updates multiple tasks', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb._data = [
        {
          id: 'task-1',
          title: 'A',
          status: 'todo',
          tenant_id: 't1',
          department_id: 'dept-1',
          assignee_id: 'u1',
        },
        {
          id: 'task-2',
          title: 'B',
          status: 'todo',
          tenant_id: 't1',
          department_id: 'dept-1',
          assignee_id: 'u1',
        },
      ];
      qb.then = (resolve: any) => resolve(qb._data);
      qb.catch = noop;
      qb.returning.mockResolvedValueOnce([
        { id: 'task-1', status: 'in_progress' },
        { id: 'task-2', status: 'in_progress' },
      ]);

      const results = await service.bulkUpdate({
        taskIds: ['task-1', 'task-2'],
        updates: { status: 'in_progress' as any },
      });
      expect(results).toHaveLength(2);
    });
  });

  describe('addAssignee', () => {
    it('locks and re-reads the task before authorizing and changing assignments', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      const locked = {
        id: 'task-1',
        tenant_id: 't1',
        department_id: 'dept-after-lock',
        assignee_id: 'u1',
      };
      qb.first.mockResolvedValueOnce(locked).mockResolvedValueOnce({ user_id: 'u2' });
      qb.then = (resolve: any) => resolve([{ task_id: 'task-1', user_id: 'u1' }]);
      qb.catch = noop;
      jest.spyOn(service, 'findById').mockResolvedValue({ ...locked, assignees: [] } as any);

      await service.addAssignee('task-1', 'u2');

      expect(qb.forUpdate).toHaveBeenCalledWith('tasks');
      expect(departmentAccess.assertCanManageTask).toHaveBeenCalledWith(
        'dept-after-lock',
        'task-1',
        mockDb,
      );
      expect(qb.forUpdate.mock.invocationCallOrder[0]).toBeLessThan(
        departmentAccess.assertCanManageTask.mock.invocationCallOrder[0]!,
      );
    });

    it('returns the current task without rewriting or logging an existing assignment', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      const visibleTask = {
        id: 'task-1',
        title: 'A',
        status: TaskStatus.TODO,
        tenant_id: 't1',
        department_id: 'dept-1',
        assignee_id: 'u1',
      };
      const authoritativeTask = {
        ...visibleTask,
        assignees: [{ task_id: 'task-1', user_id: 'u1', assigned_by_id: 'original-manager' }],
      };
      qb.first.mockResolvedValueOnce(visibleTask).mockResolvedValueOnce({ user_id: 'u1' });
      qb.then = (resolve: any) => resolve(authoritativeTask.assignees);
      qb.catch = noop;
      const findById = jest.spyOn(service, 'findById').mockResolvedValue(authoritativeTask as any);

      try {
        const result = await service.addAssignee('task-1', 'u1');

        expect(result).toEqual(authoritativeTask);
        expect(qb.update).not.toHaveBeenCalled();
        expect(qb.del).not.toHaveBeenCalled();
        expect(qb.insert).not.toHaveBeenCalled();
      } finally {
        findById.mockRestore();
      }
    });
  });

  describe('removeAssignee', () => {
    it('locks and re-reads assignments before authorizing removal in the same transaction', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      const locked = {
        id: 'task-1',
        tenant_id: 't1',
        department_id: 'dept-after-lock',
        assignee_id: 'u1',
      };
      qb.first.mockResolvedValueOnce(locked);
      qb.then = (resolve: any) =>
        resolve([
          { task_id: 'task-1', user_id: 'u1' },
          { task_id: 'task-1', user_id: 'u2' },
        ]);
      qb.catch = noop;
      jest.spyOn(service, 'findById').mockResolvedValue({ ...locked, assignees: [] } as any);

      await service.removeAssignee('task-1', 'u2');

      expect(qb.forUpdate).toHaveBeenCalledWith('tasks');
      expect(departmentAccess.assertCanManageTask).toHaveBeenCalledWith(
        'dept-after-lock',
        'task-1',
        mockDb,
      );
      expect(departmentAccess.assertCanAssignTo).toHaveBeenCalledWith(
        'dept-after-lock',
        'u2',
        mockDb,
      );
    });
  });

  describe('findDepartmentTasksGrouped', () => {
    it('uses the shared task scope and an active non-admin non-head member audience', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'member',
        permissions: ['task:read'],
      });
      departmentAccess.assertCanViewGroupedTasks.mockResolvedValueOnce('manager');
      qb.then = (resolve: any) => resolve([]);
      qb.catch = noop;
      const accessScope = jest.spyOn(visibilityScope, 'applyTaskAccessScope');

      await service.findDepartmentTasksGrouped('dept-1');

      expect(accessScope).toHaveBeenCalledWith(
        qb,
        expect.objectContaining({
          tenantId: 't1',
          userId: 'manager-1',
          role: 'member',
        }),
      );
      expect(qb.andWhere).toHaveBeenCalledWith('tenant_memberships.is_active', true);
      expect(qb.whereNot).toHaveBeenCalledWith('tenant_memberships.role', 'admin');
      expect(qb.whereNotExists).toHaveBeenCalled();
    });

    it('keeps both employee and peer-manager groups in the effective audience', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'm1',
        role: 'member',
        permissions: ['task:read'],
      });
      departmentAccess.assertCanViewGroupedTasks.mockResolvedValueOnce('manager');
      const membersQb = createQb();
      membersQb.then = (resolve: any) =>
        resolve([
          { user_id: 'manager-1', display_name: 'Me', role: 'manager' },
          { user_id: 'manager-2', display_name: 'Peer', role: 'manager' },
          { user_id: 'employee-1', display_name: 'Employee', role: 'employee' },
        ]);
      membersQb.catch = noop;
      const tasksQb = createQb();
      tasksQb.then = (resolve: any) => resolve([]);
      tasksQb.catch = noop;
      mockDb.mockImplementation((table: string) =>
        table === 'workspace_members' ? membersQb : tasksQb,
      );

      const result = await service.findDepartmentTasksGrouped('dept-1');

      expect(result.managerGroups.map((group) => group.user.user_id)).toEqual([
        'manager-1',
        'manager-2',
      ]);
      expect(result.employeeGroups.map((group) => group.user.user_id)).toEqual(['employee-1']);
    });

    it('hydrates canonical home and project metadata for grouped tasks', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.then = (resolve: any) => resolve([]);
      qb.catch = noop;

      await service.findDepartmentTasksGrouped('dept-1');

      expectCanonicalLocationJoin(qb);
      expect(qb.select).toHaveBeenCalledWith(
        'tasks.*',
        'workspaces.name as department_name',
        'home_folder.id as folder_id',
        'home_folder.name as folder_name',
        'task_project.name as project_name',
        'task_project.is_system as is_system_project',
      );
    });
  });

  describe('moveLocation', () => {
    it('moves through the location service and returns the fully hydrated task', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({
        id: 'task-1',
        tenant_id: 't1',
        folder_id: 'folder-2',
        project_id: 'project-2',
      });
      qb.then = (resolve: any) => resolve([]);
      qb.catch = noop;

      const result = await service.moveLocation('task-1', { folderId: 'folder-2' });

      expect(taskLocations.move).toHaveBeenCalledWith('task-1', {
        folderId: 'folder-2',
      });
      expect(result).toMatchObject({
        id: 'task-1',
        folder_id: 'folder-2',
        project_id: 'project-2',
        assignees: [],
        comments: [],
        dependencies: [],
        attachments: [],
      });
    });
  });

  describe('remove', () => {
    it('soft-deletes a task', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue({ id: 'task-1', tenant_id: 't1' });

      await service.remove('task-1');
      expect(qb.update).toHaveBeenCalledWith({ deleted_at: expect.any(Date) });
    });

    it('throws when task missing', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue(null);
      await expect(service.remove('nope')).rejects.toThrow('Task not found');
    });
  });

  describe('getDashboardStats', () => {
    it('scopes aggregate counts and cache entries to the current viewer', async () => {
      const accessScope = jest.spyOn(visibilityScope, 'applyTaskAccessScope');
      qb.first
        .mockResolvedValueOnce({ count: '10' })
        .mockResolvedValueOnce({ count: '2' })
        .mockResolvedValueOnce({ count: '1' })
        .mockResolvedValueOnce({ count: '0' });

      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'manager-1',
        membershipId: 'manager-membership',
        role: 'manager',
        permissions: ['task:read'],
      });
      const managerStats = await service.getDashboardStats();

      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'employee-1',
        membershipId: 'employee-membership',
        role: 'employee',
        permissions: ['task:read'],
      });
      const employeeStats = await service.getDashboardStats();

      expect(managerStats.total).toBe(10);
      expect(employeeStats.total).toBe(1);
      expect(accessScope).toHaveBeenCalledTimes(2);
      expect(accessScope.mock.calls.map(([, context]) => context.userId)).toEqual([
        'manager-1',
        'employee-1',
      ]);
    });

    it('calculates aggregate total, status counts, and overdue count with 60s caching', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValueOnce({ count: '10' }).mockResolvedValueOnce({ count: '2' });
      qb.select.mockReturnValueOnce(qb);

      const stats1 = await service.getDashboardStats();
      expect(stats1).toEqual({
        total: 10,
        byStatus: {
          todo: 0,
          in_progress: 0,
          in_review: 0,
          completed: 0,
          cancelled: 0,
        },
        overdue: 2,
      });

      // Subsequent call should hit cache without calling db
      const stats2 = await service.getDashboardStats();
      expect(stats2).toEqual(stats1);
    });
  });
});

function expectCanonicalLocationJoin(qb: any) {
  const homeJoin = qb.leftJoin.mock.calls.find(
    ([table]: [Record<string, string>]) => table?.home_link === 'task_folder_links',
  );
  expect(homeJoin).toBeDefined();

  const joinClause: any = {
    on: jest.fn(),
    andOn: jest.fn(),
    andOnVal: jest.fn(),
  };
  joinClause.on.mockReturnValue(joinClause);
  joinClause.andOn.mockReturnValue(joinClause);
  joinClause.andOnVal.mockReturnValue(joinClause);
  homeJoin[1].call(joinClause);

  expect(joinClause.on).toHaveBeenCalledWith('home_link.task_id', '=', 'tasks.id');
  expect(joinClause.andOn).toHaveBeenCalledWith('home_link.tenant_id', '=', 'tasks.tenant_id');
  expect(joinClause.andOnVal).toHaveBeenCalledWith('home_link.is_home', '=', true);
  expect(qb.leftJoin).toHaveBeenCalledWith(
    { task_project: 'projects' },
    'task_project.id',
    'tasks.project_id',
  );
  expect(qb.leftJoin).toHaveBeenCalledWith(
    { home_folder: 'folders' },
    'home_folder.id',
    'home_link.folder_id',
  );
}

function expectTenantSafeHandoffOwnerJoin(qb: any) {
  const membershipJoin = qb.leftJoin.mock.calls.find(
    ([table]: [Record<string, string>]) => table?.handoff_owner_membership === 'tenant_memberships',
  );
  expect(membershipJoin).toBeDefined();

  const joinClause: any = {
    on: jest.fn(),
    andOn: jest.fn(),
  };
  joinClause.on.mockReturnValue(joinClause);
  joinClause.andOn.mockReturnValue(joinClause);
  membershipJoin[1].call(joinClause);

  expect(joinClause.on).toHaveBeenCalledWith(
    'handoff_owner_membership.tenant_id',
    '=',
    'tasks.tenant_id',
  );
  expect(joinClause.andOn).toHaveBeenCalledWith(
    'handoff_owner_membership.user_id',
    '=',
    'tasks.handoff_owner_id',
  );
  expect(qb.leftJoin).toHaveBeenCalledWith(
    { handoff_owner: 'users' },
    'handoff_owner.id',
    'handoff_owner_membership.user_id',
  );
}
