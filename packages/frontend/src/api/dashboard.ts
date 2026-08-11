import { queryOptions, useQuery } from '@tanstack/react-query';
import type {
  DashboardAnalyticsQuery,
  DashboardAnalyticsResponse,
  DashboardOverview,
  DashboardTaskBucket,
  DashboardTaskListResponse,
} from '@wrike-clone/shared';
import apiClient from './client';

export interface DashboardOverviewFilters {
  departmentId?: string;
  days: 30;
}

export interface DashboardTaskFilters extends DashboardOverviewFilters {
  bucket: DashboardTaskBucket;
}

export type DashboardAnalyticsFilters = DashboardAnalyticsQuery;

export function buildDashboardParams(filters: DashboardOverviewFilters): URLSearchParams {
  const params = new URLSearchParams();
  const departmentId = filters.departmentId?.trim();

  if (departmentId) params.set('departmentId', departmentId);
  params.set('days', String(filters.days));

  return params;
}

export function buildDashboardTaskParams(filters: DashboardTaskFilters): URLSearchParams {
  const params = buildDashboardParams(filters);
  params.set('bucket', filters.bucket);
  return params;
}

export function buildDashboardAnalyticsParams(
  filters: DashboardAnalyticsFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  const departmentId = filters.departmentId?.trim();
  const projectId = filters.projectId?.trim();
  if (departmentId) params.set('departmentId', departmentId);
  if (projectId) params.set('projectId', projectId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  params.set('groupBy', filters.groupBy);
  return params;
}

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overviews: () => [...dashboardKeys.all, 'overview'] as const,
  overview: (filters: DashboardOverviewFilters) =>
    [...dashboardKeys.overviews(), buildDashboardParams(filters).toString()] as const,
  tasks: () => [...dashboardKeys.all, 'tasks'] as const,
  taskList: (filters: DashboardTaskFilters) =>
    [...dashboardKeys.tasks(), buildDashboardTaskParams(filters).toString()] as const,
  analytics: (filters: DashboardAnalyticsFilters) =>
    [...dashboardKeys.all, 'analytics', buildDashboardAnalyticsParams(filters).toString()] as const,
};

export async function requestDashboardOverview(
  filters: DashboardOverviewFilters,
): Promise<DashboardOverview> {
  const { data } = await apiClient.get<DashboardOverview>('/dashboard/overview', {
    params: buildDashboardParams(filters),
  });
  return data;
}

export async function requestDashboardTasks(
  filters: DashboardTaskFilters,
): Promise<DashboardTaskListResponse> {
  const { data } = await apiClient.get<DashboardTaskListResponse>('/dashboard/tasks', {
    params: buildDashboardTaskParams(filters),
  });
  return data;
}

export function dashboardOverviewQueryOptions(
  filters: DashboardOverviewFilters,
  enabled = true,
) {
  return queryOptions({
    queryKey: dashboardKeys.overview(filters),
    queryFn: () => requestDashboardOverview(filters),
    enabled,
  });
}

export function useDashboardOverview(filters: DashboardOverviewFilters, enabled = true) {
  return useQuery(dashboardOverviewQueryOptions(filters, enabled));
}

export function dashboardTasksQueryOptions(filters: DashboardTaskFilters, enabled = true) {
  return queryOptions({
    queryKey: dashboardKeys.taskList(filters),
    queryFn: () => requestDashboardTasks(filters),
    enabled,
  });
}

export function useDashboardTasks(filters: DashboardTaskFilters, enabled = true) {
  return useQuery(dashboardTasksQueryOptions(filters, enabled));
}

export async function requestDashboardAnalytics(
  filters: DashboardAnalyticsFilters,
): Promise<DashboardAnalyticsResponse> {
  const { data } = await apiClient.get<DashboardAnalyticsResponse>('/dashboard/analytics', {
    params: buildDashboardAnalyticsParams(filters),
  });
  return data;
}

export function useDashboardAnalytics(filters: DashboardAnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.analytics(filters),
    queryFn: () => requestDashboardAnalytics(filters),
    enabled,
  });
}

export async function requestDashboardAnalyticsExport(
  filters: DashboardAnalyticsFilters,
  format: 'pdf' | 'xlsx',
): Promise<Blob> {
  const params = buildDashboardAnalyticsParams(filters);
  params.set('format', format);
  const { data } = await apiClient.get<Blob>('/dashboard/analytics/export', {
    params,
    responseType: 'blob',
  });
  return data;
}
