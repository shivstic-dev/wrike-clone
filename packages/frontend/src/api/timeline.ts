import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  CreateDependencyRequest,
  TaskDependency,
  TimelineQuery,
  TimelineResponse,
  TimelineScope,
  TimelineTask,
  UpdateDependencyRequest,
  UpdateTaskScheduleRequest,
} from '@wrike-clone/shared';
import apiClient from './client';
import { scheduleDependentQueryKeys, taskKeys } from './tasks';

export interface ScheduleVariables extends UpdateTaskScheduleRequest {
  taskId: string;
}

interface TimelineSnapshot {
  key: readonly unknown[];
  previous: TimelineResponse | undefined;
}

export interface RollbackContext {
  snapshots: TimelineSnapshot[];
}

export const timelineKeys = {
  all: ['timeline'] as const,
  scope: (scope: TimelineScope, query: TimelineQuery): readonly unknown[] => [
    ...timelineKeys.all,
    scope.kind,
    scope.kind === 'project' ? scope.projectId : scope.departmentId?.trim() || 'all',
    buildTimelineParams(scope, query).toString(),
  ],
};

/** Produces the same ordered query string for a request and its cache key. */
export function buildTimelineParams(scope: TimelineScope, query: TimelineQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set('from', query.from.trim());
  params.set('to', query.to.trim());

  const departmentId =
    scope.kind === 'dashboard' ? scope.departmentId?.trim() : query.departmentId?.trim();
  if (departmentId) params.set('departmentId', departmentId);
  if (query.assigneeId?.trim()) params.set('assigneeId', query.assigneeId.trim());
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.cursor?.trim()) params.set('cursor', query.cursor.trim());
  if (query.perPage) params.set('perPage', String(query.perPage));
  if (query.includeCriticalPath) params.set('includeCriticalPath', 'true');
  return params;
}

export async function requestTimeline(
  scope: TimelineScope,
  query: TimelineQuery,
): Promise<TimelineResponse> {
  const url = scope.kind === 'project' ? `/projects/${scope.projectId}/timeline` : '/timeline';
  const { data } = await apiClient.get<TimelineResponse>(url, {
    params: buildTimelineParams(scope, query),
  });
  return data;
}

export function useTimeline(
  scope: TimelineScope,
  query: TimelineQuery,
): UseQueryResult<TimelineResponse> {
  return useQuery({
    queryKey: timelineKeys.scope(scope, query),
    queryFn: () => requestTimeline(scope, query),
    enabled: Boolean(query.from && query.to && (scope.kind !== 'project' || scope.projectId)),
  });
}

function replaceTask(response: TimelineResponse, taskId: string, patch: Pick<TimelineTask, 'startDate' | 'dueDate'>): TimelineResponse {
  const replace = (task: TimelineTask) => task.id === taskId ? { ...task, ...patch } : task;
  return {
    ...response,
    tasks: response.tasks.map(replace),
    unscheduled: response.unscheduled.map(replace),
  };
}

function invalidateTimelineConsumers(queryClient: QueryClient): void {
  const queryKeys = [timelineKeys.all, ...scheduleDependentQueryKeys, taskKeys.all] as const;
  for (const queryKey of queryKeys) queryClient.invalidateQueries({ queryKey });
}

export function useUpdateTaskSchedule(): UseMutationResult<
  TimelineTask,
  Error,
  ScheduleVariables,
  RollbackContext
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, ...body }) => {
      const { data } = await apiClient.patch<TimelineTask>(`/tasks/${taskId}/schedule`, body);
      return data;
    },
    onMutate: async ({ taskId, startDate, dueDate }) => {
      await queryClient.cancelQueries({ queryKey: timelineKeys.all });
      const snapshots = queryClient
        .getQueriesData<TimelineResponse>({ queryKey: timelineKeys.all })
        .map(([key, previous]) => ({ key, previous }));
      for (const snapshot of snapshots) {
        if (snapshot.previous) {
          queryClient.setQueryData(
            snapshot.key,
            replaceTask(snapshot.previous, taskId, { startDate, dueDate }),
          );
        }
      }
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const snapshot of context?.snapshots ?? []) {
        queryClient.setQueryData(snapshot.key, snapshot.previous);
      }
    },
    onSettled: () => invalidateTimelineConsumers(queryClient),
  });
}

export function useCreateDependency(): UseMutationResult<TaskDependency, Error, CreateDependencyRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      const { data } = await apiClient.post<TaskDependency>('/tasks/dependencies', input);
      return data;
    },
    onSettled: () => invalidateTimelineConsumers(queryClient),
  });
}

export function useUpdateDependency(): UseMutationResult<
  TaskDependency,
  Error,
  { id: string } & UpdateDependencyRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) => {
      const { data } = await apiClient.patch<TaskDependency>(`/tasks/dependencies/${id}`, input);
      return data;
    },
    onSettled: () => invalidateTimelineConsumers(queryClient),
  });
}

export function useDeleteDependency(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await apiClient.delete(`/tasks/dependencies/${id}`);
    },
    onSettled: () => invalidateTimelineConsumers(queryClient),
  });
}
