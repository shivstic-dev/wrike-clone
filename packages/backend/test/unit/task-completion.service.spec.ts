import { ConflictException, NotFoundException } from '@nestjs/common';
import { TaskCompletionService } from '../../src/task/task-completion.service';
import { tenantContext } from '../../src/common/tenant-context';

const context = {
  tenantId: 'tenant-1',
  userId: 'completer-1',
  membershipId: 'membership-1',
  role: 'member',
  permissions: [],
};

const task = {
  id: 'task-1',
  tenant_id: 'tenant-1',
  department_id: 'department-1',
  assignee_id: 'completer-1',
  handoff_owner_id: 'owner-1',
  handoff_required: true,
  handoff_status: 'pending',
  status: 'in_progress',
  title: 'Draft the update',
};

function createService(overrides: Partial<typeof task> = {}) {
  let row = { ...task, ...overrides };
  const returning = jest.fn().mockImplementation(() => Promise.resolve([row]));
  const update = jest.fn().mockImplementation((patch) => {
    row = { ...row, ...patch };
    return taskQuery;
  });
  const first = jest.fn().mockImplementation(() => Promise.resolve(row));
  const taskQuery = {
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    forUpdate: jest.fn().mockReturnThis(),
    first,
    update,
    returning,
  };
  const assigneeQuery = {
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue([{ user_id: 'completer-1' }]),
  };
  const activityQuery = { insert: jest.fn().mockResolvedValue([]) };
  const notificationQuery = {
    where: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(undefined),
  };
  const db = jest.fn((table: string) => {
    if (table === 'tasks') return taskQuery;
    if (table === 'task_assignees') return assigneeQuery;
    if (table === 'activity_logs') return activityQuery;
    if (table === 'notifications') return notificationQuery;
    return { where: jest.fn().mockReturnThis(), first: jest.fn().mockResolvedValue(undefined) };
  });
  (db as any).transaction = jest.fn(async (callback: (trx: any) => unknown) => callback(db));
  const departmentAccess = { assertCanChangeStatus: jest.fn().mockResolvedValue(undefined) };
  const notifications = { create: jest.fn().mockResolvedValue({ id: 'notification-1' }) };
  return {
    service: new TaskCompletionService(db as any, departmentAccess as any, notifications as any),
    update,
    returning,
    first,
    departmentAccess,
    notifications,
    activity: activityQuery.insert,
  };
}

