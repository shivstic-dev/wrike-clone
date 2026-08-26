import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import apiClient from './client';
import { taskKeys, type GroupedDepartmentTasks } from './taskQueryKeys';
import type {
  Task,
  TaskFilterParams,
  CreateTaskRequest,
  UpdateTaskRequest,
  PaginatedResponse,
  BulkTaskCompletionResult,
  TaskCompletionOutcome,
} from '@wrike-clone/shared';
import { applyTaskToCache, removeTaskFromCache } from '../lib/taskCache';
import { adaptivePollingRefetchInterval } from '../hooks/useAdaptivePolling';
import { useRealtimeActive } from '../hooks/useTaskRealtime';

export { taskKeys };
export type { GroupedDepartmentTasks, DepartmentTaskGroup } from './taskQueryKeys';

// ---- Query key factory ----
export const taskDependentQueryKeys = [
  ['tasks'],
  ['reports'],
  ['workspaces'],
  ['folders'],
  ['notifications'],
  ['dashboard'],
  ['timeline'],
] as const;

/** Views whose dates can change when a task schedule is moved on the timeline. */
export const scheduleDependentQueryKeys = [
  ['tasks'],
  ['dashboard'],
  ['calendar'],
  ['projects'],
] as const;

export function invalidateTaskDependentQueries(queryClient: QueryClient): void {
  for (const queryKey of taskDependentQueryKeys) {
    queryClient.invalidateQueries({ queryKey });
  }
}

export function buildTaskSearchParams(filters: TaskFilterParams): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.perPage) params.set('perPage', String(filters.perPage));
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortDirection) params.set('sortDirection', filters.sortDirection);
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.folderId) params.set('folderId', filters.folderId);
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  if (filters.status?.length) params.set('status', filters.status.join(','));
  if (filters.priority?.length) params.set('priority', filters.priority.join(','));
  if (filters.handoffStatus) params.set('handoffStatus', filters.handoffStatus);
  if (filters.search) params.set('search', filters.search);
  if (filters.dueDateBefore) params.set('dueDateBefore', filters.dueDateBefore);
  if (filters.dueDateAfter) params.set('dueDateAfter', filters.dueDateAfter);
  return params;
}

// ---- Hooks ----

/** Shared refetchInterval: realtime-first, adaptive polling as fallback. */
function useTaskRefetchInterval() {
  const realtimeActive = useRealtimeActive();
  return () => adaptivePollingRefetchInterval(realtimeActive);
}

export function useTasks(filters: TaskFilterParams = {}, enabled = true) {
  const refetchInterval = useTaskRefetchInterval();
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: async () => {
      const params = buildTaskSearchParams(filters);
      const { data } = await apiClient.get<PaginatedResponse<Task>>(`/tasks?${params.toString()}`);
      return data;
    },
    enabled,
    refetchInterval,
  });
}

export async function fetchAllTasks(filters: TaskFilterParams = {}): Promise<Task[]> {
  const collected: Task[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const params = buildTaskSearchParams(filters);
    params.set('page', String(page));
    params.set('perPage', '1000');
    const { data } = await apiClient.get<PaginatedResponse<Task>>(`/tasks?${params.toString()}`);
    collected.push(...data.data);
    totalPages = data.meta.totalPages;
    page += 1;
  } while (page <= totalPages);
  return collected;
}

export function useAllTasks(
  filters: TaskFilterParams = {},
  enabled = true,
  principalKey = 'anonymous',
) {
  const refetchInterval = useTaskRefetchInterval();
  return useQuery({
    queryKey: taskKeys.allList(filters, principalKey),
    queryFn: () => fetchAllTasks(filters),
    enabled,
    refetchInterval,
  });
}

export function useMyTasks(filters: TaskFilterParams = {}, enabled = true) {
  const refetchInterval = useTaskRefetchInterval();
  return useQuery({
    queryKey: taskKeys.mine(filters),
    queryFn: async () => {
      const params = buildTaskSearchParams(filters);
      const { data } = await apiClient.get<PaginatedResponse<Task>>(
        `/tasks/my?${params.toString()}`,
      );
      return data;
    },
    enabled,
    refetchInterval,
  });
}

export function useGroupedDepartmentTasks(departmentId: string, enabled = true) {
  const refetchInterval = useTaskRefetchInterval();
  return useQuery({
    queryKey: taskKeys.grouped(departmentId),
    queryFn: async () => {
      const { data } = await apiClient.get<GroupedDepartmentTasks>(
        `/departments/${departmentId}/tasks/grouped`,
      );
      return data;
    },
    enabled: enabled && !!departmentId,
    refetchInterval,
  });
}

export function useAddTaskAssignee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: string; userId: string }) => {
      const { data } = await apiClient.post<Task>(`/tasks/${taskId}/assignees`, { userId });
      return data;
    },
    onSuccess: (task) => {
      applyTaskToCache(queryClient, task);
    },
  });
}

export function useRemoveTaskAssignee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: string; userId: string }) => {
      const { data } = await apiClient.delete<Task>(`/tasks/${taskId}/assignees/${userId}`);
      return data;
    },
    onSuccess: (task) => {
      applyTaskToCache(queryClient, task);
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
      const { data } = await apiClient.post<Task>('/tasks', input);
      return data;
    },
    // New tasks may not match every active list filter, so refetch only the
    // ['tasks'] family once — realtime broadcasts keep other clients fresh.
    onSuccess: (task) => {
      applyTaskToCache(queryClient, task);
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export async function updateTask({
  id,
  ...input
}: UpdateTaskRequest & { id: string }): Promise<Task> {
  const { data } = await apiClient.patch<Task>(`/tasks/${id}`, input);
  return data;
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, outcome }: { taskId: string; outcome: TaskCompletionOutcome }) => {
      const { data } = await apiClient.post<Task>(`/tasks/${taskId}/completion`, { outcome });
      return data;
    },
    onSuccess: (task) => {
      applyTaskToCache(queryClient, task);
    },
  });
}

export function useBulkCompleteTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      items,
    }: {
      items: Array<{ taskId: string; outcome: TaskCompletionOutcome }>;
    }) => {
      const { data } = await apiClient.post<BulkTaskCompletionResult>('/tasks/bulk-completion', {
        items,
      });
      return data;
    },
    onSuccess: (result) => {
      for (const task of result.data) {
        applyTaskToCache(queryClient, task);
      }
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/tasks/${id}`);
      return id;
    },
    onSuccess: (id) => {
      removeTaskFromCache(queryClient, id);
    },
  });
}
