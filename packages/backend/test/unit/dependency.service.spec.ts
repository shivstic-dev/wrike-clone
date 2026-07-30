import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DependencyType } from '@wrike-clone/shared';
import { tenantContext, type TenantContextData } from '../../src/common/tenant-context';
import { DependencyService } from '../../src/timeline/dependency.service';

const context: TenantContextData = {
  tenantId: 'tenant-1', userId: 'manager-1', membershipId: 'membership-1', role: 'manager', permissions: ['task:write'],
};

function chain(values: { first?: unknown; rows?: unknown[]; returning?: unknown[] } = {}) {
  const query: any = {
    where: jest.fn().mockReturnThis(), whereNull: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(), del: jest.fn().mockResolvedValue(1),
    insert: jest.fn().mockReturnThis(), returning: jest.fn().mockResolvedValue(values.returning ?? []),
    first: jest.fn().mockResolvedValue(values.first),
    then: (resolve: (value: unknown[]) => unknown) => resolve(values.rows ?? []),
  };
  return query;
}

describe('DependencyService', () => {
  const departmentAccess = { assertCanManageTask: jest.fn().mockResolvedValue('manager') };

  beforeEach(() => jest.clearAllMocks());

  it.each(Object.values(DependencyType))('creates a %s dependency with tenant ownership and lag', async (dependencyType) => {
    const taskQuery = chain({ first: { id: 'task-1', tenant_id: context.tenantId, department_id: 'dept-1' } });
    taskQuery.first.mockResolvedValueOnce({ id: 'task-1', tenant_id: context.tenantId, department_id: 'dept-1' })
      .mockResolvedValueOnce({ id: 'task-2', tenant_id: context.tenantId, department_id: 'dept-1' });
    const dependencyQuery = chain({ rows: [], returning: [{ id: 'dep-1', task_id: 'task-1', depends_on_task_id: 'task-2', dependency_type: dependencyType, lag_days: 2 }] });
    const database: any = jest.fn((table: string) => table === 'tasks' ? taskQuery : dependencyQuery);
    database.transaction = jest.fn((callback: (trx: any) => unknown) => callback(database));
    const service = new DependencyService(database, departmentAccess as never);

    const dependency = await tenantContext.run(context, () => service.create({ taskId: 'task-1', dependsOnTaskId: 'task-2', dependencyType, lagDays: 2 }));

    expect(dependency).toMatchObject({ id: 'dep-1', dependencyType, lagDays: 2 });
    expect(dependencyQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: context.tenantId, dependency_type: dependencyType, lag_days: 2,
    }));
  });

  it.each([
    ['self link', 'task-1', 'task-1', ConflictException, 'DEPENDENCY_CYCLE'],
    ['missing endpoint', 'task-1', 'missing', NotFoundException, undefined],
  ])('rejects a %s without inserting a dependency', async (_name, taskId, dependsOnTaskId, ErrorType, code) => {
    const taskQuery = chain();
    taskQuery.first.mockResolvedValueOnce({ id: 'task-1', tenant_id: context.tenantId, department_id: 'dept-1' })
      .mockResolvedValueOnce(dependsOnTaskId === 'missing' ? undefined : { id: 'task-1', tenant_id: context.tenantId, department_id: 'dept-1' });
    const dependencyQuery = chain({ rows: [] });
    const database: any = jest.fn((table: string) => table === 'tasks' ? taskQuery : dependencyQuery);
    database.transaction = jest.fn((callback: (trx: any) => unknown) => callback(database));
    const service = new DependencyService(database, departmentAccess as never);

    const action = tenantContext.run(context, () => service.create({ taskId, dependsOnTaskId, dependencyType: DependencyType.FINISH_TO_START, lagDays: 0 }));
    if (code) await expect(action).rejects.toMatchObject({ response: { code } });
    else await expect(action).rejects.toBeInstanceOf(ErrorType);
    expect(dependencyQuery.insert).not.toHaveBeenCalled();
  });

  it('rejects a duplicate edge and a cycle with stable errors', async () => {
    const taskQuery = chain();
    taskQuery.first.mockResolvedValue({ id: 'task-1', tenant_id: context.tenantId, department_id: 'dept-1' });
    const dependencyQuery = chain({ rows: [{ id: 'existing', task_id: 'task-1', depends_on_task_id: 'task-2', dependency_type: DependencyType.FINISH_TO_START, lag_days: 0 }] });
    const database: any = jest.fn((table: string) => table === 'tasks' ? taskQuery : dependencyQuery);
    database.transaction = jest.fn((callback: (trx: any) => unknown) => callback(database));
    const service = new DependencyService(database, departmentAccess as never);

    await expect(tenantContext.run(context, () => service.create({ taskId: 'task-1', dependsOnTaskId: 'task-2', dependencyType: DependencyType.FINISH_TO_START, lagDays: 0 })))
      .rejects.toMatchObject({ response: { code: 'DEPENDENCY_EXISTS' } });

    dependencyQuery.then = (resolve: (value: unknown[]) => unknown) => resolve([{ id: 'existing', task_id: 'task-2', depends_on_task_id: 'task-1', dependency_type: DependencyType.FINISH_TO_START, lag_days: 0 }]);
    await expect(tenantContext.run(context, () => service.create({ taskId: 'task-1', dependsOnTaskId: 'task-2', dependencyType: DependencyType.FINISH_TO_START, lagDays: 0 })))
      .rejects.toMatchObject({ response: { code: 'DEPENDENCY_CYCLE' } });
  });

  it('rejects cross-tenant endpoints and manager scope with a stable forbidden error', async () => {
    const taskQuery = chain();
    taskQuery.first.mockResolvedValueOnce({ id: 'task-1', tenant_id: context.tenantId, department_id: 'dept-1' }).mockResolvedValueOnce(undefined);
    const dependencyQuery = chain();
    const database: any = jest.fn((table: string) => table === 'tasks' ? taskQuery : dependencyQuery);
    database.transaction = jest.fn((callback: (trx: any) => unknown) => callback(database));
    const service = new DependencyService(database, departmentAccess as never);
    await expect(tenantContext.run(context, () => service.create({ taskId: 'task-1', dependsOnTaskId: 'other-tenant', dependencyType: DependencyType.FINISH_TO_START, lagDays: 0 }))).rejects.toBeInstanceOf(NotFoundException);

    taskQuery.first.mockResolvedValue({ id: 'task-1', tenant_id: context.tenantId, department_id: 'dept-1' });
    departmentAccess.assertCanManageTask.mockRejectedValueOnce(new ForbiddenException('Department access denied'));
    await expect(tenantContext.run(context, () => service.create({ taskId: 'task-1', dependsOnTaskId: 'task-2', dependencyType: DependencyType.FINISH_TO_START, lagDays: 0 })))
      .rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('prevents an update-created cycle and deletes a tenant-owned dependency', async () => {
    const taskQuery = chain({ first: { id: 'task-1', tenant_id: context.tenantId, department_id: 'dept-1' } });
    const dependencyQuery = chain({
      first: { id: 'dep-1', tenant_id: context.tenantId, task_id: 'task-1', depends_on_task_id: 'task-2', dependency_type: DependencyType.FINISH_TO_START, lag_days: 0, department_id: 'dept-1' },
      rows: [{ id: 'dep-2', task_id: 'task-2', depends_on_task_id: 'task-1', dependency_type: DependencyType.FINISH_TO_START, lag_days: 0 }],
    });
    const database: any = jest.fn((table: string) => table === 'tasks' ? taskQuery : dependencyQuery);
    database.transaction = jest.fn((callback: (trx: any) => unknown) => callback(database));
    const service = new DependencyService(database, departmentAccess as never);

    await expect(tenantContext.run(context, () => service.update('dep-1', { dependencyType: DependencyType.FINISH_TO_START, lagDays: 1 })))
      .rejects.toMatchObject({ response: { code: 'DEPENDENCY_CYCLE' } });

    dependencyQuery.then = (resolve: (value: unknown[]) => unknown) => resolve([]);
    await tenantContext.run(context, () => service.remove('dep-1'));
    expect(dependencyQuery.where).toHaveBeenCalledWith({ id: 'dep-1', tenant_id: context.tenantId });
    expect(dependencyQuery.del).toHaveBeenCalled();
  });
});
