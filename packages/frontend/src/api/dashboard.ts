import { queryOptions, useQuery } from '@tanstack/react-query';
import type { DashboardOverview } from '@wrike-clone/shared';
import apiClient from './client';

export interface DashboardOverviewFilters {
  departmentId?: string;
  days: 30;
}

export function buildDashboardParams(filters: DashboardOverviewFilters): URLSearchParams {
  const params = new URLSearchParams();
  const departmentId = filters.departmentId?.trim();

  if (departmentId) params.set('departmentId', departmentId);
  params.set('days', String(filters.days));

  return params;
}

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overviews: () => [...dashboardKeys.all, 'overview'] as const,
  overview: (filters: DashboardOverviewFilters) =>
    [...dashboardKeys.overviews(), buildDashboardParams(filters).toString()] as const,
};

export async function requestDashboardOverview(
  filters: DashboardOverviewFilters,
): Promise<DashboardOverview> {
  const { data } = await apiClient.get<DashboardOverview>('/dashboard/overview', {
    params: buildDashboardParams(filters),
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
