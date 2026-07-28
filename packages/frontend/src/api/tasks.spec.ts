import { describe, expect, it } from 'vitest';
import { TaskPriority, TaskStatus } from '@wrike-clone/shared';
import { buildTaskSearchParams, taskKeys } from './tasks';

describe('task API contract helpers', () => {
  it('serializes task filters using the backend query contract', () => {
    const params = buildTaskSearchParams({
      page: 2,
      perPage: 50,
      folderId: 'folder-1',
      projectId: 'project-1',
      assigneeId: 'user-1',
      status: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
      priority: [TaskPriority.HIGH, TaskPriority.CRITICAL],
      search: 'launch plan',
      dueDateAfter: '2026-07-01',
      dueDateBefore: '2026-07-31',
    });

    expect(Object.fromEntries(params)).toEqual({
      page: '2',
      perPage: '50',
      folderId: 'folder-1',
      projectId: 'project-1',
      assigneeId: 'user-1',
      status: 'todo,in_progress',
      priority: 'high,critical',
      search: 'launch plan',
      dueDateAfter: '2026-07-01',
      dueDateBefore: '2026-07-31',
    });
  });

  it('builds stable list and detail cache keys', () => {
    expect(taskKeys.lists()).toEqual(['tasks', 'list']);
    expect(taskKeys.detail('task-1')).toEqual(['tasks', 'detail', 'task-1']);
    expect(taskKeys.mine({ perPage: 100 })).toEqual(['tasks', 'mine', { perPage: 100 }]);
    expect(taskKeys.grouped('department-1')).toEqual(['tasks', 'grouped', 'department-1']);
  });
});
