/**
 * Task service unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from '../../src/task/task.service';
import { DATABASE_PROVIDER } from '../../src/database/database.module';
import { tenantContext } from '../../src/common/tenant-context';
import { DepartmentAccessService } from '../../src/rbac/department-access.service';

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
  };

  beforeEach(async () => {
    qb = createQb();
    mockDb = jest.fn().mockReturnValue(qb);
    (mockDb as any).raw = jest.fn(() => qb);
    (mockDb as any).transaction = jest.fn((cb: (q: any) => any) => cb(mockDb));
    qb.first.mockResolvedValue(null);
    qb.returning.mockResolvedValue([{}]);
    qb.del.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        { provide: DATABASE_PROVIDER, useValue: mockDb },
        { provide: DepartmentAccessService, useValue: departmentAccess },
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
  });

  describe('create', () => {
    it('creates a task successfully', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValueOnce({ id: 'proj-1', tenant_id: 't1', department_id: 'dept-1' });
      qb.returning.mockResolvedValue([{ id: 'task-new', title: 'New Task', status: 'todo' }]);

      const result = await service.create({
        projectId: 'proj-1',
        title: 'New Task',
        visibility: 'department',
      });
      expect(result.id).toBe('task-new');
    });

    it('throws when project missing', async () => {
      tenantContext.enterWith({
        tenantId: 't1',
        userId: 'u1',
        membershipId: 'm1',
        role: 'admin',
        permissions: ['*'],
      });
      qb.first.mockResolvedValue(null);
      await expect(
        service.create({ projectId: 'nope', title: 'Task', visibility: 'department' }),
      ).rejects.toThrow('Project not found');
    });
  });

  describe('update', () => {
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
        { id: 'task-1', status: 'completed' },
        { id: 'task-2', status: 'completed' },
      ]);

      const results = await service.bulkUpdate({
        taskIds: ['task-1', 'task-2'],
        updates: { status: 'completed' as any },
      });
      expect(results).toHaveLength(2);
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
