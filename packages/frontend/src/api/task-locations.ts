import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MoveTaskLocationRequest, Task, TaskLocationOption } from '@wrike-clone/shared';
import apiClient from './client';
import { taskKeys } from './tasks';
import { folderKeys, workspaceKeys } from './workspaces';

export function useTaskLocations(departmentId: string) {
  return useQuery({
    queryKey: ['task-locations', departmentId],
    queryFn: async () => {
      const { data } = await apiClient.get<TaskLocationOption[]>(
        `/departments/${departmentId}/task-locations`,
      );
      return data;
    },
    enabled: !!departmentId,
  });
}

export function useMoveTaskLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      ...input
    }: MoveTaskLocationRequest & { taskId: string }) => {
      const { data } = await apiClient.patch<Task>(`/tasks/${taskId}/location`, input);
      return data;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}
