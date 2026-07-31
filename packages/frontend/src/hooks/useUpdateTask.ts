import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Task, UpdateTaskRequest, PaginatedResponse } from '@wrike-clone/shared';
import {
  updateTask,
  taskKeys,
  invalidateTaskDependentQueries,
  type GroupedDepartmentTasks,
} from '../api/tasks';

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

      // Optimistically update query data in cache
      queryClient.setQueriesData<unknown>({ queryKey: taskKeys.all }, (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') {
          return oldData;
        }

        // Paginated lists (PaginatedResponse<Task>)
        if ('data' in oldData && Array.isArray((oldData as { data: unknown }).data)) {
          const paginated = oldData as PaginatedResponse<Task>;
          return {
            ...paginated,
            data: paginated.data.map((t) => (t.id === id ? { ...t, ...input } : t)),
          };
        }

        // Grouped department tasks (GroupedDepartmentTasks)
        if ('myTasks' in oldData && Array.isArray((oldData as GroupedDepartmentTasks).myTasks)) {
          const grouped = oldData as GroupedDepartmentTasks;
          return {
            ...grouped,
            myTasks: grouped.myTasks ? grouped.myTasks.map((t) => (t.id === id ? { ...t, ...input } : t)) : [],
            unassigned: grouped.unassigned ? grouped.unassigned.map((t) => (t.id === id ? { ...t, ...input } : t)) : [],
            managerGroups: grouped.managerGroups
              ? grouped.managerGroups.map((g) => ({
                  ...g,
                  tasks: g.tasks ? g.tasks.map((t) => (t.id === id ? { ...t, ...input } : t)) : [],
                }))
              : [],
            employeeGroups: grouped.employeeGroups
              ? grouped.employeeGroups.map((g) => ({
                  ...g,
                  tasks: g.tasks ? g.tasks.map((t) => (t.id === id ? { ...t, ...input } : t)) : [],
                }))
              : [],
          };
        }

        // Simple task arrays (Task[])
        if (Array.isArray(oldData)) {
          return (oldData as Task[]).map((t) => (t.id === id ? { ...t, ...input } : t));
        }

        // Single task details (Task)
        if ('id' in oldData && (oldData as Task).id === id) {
          return {
            ...(oldData as Task),
            ...input,
          };
        }

        return oldData;
      });

      return { previousTasks };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousTasks) {
        for (const [queryKey, oldData] of context.previousTasks) {
          queryClient.setQueryData(queryKey, oldData);
        }
      }
    },

    onSettled: (_data, _error, variables) => {
      invalidateTaskDependentQueries(queryClient);
      if (variables?.id) {
        queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.id) });
      }
    },
  });
}
