// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TaskStatus,
  TaskPriority,
  HandoffStatus,
  type Task,
  type PaginatedResponse,
} from '@wrike-clone/shared';
import { useUpdateTask } from './useUpdateTask';
import { taskKeys, type GroupedDepartmentTasks } from '../api/tasks';

const apiMocks = vi.hoisted(() => ({
  patch: vi.fn(),
}));

vi.mock('../api/client', () => ({
  default: apiMocks,
}));

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  apiMocks.patch.mockReset();
  mountedRoots = [];
});

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => root.unmount());
    container.remove();
  }
  mountedRoots = [];
});

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function mountUpdateTaskHook(queryClient: QueryClient) {
  let hookResult: ReturnType<typeof useUpdateTask> | undefined;

  function Harness() {
    hookResult = useUpdateTask();
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

  return () => {
    if (!hookResult) throw new Error('useUpdateTask did not mount');
    return hookResult;
  };
}

describe('useUpdateTask', () => {
  it('optimistically updates cache before mutation completes', async () => {
    const queryClient = createTestQueryClient();
    const getHook = mountUpdateTaskHook(queryClient);

    const initialTask: Task = {
      id: 'task-1',
      tenantId: 'tenant-1',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T01:00:00.000Z',
      deletedAt: null,
      projectId: 'project-1',
      folderId: 'folder-1',
      departmentId: 'dept-1',
      parentTaskId: null,
      assigneeId: 'user-1',
      createdById: 'creator-1',
      title: 'Original Title',
      description: null,
      status: TaskStatus.TODO,
      handoffRequired: false,
      handoffStatus: HandoffStatus.NOT_REQUIRED,
      handoffOwnerId: null,
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

    // Seed query cache for single task detail, paginated list, task array, and grouped department
    const detailKey = taskKeys.detail('task-1');
    const listKey = taskKeys.list({ page: 1 });
    const mineKey = taskKeys.mine({});
    const groupedKey = taskKeys.grouped('dept-1');

    queryClient.setQueryData(detailKey, initialTask);
    queryClient.setQueryData<PaginatedResponse<Task>>(listKey, {
      data: [initialTask],
      meta: { page: 1, perPage: 10, total: 1, totalPages: 1 },
    });
    queryClient.setQueryData<Task[]>(mineKey, [initialTask]);
    queryClient.setQueryData<GroupedDepartmentTasks>(groupedKey, {
      viewerRole: 'admin',
      myTasks: [initialTask],
      managerGroups: [
        {
          user: {
            userId: 'mgr-1',
            displayName: 'Manager',
            email: 'mgr@test.com',
            role: 'manager',
          },
          tasks: [initialTask],
        },
      ],
      employeeGroups: [],
      unassigned: [initialTask],
      members: [],
    });

    let resolvePatch!: (value: unknown) => void;
    const patchPromise = new Promise((resolve) => {
      resolvePatch = resolve;
    });
    apiMocks.patch.mockReturnValue(patchPromise);

    const hook = getHook();

    // Trigger mutation without awaiting completion yet
    let mutationPromise: Promise<Task> | undefined;
    act(() => {
      mutationPromise = hook.mutateAsync({
        id: 'task-1',
        status: TaskStatus.IN_PROGRESS,
        title: 'Updated Title',
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Check optimistic updates in cache before server responds
    const updatedDetail = queryClient.getQueryData<Task>(detailKey);
    expect(updatedDetail?.status).toBe(TaskStatus.IN_PROGRESS);
    expect(updatedDetail?.title).toBe('Updated Title');

    const updatedList = queryClient.getQueryData<PaginatedResponse<Task>>(listKey);
    expect(updatedList?.data[0]?.status).toBe(TaskStatus.IN_PROGRESS);
    expect(updatedList?.data[0]?.title).toBe('Updated Title');

    const updatedMine = queryClient.getQueryData<Task[]>(mineKey);
    expect(updatedMine?.[0]?.status).toBe(TaskStatus.IN_PROGRESS);

    const updatedGrouped = queryClient.getQueryData<GroupedDepartmentTasks>(groupedKey);
    expect(updatedGrouped?.myTasks[0]?.status).toBe(TaskStatus.IN_PROGRESS);
    expect(updatedGrouped?.unassigned[0]?.status).toBe(TaskStatus.IN_PROGRESS);
    expect(updatedGrouped?.managerGroups[0]?.tasks[0]?.status).toBe(TaskStatus.IN_PROGRESS);

    // Now resolve patch request and wait for mutation promise
    await act(async () => {
      resolvePatch({
        data: { ...initialTask, status: TaskStatus.IN_PROGRESS, title: 'Updated Title' },
      });
      await mutationPromise;
    });
  });

  it('triggers rollback to previous cache state on error', async () => {
    const queryClient = createTestQueryClient();
    const getHook = mountUpdateTaskHook(queryClient);

    const initialTask: Task = {
      id: 'task-1',
      tenantId: 'tenant-1',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T01:00:00.000Z',
      deletedAt: null,
      projectId: 'project-1',
      folderId: 'folder-1',
      departmentId: 'dept-1',
      parentTaskId: null,
      assigneeId: 'user-1',
      createdById: 'creator-1',
      title: 'Original Title',
      description: null,
      status: TaskStatus.TODO,
      handoffRequired: false,
      handoffStatus: HandoffStatus.NOT_REQUIRED,
      handoffOwnerId: null,
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

    const detailKey = taskKeys.detail('task-1');
    queryClient.setQueryData(detailKey, initialTask);

    apiMocks.patch.mockRejectedValue(new Error('Server error'));

    const hook = getHook();

    await act(async () => {
      try {
        await hook.mutateAsync({ id: 'task-1', status: TaskStatus.COMPLETED });
      } catch {
        // Expected mutation failure
      }
    });

    // Verify cache rolled back to original state
    const cachedTask = queryClient.getQueryData<Task>(detailKey);
    expect(cachedTask?.status).toBe(TaskStatus.TODO);
    expect(cachedTask?.title).toBe('Original Title');
  });

  it('reconciles cache with the server response on settlement without broad invalidation', async () => {
    const queryClient = createTestQueryClient();
    const getHook = mountUpdateTaskHook(queryClient);

    const detailKey = taskKeys.detail('task-1');
    const rootKey = taskKeys.all;

    queryClient.setQueryData(detailKey, { id: 'task-1', status: TaskStatus.TODO });
    queryClient.setQueryData(rootKey, [{ id: 'task-1', status: TaskStatus.TODO }]);

    // Server returns a different title than the optimistic input — settlement
    // must overwrite optimistic state with the authoritative response.
    apiMocks.patch.mockResolvedValue({
      data: { id: 'task-1', status: TaskStatus.COMPLETED, title: 'Server Title' },
    });

    const hook = getHook();

    await act(async () => {
      await hook.mutateAsync({
        id: 'task-1',
        status: TaskStatus.COMPLETED,
        title: 'Optimistic Title',
      });
    });

    // Cache reconciled with the server response
    const detail = queryClient.getQueryData<{ id: string; status: string; title?: string }>(
      detailKey,
    );
    expect(detail?.status).toBe(TaskStatus.COMPLETED);
    expect(detail?.title).toBe('Server Title');

    const listEntry =
      queryClient.getQueryData<Array<{ id: string; status: string; title?: string }>>(rootKey);
    expect(listEntry?.[0]?.status).toBe(TaskStatus.COMPLETED);
    expect(listEntry?.[0]?.title).toBe('Server Title');

    // No refetch cascade: derived views are kept fresh by realtime/polling
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(rootKey)?.isInvalidated).toBe(false);
  });

  describe('Adversarial & Edge Case Verification', () => {
    const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
      id,
      tenantId: 'tenant-1',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T01:00:00.000Z',
      deletedAt: null,
      projectId: 'project-1',
      folderId: 'folder-1',
      departmentId: 'dept-1',
      parentTaskId: null,
      assigneeId: 'user-1',
      createdById: 'creator-1',
      title: `Task ${id}`,
      description: null,
      status: TaskStatus.TODO,
      handoffRequired: false,
      handoffStatus: HandoffStatus.NOT_REQUIRED,
      handoffOwnerId: null,
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
      ...overrides,
    });

    it('correctly updates employeeGroups and leaves unrelated tasks untouched in department grouped cache', async () => {
      const queryClient = createTestQueryClient();
      const getHook = mountUpdateTaskHook(queryClient);

      const task1 = makeTask('task-1', { title: 'Task 1' });
      const task2 = makeTask('task-2', { title: 'Task 2' });

      const groupedKey = taskKeys.grouped('dept-1');
      queryClient.setQueryData<GroupedDepartmentTasks>(groupedKey, {
        viewerRole: 'manager',
        myTasks: [],
        managerGroups: [],
        employeeGroups: [
          {
            user: {
              userId: 'emp-1',
              displayName: 'Emp 1',
              email: 'emp1@test.com',
              role: 'employee',
            },
            tasks: [task1, task2],
          },
        ],
        unassigned: [],
        members: [],
      });

      let resolvePatch!: (v: unknown) => void;
      apiMocks.patch.mockReturnValue(
        new Promise((res) => {
          resolvePatch = res;
        }),
      );

      const hook = getHook();
      let mutationPromise: Promise<Task> | undefined;
      act(() => {
        mutationPromise = hook.mutateAsync({ id: 'task-1', title: 'Task 1 Updated' });
      });
      await act(async () => {
        await Promise.resolve();
      });

      const cachedGrouped = queryClient.getQueryData<GroupedDepartmentTasks>(groupedKey);
      expect(cachedGrouped?.employeeGroups[0]?.tasks[0]?.title).toBe('Task 1 Updated');
      expect(cachedGrouped?.employeeGroups[0]?.tasks[1]?.title).toBe('Task 2');

      await act(async () => {
        resolvePatch({ data: { ...task1, title: 'Task 1 Updated' } });
        await mutationPromise;
      });
    });

    it('accurately rolls back ALL cache shapes (detail, list, mine, grouped) on Network Error (TypeError)', async () => {
      const queryClient = createTestQueryClient();
      const getHook = mountUpdateTaskHook(queryClient);

      const task1 = makeTask('task-1', { title: 'Original Task 1', status: TaskStatus.TODO });
      const detailKey = taskKeys.detail('task-1');
      const listKey = taskKeys.list({ page: 1 });
      const mineKey = taskKeys.mine({});
      const groupedKey = taskKeys.grouped('dept-1');

      queryClient.setQueryData(detailKey, task1);
      queryClient.setQueryData<PaginatedResponse<Task>>(listKey, {
        data: [task1],
        meta: { page: 1, perPage: 10, total: 1, totalPages: 1 },
      });
      queryClient.setQueryData<Task[]>(mineKey, [task1]);
      queryClient.setQueryData<GroupedDepartmentTasks>(groupedKey, {
        viewerRole: 'admin',
        myTasks: [task1],
        managerGroups: [],
        employeeGroups: [],
        unassigned: [task1],
        members: [],
      });

      // Reject with a Network Error (e.g. offline / CORS / connection failure)
      apiMocks.patch.mockRejectedValue(new TypeError('Failed to fetch'));

      const hook = getHook();
      await act(async () => {
        try {
          await hook.mutateAsync({
            id: 'task-1',
            status: TaskStatus.COMPLETED,
            title: 'Network Fail Title',
          });
        } catch (err) {
          expect(err).toBeInstanceOf(TypeError);
        }
      });

      // Verify complete rollback across all shapes
      expect(queryClient.getQueryData<Task>(detailKey)?.title).toBe('Original Task 1');
      expect(queryClient.getQueryData<Task>(detailKey)?.status).toBe(TaskStatus.TODO);

      expect(queryClient.getQueryData<PaginatedResponse<Task>>(listKey)?.data[0]?.title).toBe(
        'Original Task 1',
      );
      expect(queryClient.getQueryData<PaginatedResponse<Task>>(listKey)?.data[0]?.status).toBe(
        TaskStatus.TODO,
      );

      expect(queryClient.getQueryData<Task[]>(mineKey)?.[0]?.title).toBe('Original Task 1');
      expect(queryClient.getQueryData<GroupedDepartmentTasks>(groupedKey)?.myTasks[0]?.title).toBe(
        'Original Task 1',
      );
      expect(
        queryClient.getQueryData<GroupedDepartmentTasks>(groupedKey)?.unassigned[0]?.title,
      ).toBe('Original Task 1');
    });

    it('accurately rolls back ALL cache shapes on 500 Server Error', async () => {
      const queryClient = createTestQueryClient();
      const getHook = mountUpdateTaskHook(queryClient);

      const task1 = makeTask('task-1', { title: 'Pre-Server Error Title' });
      const detailKey = taskKeys.detail('task-1');
      queryClient.setQueryData(detailKey, task1);

      apiMocks.patch.mockRejectedValue(new Error('500 Internal Server Error'));

      const hook = getHook();
      await act(async () => {
        try {
          await hook.mutateAsync({ id: 'task-1', title: 'Should Be Rolled Back' });
        } catch (err) {
          expect((err as Error).message).toBe('500 Internal Server Error');
        }
      });

      expect(queryClient.getQueryData<Task>(detailKey)?.title).toBe('Pre-Server Error Title');
    });

    it('cancels outgoing queries for taskKeys.all before snapshotting data', async () => {
      const queryClient = createTestQueryClient();
      const cancelSpy = vi.spyOn(queryClient, 'cancelQueries');
      const getHook = mountUpdateTaskHook(queryClient);

      const task1 = makeTask('task-1');
      queryClient.setQueryData(taskKeys.detail('task-1'), task1);

      apiMocks.patch.mockResolvedValue({ data: { ...task1, title: 'Updated' } });

      const hook = getHook();
      await act(async () => {
        await hook.mutateAsync({ id: 'task-1', title: 'Updated' });
      });

      expect(cancelSpy).toHaveBeenCalledWith({ queryKey: taskKeys.all });
    });

    it('ignores non-matching task IDs in simple task arrays', async () => {
      const queryClient = createTestQueryClient();
      const getHook = mountUpdateTaskHook(queryClient);

      const task1 = makeTask('task-1', { title: 'Task 1' });
      const task2 = makeTask('task-2', { title: 'Task 2' });
      const mineKey = taskKeys.mine({});

      queryClient.setQueryData<Task[]>(mineKey, [task1, task2]);

      let resolvePatch!: (v: unknown) => void;
      apiMocks.patch.mockReturnValue(
        new Promise((res) => {
          resolvePatch = res;
        }),
      );

      const hook = getHook();
      let mutationPromise: Promise<Task> | undefined;
      act(() => {
        mutationPromise = hook.mutateAsync({ id: 'task-1', title: 'Task 1 Modified' });
      });
      await act(async () => {
        await Promise.resolve();
      });

      const mineData = queryClient.getQueryData<Task[]>(mineKey);
      expect(mineData?.[0]?.title).toBe('Task 1 Modified');
      expect(mineData?.[1]?.title).toBe('Task 2');

      await act(async () => {
        resolvePatch({ data: { ...task1, title: 'Task 1 Modified' } });
        await mutationPromise;
      });
    });

    it('handles partial GroupedDepartmentTasks where optional groups are null/undefined', async () => {
      const queryClient = createTestQueryClient();
      const getHook = mountUpdateTaskHook(queryClient);

      const task1 = makeTask('task-1', { title: 'Task 1' });
      const groupedKey = taskKeys.grouped('dept-1');

      // Seed with minimal grouped tasks object missing unassigned / managerGroups
      queryClient.setQueryData<Partial<GroupedDepartmentTasks>>(groupedKey, {
        viewerRole: 'admin',
        myTasks: [task1],
      });

      let resolvePatch!: (v: unknown) => void;
      apiMocks.patch.mockReturnValue(
        new Promise((res) => {
          resolvePatch = res;
        }),
      );

      const hook = getHook();
      let mutationPromise: Promise<Task> | undefined;
      act(() => {
        mutationPromise = hook.mutateAsync({ id: 'task-1', title: 'Task 1 Partial Update' });
      });
      await act(async () => {
        await Promise.resolve();
      });

      const updated = queryClient.getQueryData<GroupedDepartmentTasks>(groupedKey);
      expect(updated?.myTasks[0]?.title).toBe('Task 1 Partial Update');

      await act(async () => {
        resolvePatch({ data: { ...task1, title: 'Task 1 Partial Update' } });
        await mutationPromise;
      });
    });

    it('verifies concurrent optimistic updates on different tasks in parallel', async () => {
      const queryClient = createTestQueryClient();
      const getHook = mountUpdateTaskHook(queryClient);

      const task1 = makeTask('task-1', { title: 'Task 1' });
      const task2 = makeTask('task-2', { title: 'Task 2' });
      const mineKey = taskKeys.mine({});

      queryClient.setQueryData<Task[]>(mineKey, [task1, task2]);

      let resolvePatch1!: (v: unknown) => void;
      let resolvePatch2!: (v: unknown) => void;

      apiMocks.patch
        .mockImplementationOnce(
          () =>
            new Promise((res) => {
              resolvePatch1 = res;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((res) => {
              resolvePatch2 = res;
            }),
        );

      const hook = getHook();
      let p1: Promise<Task> | undefined;
      let p2: Promise<Task> | undefined;

      act(() => {
        p1 = hook.mutateAsync({ id: 'task-1', title: 'Task 1 Concurrently Updated' });
        p2 = hook.mutateAsync({ id: 'task-2', title: 'Task 2 Concurrently Updated' });
      });
      await act(async () => {
        await Promise.resolve();
      });

      const currentMine = queryClient.getQueryData<Task[]>(mineKey);
      expect(currentMine?.find((t) => t.id === 'task-1')?.title).toBe(
        'Task 1 Concurrently Updated',
      );
      expect(currentMine?.find((t) => t.id === 'task-2')?.title).toBe(
        'Task 2 Concurrently Updated',
      );

      await act(async () => {
        resolvePatch1({ data: { ...task1, title: 'Task 1 Concurrently Updated' } });
        resolvePatch2({ data: { ...task2, title: 'Task 2 Concurrently Updated' } });
        await Promise.all([p1, p2]);
      });
    });
  });
});
