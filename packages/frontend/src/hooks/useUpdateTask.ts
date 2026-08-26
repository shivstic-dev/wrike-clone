import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Task, UpdateTaskRequest } from '@wrike-clone/shared';
import { updateTask, taskKeys, type GroupedDepartmentTasks } from '../api/tasks';
import { applyTaskToCache } from '../lib/taskCache';

export interface OptimisticUpdateContext {
  previousTasks: Array<[readonly unknown[], unknown]>;
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation<Task, Error, UpdateTaskRequest & { id: string }, OptimisticUpdateContext>({
    mutationFn: (variables) => updateTask(variables),

    onMutate: async (variables) => {
      const { id, ...input } = variables;

      // Cancel any outgoing refetches for ['tasks'] so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: taskKeys.all });

      // Snapshot previous query data for all task query keys to allow rollback
      const previousTasks = queryClient.getQueriesData<unknown>({ queryKey: taskKeys.all });

      applyTaskToCache(queryClient, { id, ...input }, { upsert: false });

      return { previousTasks };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousTasks) {
        for (const [queryKey, oldData] of context.previousTasks) {
          queryClient.setQueryData(queryKey, oldData);
        }
      }
    },

    onSuccess: (task) => {
      // Reconcile optimistic state with the authoritative server response.
      // No broad invalidation — realtime broadcasts and adaptive polling keep
      // derived views (dashboard/reports/etc.) fresh without a refetch storm.
      applyTaskToCache(queryClient, task, { upsert: false });
    },
  });
}
