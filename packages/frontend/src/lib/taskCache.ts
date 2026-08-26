/**
 * React Query cache patchers for task changes.
 *
 * Used by both optimistic mutations and the Supabase Realtime subscriber so
 * that every writer applies identical, shape-aware updates instead of
 * triggering broad invalidation refetch cascades against a sleepy free-tier
 * backend.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { Task } from '@wrike-clone/shared';
import { taskKeys } from '../api/taskQueryKeys';
import type { GroupedDepartmentTasks } from '../api/taskQueryKeys';

type AnyTask = Task & Record<string, unknown>;

function mergeTask(existing: AnyTask, incoming: Partial<Task>): AnyTask {
  return { ...existing, ...incoming };
}

/**
 * Merge an updated/created task into every cached query shape it appears in.
 *
 * `upsert: false` (updates) only rewrites existing entries — never inserts —
 * which keeps filtered/paginated lists from receiving items they didn't ask
 * for. Creation flows pass `upsert: true`.
 */
export function applyTaskToCache(
  queryClient: QueryClient,
  task: Partial<Task> & { id: string },
  { upsert = true }: { upsert?: boolean } = {},
): void {
  if (!task?.id) return;

  queryClient.setQueriesData<unknown>({ queryKey: taskKeys.all }, (oldData: unknown) => {
    if (!oldData || typeof oldData !== 'object') return oldData;

    // Paginated lists (PaginatedResponse<Task>)
    if ('data' in oldData && Array.isArray((oldData as { data: unknown }).data)) {
      const paginated = oldData as { data: AnyTask[]; [k: string]: unknown };
      const exists = paginated.data.some((t) => t.id === task.id);
      if (!exists && !upsert) return oldData;
      return {
        ...paginated,
        data: exists
          ? paginated.data.map((t) => (t.id === task.id ? mergeTask(t, task) : t))
          : [task, ...paginated.data],
      };
    }

    // Grouped department tasks
    if ('myTasks' in oldData && Array.isArray((oldData as GroupedDepartmentTasks).myTasks)) {
      const grouped = oldData as GroupedDepartmentTasks;
      const mapList = (list: AnyTask[] | null | undefined): AnyTask[] =>
        (list ?? []).map((t) => (t.id === task.id ? mergeTask(t, task) : t));
      return {
        ...grouped,
        myTasks: mapList(grouped.myTasks as AnyTask[] | null),
        unassigned: mapList(grouped.unassigned as AnyTask[] | null),
        managerGroups: (grouped.managerGroups ?? []).map((g) => ({
          ...g,
          tasks: mapList(g.tasks as AnyTask[] | null),
        })),
        employeeGroups: (grouped.employeeGroups ?? []).map((g) => ({
          ...g,
          tasks: mapList(g.tasks as AnyTask[] | null),
        })),
      };
    }

    // Simple task arrays
    if (Array.isArray(oldData)) {
      const list = oldData as AnyTask[];
      const exists = list.some((t) => t.id === task.id);
      if (!exists && !upsert) return oldData;
      return exists
        ? list.map((t) => (t.id === task.id ? mergeTask(t, task) : t))
        : [task, ...list];
    }

    // Single task detail
    if ((oldData as AnyTask).id === task.id) {
      return mergeTask(oldData as AnyTask, task);
    }

    return oldData;
  });

  // Keep the canonical detail entry in sync too.
  const detail = queryClient.getQueryData<AnyTask>(taskKeys.detail(task.id));
  queryClient.setQueryData(taskKeys.detail(task.id), detail ? mergeTask(detail, task) : task);
}

/** Remove a deleted task from every cached query shape. */
export function removeTaskFromCache(queryClient: QueryClient, id: string): void {
  if (!id) return;

  queryClient.setQueriesData<unknown>({ queryKey: taskKeys.all }, (oldData: unknown) => {
    if (Array.isArray(oldData)) {
      return (oldData as AnyTask[]).filter((t) => t.id !== id);
    }
    if (!oldData || typeof oldData !== 'object') return oldData;

    if ('data' in oldData && Array.isArray((oldData as { data: unknown }).data)) {
      const paginated = oldData as {
        data: AnyTask[];
        meta?: { total?: number; totalItems?: number; [k: string]: unknown };
        [k: string]: unknown;
      };
      return {
        ...paginated,
        data: paginated.data.filter((t) => t.id !== id),
        ...(paginated.meta && typeof paginated.meta.total === 'number'
          ? { meta: { ...paginated.meta, total: Math.max(0, paginated.meta.total - 1) } }
          : {}),
      };
    }

    if ('myTasks' in oldData && Array.isArray((oldData as GroupedDepartmentTasks).myTasks)) {
      const grouped = oldData as GroupedDepartmentTasks;
      const filterList = (list: AnyTask[] | null | undefined): AnyTask[] =>
        (list ?? []).filter((t) => t.id !== id);
      return {
        ...grouped,
        myTasks: filterList(grouped.myTasks as AnyTask[] | null),
        unassigned: filterList(grouped.unassigned as AnyTask[] | null),
        managerGroups: (grouped.managerGroups ?? []).map((g) => ({
          ...g,
          tasks: filterList(g.tasks as AnyTask[] | null),
        })),
        employeeGroups: (grouped.employeeGroups ?? []).map((g) => ({
          ...g,
          tasks: filterList(g.tasks as AnyTask[] | null),
        })),
      };
    }

    return oldData;
  });

  queryClient.removeQueries({ queryKey: taskKeys.detail(id) });
}
