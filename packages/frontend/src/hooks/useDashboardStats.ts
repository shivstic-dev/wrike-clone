import type { DashboardOverviewFilters } from '../api/dashboard';
import { useDashboardOverview } from '../api/dashboard';

export function useDashboardStats(
  filters?: DashboardOverviewFilters,
  enabled = true,
) {
  const effectiveFilters: DashboardOverviewFilters = {
    departmentId: filters?.departmentId,
    days: filters?.days ?? 30,
  };
  return useDashboardOverview(effectiveFilters, enabled);
}

export type { DashboardOverviewFilters };
