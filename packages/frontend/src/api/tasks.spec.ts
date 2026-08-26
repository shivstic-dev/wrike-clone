// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TaskPriority,
  TaskStatus,
  type Task,
  type TaskCompletionOutcome,
} from '@wrike-clone/shared';
import {
  buildTaskSearchParams,
  invalidateTaskDependentQueries,
  taskDependentQueryKeys,
  taskKeys,
  useAddTaskAssignee,
  useBulkCompleteTasks,
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  useRemoveTaskAssignee,
  fetchAllTasks,
} from './tasks';
import { useUpdateTask } from '../hooks/useUpdateTask';
import { useMoveTaskLocation } from './task-locations';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('./client', () => ({
  default: apiMocks,
}));

const cachedTaskDependentKeys = [
  ['tasks', 'list', 'cached'],
  ['reports', 'cached'],
  ['workspaces', 'cached'],
  ['folders', 'cached'],
  ['notifications', 'cached'],
  ['dashboard', 'cached'],
  ['timeline', 'cached'],
] as const;

interface PaginatedLike {
  data: Array<Record<string, unknown>>;
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

const returnedTask: Task = {
  id: 'task-1',
  tenantId: 'tenant-1',
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T01:00:00.000Z',
  deletedAt: null,
  projectId: 'project-1',
  folderId: 'folder-1',
  departmentId: 'department-1',
  parentTaskId: null,
  assigneeId: 'user-1',
  createdById: 'creator-1',
  title: 'Current task',
  description: null,
  status: TaskStatus.TODO,
  handoffRequired: true,
  handoffStatus: 'pending' as Task['handoffStatus'],
  handoffOwnerId: 'creator-1',
  handoffOwner: null,
  handoffReadyAt: null,
  handoffConfirmedBy: null,
  handoffConfirmedAt: null,
  priority: TaskPriority.MEDIUM,
  estimatedHours: null,
  actualHours: null,
  startDate: null,
  dueDate: null,
  completedAt: null,
  visibility: 'department',
  sortOrder: 0,
  customFields: {},
  isRecurring: false,
  recurrenceRule: null,
};

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  apiMocks.post.mockReset();
  apiMocks.get.mockReset();
  apiMocks.patch.mockReset();
  apiMocks.delete.mockReset();
});

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => root.unmount());
    container.remove();
  }
  mountedRoots = [];
});

function createTaskMutationQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  for (const queryKey of cachedTaskDependentKeys) {
    queryClient.setQueryData(queryKey, { current: false });
  }
  return queryClient;
}

function mountMutation<TInput>(
  queryClient: QueryClient,
  useMutationHook: () => {
    mutateAsync: (input: TInput) => Promise<unknown>;
  },
): (input: TInput) => Promise<unknown> {
  let mutateAsync: ((input: TInput) => Promise<unknown>) | undefined;

  function Harness() {
    mutateAsync = useMutationHook().mutateAsync;
    return null;
  }

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  act(() => {
    root.render(
      createElement(QueryClientProvider, { client: queryClient }, createElement(Harness)),
    );
  });

  return async (input: TInput) => {
    if (!mutateAsync) throw new Error('Mutation hook did not mount');
    let result: unknown;
    await act(async () => {
      result = await mutateAsync?.(input);
    });
    return result;
  };
}

/**
 * Mutations now patch caches directly instead of invalidating derived views
 * (realtime broadcasts / adaptive polling keep those fresh), so only the
 * ['tasks'] family may be invalidated after creation.
 */
function expectNoBroadInvalidation(queryClient: QueryClient): void {
  for (const dependentKey of cachedTaskDependentKeys.slice(1)) {
    const state = queryClient.getQueryState(dependentKey);
    expect(state?.isInvalidated ?? false).toBe(false);
  }
}

