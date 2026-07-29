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
import { TaskStatus } from '@wrike-clone/shared';

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
      tenantContext.enterWith({ tenantId: 't1', userId: 'u1', membershipId: 'm1', role: 'admin', permissions: ['*'] });
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
      expect(qb.andWhere).toHaveBeenCalledWith('home_link.folder_id', 'folder-home');
      expect(qb.select).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'home_folder.id as folder_id',
        'home_folder.name as folder_name',
        'task_project.name as project_name',
        'task_project.is_system as is_system_project',
        expect.anything(),
        expect.anything(),
      );
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
      tenantContext.enterWith({ tenantId: 't1', userId: 'u1', membershipId: 'm1', role: 'admin', permissions: ['*'] });
      qb.returning.mockResolvedValue([{ id: 'task-new', title: 'Internal check', status: 'todo' }]);

      await service.create({ projectId: 'proj-1', title: 'Internal check' });

      expect(qb.insert).toHaveBeenCalledWith(expect.objectContaining({
        handoff_required: true,
        handoff_status: 'pending',
        handoff_owner_id: 'u1',
      }));
    });

    it('allows an explicitly not-required task to start completed', async () => {
      tenantContext.enterWith({ tenantId: 't1', userId: 'u1', membershipId: 'm1', role: 'admin', permissions: ['*'] });
      qb.returning.mockResolvedValue([{ id: 'task-new', title: 'Internal check', status: 'completed' }]);

      await expect(service.create({
        projectId: 'proj-1',
        title: 'Internal check',
        handoffRequired: false,
        status: TaskStatus.COMPLETED,
      })).resolves.toMatchObject({ status: 'completed' });

      expect(qb.insert).toHaveBeenCalledWith(expect.objectContaining({
        handoff_required: false,
        handoff_status: 'not_required',
        completed_at: expect.any(Date),
      }));
    });

    it('keeps the creator as handoff owner when self-assigning during creation', async () => {
      tenantContext.enterWith({ tenantId: 't1', userId: 'u1', membershipId: 'm1', role: 'admin', permissions: ['*'] });
      qb.first.mockResolvedValue({ user_id: 'u1' });
      qb.returning.mockResolvedValue([{ id: 'task-new', title: 'Internal check', assignee_id: 'u1' }]);

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
      qb.returning.mockResolvedValue([
        { id: 'task-quick', title: 'Quick task', status: 'todo' },
      ]);

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

      expect(departmentAccess.assertCanSetVisibility).toHaveBeenCalledWith('resolved-dept');
      expect(departmentAccess.assertCanAssignTo).toHaveBeenCalledWith(
        'resolved-dept',
        'assignee-1',
      );
    });
  });

  describe('update', () => {
    it('rejects generic completion until final handoff is confirmed', async () => {
      tenantContext.enterWith({ tenantId: 't1', userId: 'u1', membershipId: 'm1', role: 'admin', permissions: ['*'] });
      qb.first.mockResolvedValue({ id: 'task-1', status: TaskStatus.IN_PROGRESS, tenant_id: 't1' });

      await expect(service.update('task-1', { status: TaskStatus.COMPLETED })).rejects.toMatchObject({
        response: { code: 'HANDOFF_CONFIRMATION_REQUIRED' },
      });
    });

    it('records the current actor as owner when assignments change', async () => {
      tenantContext.enterWith({ tenantId: 't1', userId: 'manager-1', membershipId: 'm1', role: 'admin', permissions: ['*'] });
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

      expect(qb.update).toHaveBeenCalledWith(expect.objectContaining({
        assignee_id: 'u2',
        handoff_owner_id: 'manager-1',
      }));
    });

    it('does not change the owner for a no-op assignment', async () => {
      tenantContext.enterWith({ tenantId: 't1', userId: 'manager-1', membershipId: 'm1', role: 'admin', permissions: ['*'] });
      qb.first.mockResolvedValue({
        id: 'task-1', status: TaskStatus.TODO, title: 'Same', tenant_id: 't1', department_id: 'dept-1', assignee_id: 'u1',
      });
      qb.then = (resolve: any) => resolve([{ user_id: 'u1' }]);
      qb.catch = noop;

      await service.update('task-1', { assigneeIds: ['u1'] });

      expect(qb.update).not.toHaveBeenCalled();
    });

    it('keeps other PATCH fields while reopening clears handoff confirmation', async () => {
      tenantContext.enterWith({ tenantId: 't1', userId: 'u1', membershipId: 'm1', role: 'admin', permissions: ['*'] });
      const completed = { id: 'task-1', title: 'Original', status: TaskStatus.COMPLETED, tenant_id: 't1', department_id: 'dept-1', assignee_id: 'u1', handoff_required: true };
      qb.first.mockResolvedValue(completed);
      taskCompletion.reopenInTransaction.mockResolvedValue({ ...completed, status: TaskStatus.IN_PROGRESS, handoff_status: 'pending', handoff_confirmed_by: null, handoff_confirmed_at: null });
      qb.returning.mockResolvedValue([{ ...completed, title: 'Revised', status: TaskStatus.IN_PROGRESS, handoff_status: 'pending', handoff_confirmed_by: null, handoff_confirmed_at: null }]);
      qb.then = (resolve: any) => resolve([]);
      qb.catch = noop;

      const result = await service.update('task-1', { status: TaskStatus.IN_PROGRESS, title: 'Revised' });

      expect(taskCompletion.reopenInTransaction).toHaveBeenCalledWith(expect.anything(), completed, TaskStatus.IN_PROGRESS);
      expect(qb.update).toHaveBeenCalledWith(expect.objectContaining({ title: 'Revised' }));
      expect(result).toMatchObject({ title: 'Revised', status: TaskStatus.IN_PROGRESS, handoff_status: 'pending', handoff_confirmed_by: null, handoff_confirmed_at: null });
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
    it('rejects generic bulk completion until final handoff is confirmed', async () => {
      tenantContext.enterWith({ tenantId: 't1', userId: 'u1', membershipId: 'm1', role: 'admin', permissions: ['*'] });

      await expect(service.bulkUpdate({ taskIds: ['task-1'], updates: { status: TaskStatus.COMPLETED } })).rejects.toMatchObject({
        response: { code: 'HANDOFF_CONFIRMATION_REQUIRED' },
      });
    });

    it('keeps the handoff owner when bulk assignment only removes people', async () => {
      tenantContext.enterWith({ tenantId: 't1', userId: 'manager-1', membershipId: 'm1', role: 'admin', permissions: ['*'] });
      qb._data = [{
        id: 'task-1', title: 'A', status: TaskStatus.TODO, tenant_id: 't1', department_id: 'dept-1', assignee_id: 'u1',
      }];
      qb.then = (resolve: any) => resolve(qb._data);
      qb.catch = noop;
      qb.returning.mockResolvedValue([{ id: 'task-1', assignee_id: null }]);

      await service.bulkUpdate({ taskIds: ['task-1'], updates: { assigneeIds: [] } });

      expect(qb.update.mock.calls.some(([updates]: [Record<string, unknown>]) => 'handoff_owner_id' in updates)).toBe(false);
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

  describe('findDepartmentTasksGrouped', () => {
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

  describe('createDependency', () => {
    it('creates a valid dependency', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first
        .mockResolvedValueOnce({ id: 'task-1', tenant_id: 't1' })
        .mockResolvedValueOnce({ id: 'task-2', tenant_id: 't1' });
      qb.returning.mockResolvedValue([
        { id: 'dep-1', task_id: 'task-1', depends_on_task_id: 'task-2' },
      ]);

      const result = await service.createDependency({
        taskId: 'task-1',
        dependsOnTaskId: 'task-2',
        dependencyType: 'finish_to_start' as any,
        lagDays: 0,
      });
      expect(result.task_id).toBe('task-1');
    });

    it('rejects self-dependency', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      // Both lookups must succeed before the self-dependency check
      qb.first
        .mockResolvedValueOnce({ id: 'same-id', tenant_id: 't1' }) // task check
        .mockResolvedValueOnce({ id: 'same-id', tenant_id: 't1' }); // dependsOn check
      await expect(
        service.createDependency({
          taskId: 'same-id',
          dependsOnTaskId: 'same-id',
          dependencyType: 'finish_to_start' as any,
          lagDays: 0,
        }),
      ).rejects.toThrow('A task cannot depend on itself');
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
  expect(joinClause.andOn).toHaveBeenCalledWith(
    'home_link.tenant_id',
    '=',
    'tasks.tenant_id',
  );
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
