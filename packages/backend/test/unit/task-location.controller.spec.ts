import { DepartmentWorkflowController } from '../../src/task/department-workflow.controller';
import { TaskController } from '../../src/task/task.controller';

const validFolderId = '00000000-0000-4000-8000-000000000001';

describe('task location controllers', () => {
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

  afterEach(() => jest.clearAllMocks());

  it('lists task locations for a department', async () => {
    locations.listDepartmentLocations.mockResolvedValue([]);

    await departmentController.listLocations('dept-1');

    expect(locations.listDepartmentLocations).toHaveBeenCalledWith('dept-1');
  });

  it('moves a task using validated location input', async () => {
    taskService.moveLocation.mockResolvedValue({ id: 'task-1' });

    const result = await taskController.moveLocation('task-1', {
      folderId: validFolderId,
    });

    expect(taskService.moveLocation).toHaveBeenCalledWith('task-1', {
      folderId: validFolderId,
    });
    expect(result).toEqual({ id: 'task-1' });
  });

  it('rejects invalid move input before calling the task service', async () => {
    await expect(taskController.moveLocation('task-1', {})).rejects.toThrow(
      'folderId or projectId is required',
    );
    expect(taskService.moveLocation).not.toHaveBeenCalled();
  });
});