describe('task API contract helpers', () => {
  it('loads every authorized board page at the maximum page size', async () => {
    apiMocks.get
      .mockResolvedValueOnce({
        data: { data: [returnedTask], meta: { page: 1, perPage: 1000, total: 2, totalPages: 2 } },
      })
      .mockResolvedValueOnce({
        data: {
          data: [{ ...returnedTask, id: 'task-2' }],
          meta: { page: 2, perPage: 1000, total: 2, totalPages: 2 },
        },
      });
    await expect(fetchAllTasks({ departmentId: 'department-1' })).resolves.toHaveLength(2);
    expect(apiMocks.get).toHaveBeenNthCalledWith(
      1,
      '/tasks?departmentId=department-1&page=1&perPage=1000',
    );
    expect(apiMocks.get).toHaveBeenNthCalledWith(
      2,
      '/tasks?departmentId=department-1&page=2&perPage=1000',
    );
  });

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
      ['notifications'],
      ['dashboard'],
      ['timeline'],
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

  it('caches the created task and refreshes only the task family', async () => {
    apiMocks.post.mockResolvedValue({ data: returnedTask });
    const queryClient = createTaskMutationQueryClient();
    const listKey = ['tasks', 'list', { page: 1 }] as const;
    queryClient.setQueryData<PaginatedLike>(listKey, {
      data: [],
      meta: { page: 1, perPage: 10, total: 0, totalPages: 0 },
    });
    const mutate = mountMutation(queryClient, useCreateTask);

    await mutate({ title: 'Current task' });

    // Detail cache seeded, task upserted into the cached list
    expect(queryClient.getQueryData(taskKeys.detail(returnedTask.id))).toMatchObject({
      id: returnedTask.id,
    });
    expect(queryClient.getQueryData<PaginatedLike>(listKey)?.data).toHaveLength(1);
    // Only the ['tasks'] family invalidated — no derived-view refetch cascade
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expectNoBroadInvalidation(queryClient);
  });

  it('patches caches and skips broad invalidation after updating a task', async () => {
    apiMocks.patch.mockResolvedValue({ data: returnedTask });
    const queryClient = createTaskMutationQueryClient();
    queryClient.setQueryData(taskKeys.detail(returnedTask.id), {
      id: returnedTask.id,
      title: 'Old task',
    });
    const mutate = mountMutation(queryClient, useUpdateTask);

    await mutate({ id: returnedTask.id, title: returnedTask.title });

    expect(queryClient.getQueryData(taskKeys.detail(returnedTask.id))).toEqual(returnedTask);
    expectNoBroadInvalidation(queryClient);
  });

  it('removes the deleted task from cached lists without broad invalidation', async () => {
    apiMocks.delete.mockResolvedValue({ data: undefined });
    const queryClient = createTaskMutationQueryClient();
    const mineKey = taskKeys.mine({});
    queryClient.setQueryData(mineKey, [returnedTask]);
    const mutate = mountMutation(queryClient, useDeleteTask);

    await mutate(returnedTask.id);

    expect(queryClient.getQueryData<Task[]>(mineKey)).toHaveLength(0);
    expect(queryClient.getQueryData(taskKeys.detail(returnedTask.id))).toBeUndefined();
    expectNoBroadInvalidation(queryClient);
  });

  it('patches the detail cache after adding an assignee', async () => {
    apiMocks.post.mockResolvedValue({ data: returnedTask });
    const queryClient = createTaskMutationQueryClient();
    const mutate = mountMutation(queryClient, useAddTaskAssignee);

    await mutate({ taskId: returnedTask.id, userId: 'user-1' });

    expectNoBroadInvalidation(queryClient);
    expect(queryClient.getQueryData(taskKeys.detail(returnedTask.id))).toEqual(returnedTask);
  });

  it('patches the detail cache after removing an assignee', async () => {
    apiMocks.delete.mockResolvedValue({ data: returnedTask });
    const queryClient = createTaskMutationQueryClient();
    const mutate = mountMutation(queryClient, useRemoveTaskAssignee);

    await mutate({ taskId: returnedTask.id, userId: 'user-1' });

    expectNoBroadInvalidation(queryClient);
    expect(queryClient.getQueryData(taskKeys.detail(returnedTask.id))).toEqual(returnedTask);
  });

  it('sends the selected handoff outcome and patches the cache on completion', async () => {
    apiMocks.post.mockResolvedValue({ data: returnedTask });
    const queryClient = createTaskMutationQueryClient();
    queryClient.setQueryData(taskKeys.detail(returnedTask.id), {
      id: returnedTask.id,
      title: 'Old task',
    });
    const mutate = mountMutation<{
      taskId: string;
      outcome: TaskCompletionOutcome;
    }>(queryClient, useCompleteTask);

    await mutate({ taskId: 'task-1', outcome: 'not_yet' });

    expect(apiMocks.post).toHaveBeenCalledWith('/tasks/task-1/completion', {
      outcome: 'not_yet',
    });
    expectNoBroadInvalidation(queryClient);
    expect(queryClient.getQueryData(taskKeys.detail(returnedTask.id))).toEqual(returnedTask);
  });

  it('submits every selected task through the bulk completion endpoint and patches caches', async () => {
    apiMocks.post.mockResolvedValue({ data: { data: [returnedTask], errors: [] } });
    const queryClient = createTaskMutationQueryClient();
    const mutate = mountMutation<{
      items: Array<{ taskId: string; outcome: TaskCompletionOutcome }>;
    }>(queryClient, useBulkCompleteTasks);

    await mutate({ items: [{ taskId: 'task-1', outcome: 'confirmed' }] });

    expect(apiMocks.post).toHaveBeenCalledWith('/tasks/bulk-completion', {
      items: [{ taskId: 'task-1', outcome: 'confirmed' }],
    });
    expectNoBroadInvalidation(queryClient);
    expect(queryClient.getQueryData(taskKeys.detail(returnedTask.id))).toEqual(returnedTask);
  });

  it('patches caches and updates detail after moving a task', async () => {
    apiMocks.patch.mockResolvedValue({ data: returnedTask });
    const queryClient = createTaskMutationQueryClient();
    const mutate = mountMutation(queryClient, useMoveTaskLocation);

    await mutate({ taskId: returnedTask.id, folderId: 'folder-1' });

    expectNoBroadInvalidation(queryClient);
    expect(queryClient.getQueryData(taskKeys.detail(returnedTask.id))).toEqual(returnedTask);
  });
});
