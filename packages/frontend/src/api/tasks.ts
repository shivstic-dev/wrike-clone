import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import apiClient from './client';
import type {
  Task,
  TaskFilterParams,
  CreateTaskRequest,
  UpdateTaskRequest,
  PaginatedResponse,
  BulkTaskCompletionResult,
  TaskCompletionOutcome,
} from '@wrike-clone/shared';

// ---- Query key factory ----
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters: TaskFilterParams) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  mine: (filters: TaskFilterParams) => [...taskKeys.all, 'mine', filters] as const,
  grouped: (departmentId: string) => [...taskKeys.all, 'grouped', departmentId] as const,
};

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

export interface DepartmentTaskGroup {
  user: {
    userId: string;
    displayName: string;
    email: string;
    role: 'employee' | 'manager' | 'department_head';
  };
  tasks: Task[];
}

export interface GroupedDepartmentTasks {
  viewerRole: 'admin' | 'department_head' | 'manager';
  myTasks: Task[];
  managerGroups: DepartmentTaskGroup[];
  employeeGroups: DepartmentTaskGroup[];
  unassigned: Task[];
  members: DepartmentTaskGroup['user'][];
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

export function useTasks(filters: TaskFilterParams = {}, enabled = true) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: async () => {
      const params = buildTaskSearchParams(filters);
      const { data } = await apiClient.get<PaginatedResponse<Task>>(`/tasks?${params.toString()}`);
      return data;
    },
    enabled,
  });
}

export function useMyTasks(filters: TaskFilterParams = {}, enabled = true) {
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
  });
}

export function useGroupedDepartmentTasks(departmentId: string, enabled = true) {
  return useQuery({
    queryKey: taskKeys.grouped(departmentId),
    queryFn: async () => {
      const { data } = await apiClient.get<GroupedDepartmentTasks>(
        `/departments/${departmentId}/tasks/grouped`,
      );
      return data;
    },
    enabled: enabled && !!departmentId,
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
      invalidateTaskDependentQueries(queryClient);
      queryClient.setQueryData(taskKeys.detail(task.id), task);
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
      invalidateTaskDependentQueries(queryClient);
      queryClient.setQueryData(taskKeys.detail(task.id), task);
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
    onSuccess: () => {
      invalidateTaskDependentQueries(queryClient);
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateTaskRequest & { id: string }) => {
      const { data } = await apiClient.patch<Task>(`/tasks/${id}`, input);
      return data;
    },
    onSuccess: (result) => {
      invalidateTaskDependentQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(result.id) });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      outcome,
    }: {
      taskId: string;
      outcome: TaskCompletionOutcome;
    }) => {
      const { data } = await apiClient.post<Task>(`/tasks/${taskId}/completion`, { outcome });
      return data;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      invalidateTaskDependentQueries(queryClient);
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
        queryClient.setQueryData(taskKeys.detail(task.id), task);
      }
      invalidateTaskDependentQueries(queryClient);
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
      invalidateTaskDependentQueries(queryClient);
    },
  });
}

