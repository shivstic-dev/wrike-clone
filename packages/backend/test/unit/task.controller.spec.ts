import { TaskController } from '../../src/task/task.controller';
import { PERMISSIONS_KEY } from '../../src/common/decorators/permissions.decorator';

const taskId = '00000000-0000-4000-8000-000000000001';

describe('TaskController completion routes', () => {
  const taskService = {} as any;
  const taskCompletion = { complete: jest.fn(), completeMany: jest.fn() };
  const controller = new (TaskController as any)(taskService, taskCompletion);

  beforeEach(() => jest.clearAllMocks());

  it('validates and forwards a single completion confirmation', async () => {
    taskCompletion.complete.mockResolvedValue({ id: taskId, status: 'completed' });

    await expect(controller.complete(taskId, { outcome: 'confirmed' })).resolves.toMatchObject({ status: 'completed' });
    expect(taskCompletion.complete).toHaveBeenCalledWith(taskId, { outcome: 'confirmed' });
  });

  it('rejects invalid single completion input before calling the service', async () => {
    await expect(controller.complete(taskId, { outcome: 'delivered' })).rejects.toThrow();
    expect(taskCompletion.complete).not.toHaveBeenCalled();
  });

  it('validates and forwards bulk handoff outcomes', async () => {
    taskCompletion.completeMany.mockResolvedValue({ data: [], errors: [] });

    await expect(controller.completeMany({ items: [{ taskId, outcome: 'not_yet' }] })).resolves.toEqual({ data: [], errors: [] });
    expect(taskCompletion.completeMany).toHaveBeenCalledWith({ items: [{ taskId, outcome: 'not_yet' }] });
  });

  it('rejects duplicate bulk task ids before calling the completion service', async () => {
    await expect(controller.completeMany({
      items: [
        { taskId, outcome: 'confirmed' },
        { taskId, outcome: 'not_yet' },
      ],
    })).rejects.toThrow('Each task can appear only once in a bulk completion request');

    expect(taskCompletion.completeMany).not.toHaveBeenCalled();
  });

  it('requires status-write permission for handoff completion routes', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, (TaskController as any).prototype.complete)).toEqual(['task:status:update']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, (TaskController as any).prototype.completeMany)).toEqual(['task:status:update']);
  });
});
