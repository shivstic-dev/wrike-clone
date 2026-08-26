// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DependencyType, type TimelineResponse } from '@wrike-clone/shared';
import apiClient from './client';
import {
  requestTimeline,
  timelineKeys,
  useCreateDependency,
  useDeleteDependency,
  useUpdateDependency,
  useUpdateTaskSchedule,
} from './timeline';

vi.mock('./client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.patch).mockReset();
  vi.mocked(apiClient.delete).mockReset();
});

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => root.unmount());
    container.remove();
  }
  mountedRoots = [];
});

function mountMutation<TInput>(
  client: QueryClient,
  hook: () => { mutateAsync: (input: TInput) => Promise<unknown> },
) {
  let mutateAsync: ((input: TInput) => Promise<unknown>) | undefined;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  act(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(() => {
          mutateAsync = hook().mutateAsync;
          return null;
        }),
      ),
    ),
  );
  return async (input: TInput) => {
    let result: unknown;
    await act(async () => {
      result = await mutateAsync?.(input);
    });
    return result;
  };
}

const query = { from: '2026-07-01', to: '2026-07-31', perPage: 50, includeCriticalPath: true };
const timeline: TimelineResponse = {
  tasks: [],
  unscheduled: [],
  dependencies: [],
  meta: { from: query.from, to: query.to, nextCursor: null },
};

describe('timeline API', () => {
  it('normalizes dashboard queries and has canonical cache keys', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: timeline });
    await expect(
      requestTimeline({ kind: 'dashboard', departmentId: ' department-1 ' }, query),
    ).resolves.toBe(timeline);
    const [, config] = vi.mocked(apiClient.get).mock.calls[0] ?? [];
    expect(apiClient.get).toHaveBeenCalledWith('/timeline', expect.any(Object));
    expect(config?.params?.toString()).toBe(
      'from=2026-07-01&to=2026-07-31&departmentId=department-1&perPage=50&includeCriticalPath=true',
    );
    expect(timelineKeys.scope({ kind: 'dashboard', departmentId: 'department-1' }, query)).toEqual([
      'timeline',
      'dashboard',
      'department-1',
      'from=2026-07-01&to=2026-07-31&departmentId=department-1&perPage=50&includeCriticalPath=true',
    ]);
  });

  it('uses the project route and does not pass a projectId query parameter', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: timeline });
    await requestTimeline(
      { kind: 'project', projectId: 'project-1' },
      { ...query, projectId: 'ignored' },
    );
    const [, config] = vi.mocked(apiClient.get).mock.calls[0] ?? [];
    expect(apiClient.get).toHaveBeenCalledWith('/projects/project-1/timeline', expect.any(Object));
    expect(config?.params?.toString()).not.toContain('projectId');
  });

  it('optimistically updates schedules and rolls back every matching timeline cache on error', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = timelineKeys.scope({ kind: 'dashboard' }, query);
    const previous = {
      ...timeline,
      tasks: [{ id: 'task-1', startDate: '2026-07-02', dueDate: '2026-07-03' }],
    } as TimelineResponse;
    client.setQueryData(key, previous);
    const setQueryData = vi.spyOn(client, 'setQueryData');
    vi.mocked(apiClient.patch).mockRejectedValueOnce(new Error('offline'));
    const mutate = mountMutation(client, useUpdateTaskSchedule);
    await expect(
      mutate({
        taskId: 'task-1',
        startDate: '2026-07-04',
        dueDate: '2026-07-05',
        expectedUpdatedAt: 'v1',
      }),
    ).rejects.toThrow('offline');
    expect(apiClient.patch).toHaveBeenCalledWith('/tasks/task-1/schedule', {
      startDate: '2026-07-04',
      dueDate: '2026-07-05',
      expectedUpdatedAt: 'v1',
    });
    expect(client.getQueryData(key)).toEqual(previous);
    expect(setQueryData).toHaveBeenLastCalledWith(key, previous);
  });

  it('uses dependency create, update, and delete routes', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'dep-1' } });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { id: 'dep-1' } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    await mountMutation(
      client,
      useCreateDependency,
    )({
      taskId: 'task-1',
      dependsOnTaskId: 'task-0',
      dependencyType: DependencyType.FINISH_TO_START,
      lagDays: 2,
    });
    await mountMutation(
      client,
      useUpdateDependency,
    )({ id: 'dep-1', dependencyType: DependencyType.START_TO_START, lagDays: 0 });
    await mountMutation(client, useDeleteDependency)('dep-1');
    expect(apiClient.post).toHaveBeenCalledWith('/tasks/dependencies', expect.any(Object));
    expect(apiClient.patch).toHaveBeenCalledWith('/tasks/dependencies/dep-1', {
      dependencyType: DependencyType.START_TO_START,
      lagDays: 0,
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/tasks/dependencies/dep-1');
  });
});