describe('TaskCompletionService', () => {
  it('confirms handoff and completes in one transaction', async () => {
    const { service, update, departmentAccess } = createService();

    const result = await tenantContext.run(context, () => service.complete('task-1', { outcome: 'confirmed' }));

    expect(departmentAccess.assertCanChangeStatus).toHaveBeenCalledWith(
      'department-1',
      'task-1',
      'completer-1',
      expect.any(Function),
    );
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      handoff_status: 'confirmed',
      handoff_confirmed_by: 'completer-1',
    }));
    expect(result.status).toBe('completed');
  });

  it('marks ready without completing', async () => {
    const { service, update, notifications } = createService();

    const result = await tenantContext.run(context, () => service.complete('task-1', { outcome: 'not_yet' }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'in_progress',
      handoff_status: 'ready',
    }));
    expect(result).toMatchObject({ status: 'in_progress', handoff_status: 'ready' });
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'completer-1',
      type: 'handoff_ready',
    }), expect.anything());
  });

  it('clears prior confirmation metadata when malformed completed data is marked ready', async () => {
    const { service, update } = createService({
      status: 'completed',
      handoff_status: 'pending',
      handoff_confirmed_by: 'previous-completer',
      handoff_confirmed_at: new Date('2026-07-30T00:00:00.000Z'),
    } as any);

    await tenantContext.run(context, () => service.complete('task-1', { outcome: 'not_yet' }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'in_progress',
      handoff_status: 'ready',
      handoff_confirmed_by: null,
      handoff_confirmed_at: null,
    }));
  });

  it('keeps an already confirmed completion unchanged when Not yet is retried', async () => {
    const confirmedTask = {
      status: 'completed',
      handoff_status: 'confirmed',
      handoff_confirmed_by: 'previous-completer',
      handoff_confirmed_at: new Date('2026-07-30T00:00:00.000Z'),
    } as any;
    const { service, update, notifications } = createService(confirmedTask);

    const result = await tenantContext.run(context, () =>
      service.complete('task-1', { outcome: 'not_yet' }),
    );

    expect(result).toMatchObject(confirmedTask);
    expect(update).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('keeps an already-ready incomplete task unchanged when Not yet is retried', async () => {
    const readyTask = {
      status: 'in_progress',
      handoff_status: 'ready',
      handoff_ready_at: new Date('2026-07-30T00:00:00.000Z'),
    } as any;
    const { service, update, notifications, activity } = createService(readyTask);

    const result = await tenantContext.run(context, () =>
      service.complete('task-1', { outcome: 'not_yet' }),
    );

    expect(result).toMatchObject(readyTask);
    expect(update).not.toHaveBeenCalled();
    expect(activity).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate task ids before starting bulk completion work', async () => {
    const { service } = createService();
    const complete = jest.spyOn(service, 'complete');

    try {
      await expect(service.completeMany({
        items: [
          { taskId: 'task-1', outcome: 'confirmed' },
          { taskId: 'task-1', outcome: 'not_yet' },
        ],
      })).rejects.toMatchObject({
        response: {
          code: 'DUPLICATE_TASK_COMPLETION',
          message: 'Each task can appear only once in a bulk completion request',
        },
      });
      expect(complete).not.toHaveBeenCalled();
    } finally {
      complete.mockRestore();
    }
  });

  it('completes a not-required task without confirmation metadata', async () => {
    const { service, update } = createService({ handoff_required: false, handoff_status: 'not_required' });

    await tenantContext.run(context, () => service.complete('task-1', { outcome: 'confirmed' }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ handoff_confirmed_by: expect.anything() }));
  });

  it('does not duplicate activity or notifications on retry', async () => {
    const { service, notifications, update } = createService({ status: 'completed', handoff_status: 'confirmed' });

    await tenantContext.run(context, () => service.complete('task-1', { outcome: 'confirmed' }));

    expect(update).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('checks status permission before writing', async () => {
    const { service, update, departmentAccess } = createService();
    departmentAccess.assertCanChangeStatus.mockRejectedValueOnce(new ConflictException('denied'));

    await expect(tenantContext.run(context, () => service.complete('task-1', { outcome: 'confirmed' }))).rejects.toThrow('denied');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a deleted or cross-tenant task as not found', async () => {
    const { service, first } = createService();
    first.mockResolvedValueOnce(undefined);

    await expect(tenantContext.run(context, () => service.complete('task-1', { outcome: 'confirmed' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resets current confirmation when reopening', async () => {
    const { service, update } = createService({ status: 'completed', handoff_status: 'confirmed' });
    const transaction = (service as any).db;

    await tenantContext.run(context, () => service.reopenInTransaction(transaction, { ...task, handoff_required: true }, 'in_progress' as any));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'in_progress',
      handoff_status: 'pending',
      handoff_ready_at: null,
      handoff_confirmed_by: null,
      handoff_confirmed_at: null,
    }));
  });

  it('reopens a not-required task with cleared handoff metadata', async () => {
    const { service, update } = createService({ status: 'completed', handoff_required: false, handoff_status: 'not_required' });
    const transaction = (service as any).db;

    await tenantContext.run(context, () => service.reopenInTransaction(
      transaction,
      { ...task, handoff_required: false },
      'in_progress' as any,
    ));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'in_progress',
      handoff_status: 'not_required',
      handoff_ready_at: null,
      handoff_confirmed_by: null,
      handoff_confirmed_at: null,
    }));
  });
});
