import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { TaskPriority, TaskStatus } from '@wrike-clone/shared';
import {
  buildTaskSearchParams,
  invalidateTaskDependentQueries,
  taskDependentQueryKeys,
  taskKeys,
} from './tasks';

describe('task API contract helpers', () => {
  it('uses the canonical home folder when requesting folder tasks', () => {
    const params = buildTaskSearchParams({ folderId: 'folder-1', perPage: 100 });

    expect(params.get('folderId')).toBe('folder-1');
    expect(params.get('perPage')).toBe('100');
  });

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

  it('defines every task-dependent server-state root', () => {
    expect(taskDependentQueryKeys).toEqual([
      ['tasks'],
      ['reports'],
      ['workspaces'],
      ['folders'],
    ]);
  });

  it('invalidates every task-dependent cached query', async () => {
    const queryClient = new QueryClient();
    for (const queryKey of taskDependentQueryKeys) {
      queryClient.setQueryData([...queryKey, 'cached'], { current: false });
    }

    await invalidateTaskDependentQueries(queryClient);

    for (const queryKey of taskDependentQueryKeys) {
      expect(queryClient.getQueryState([...queryKey, 'cached'])?.isInvalidated).toBe(true);
    }
  });
});
