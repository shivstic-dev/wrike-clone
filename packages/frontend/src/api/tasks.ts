import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';
import type {
  Task,
  TaskFilterParams,
  CreateTaskRequest,
  UpdateTaskRequest,
  PaginatedResponse,
} from '@wrike-clone/shared';

// ---- Query key factory ----
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters: TaskFilterParams) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
};

// ---- Hooks ----

export function useTasks(filters: TaskFilterParams = {}) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.perPage) params.set('perPage', String(filters.perPage));
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.sortDirection) params.set('sortDirection', filters.sortDirection);
      if (filters.projectId) params.set('projectId', filters.projectId);
      if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
      if (filters.status?.length) params.set('status', filters.status.join(','));
      if (filters.priority?.length) params.set('priority', filters.priority.join(','));
      if (filters.search) params.set('search', filters.search);
      if (filters.dueDateBefore) params.set('dueDateBefore', filters.dueDateBefore);
      if (filters.dueDateAfter) params.set('dueDateAfter', filters.dueDateAfter);

      const { data } = await apiClient.get<PaginatedResponse<Task>>(
        `/tasks?${params.toString()}`,
      );
      return data;
    },
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get(`/tasks/${id}`);
      // Backend returns task object directly, not wrapped in { data: ... }
      if (response.data?.data) return response.data.data as Task;
      return response.data as Task;
    },
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskRequest) => {
      const { data } = await apiClient.post<{ data: Task }>('/tasks', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateTaskRequest & { id: string }) => {
      const { data } = await apiClient.patch<{ data: Task }>(`/tasks/${id}`, input);
      return data.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(result.id) });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
