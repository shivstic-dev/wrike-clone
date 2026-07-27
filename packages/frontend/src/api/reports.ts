import { useQuery } from '@tanstack/react-query';
import apiClient from './client';

export interface ReportFilters {
  departmentId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'todo' | 'in_progress' | 'completed' | 'blocked';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assigneeId?: string;
  scope?: 'self' | 'individual' | 'combined';
  targetUserId?: string;
}

export interface DepartmentReport {
  generatedAt: string;
  scope: {
    departmentId?: string;
    role: string;
    mode: 'self' | 'individual' | 'combined';
    ownTasksOnly: boolean;
  };
  totals: {
    tasks: number;
    completed: number;
    overdue: number;
    averageCompletionHours: number | null;
  };
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byAssignee: Array<{ assignee: string; total: number; completed: number; overdue: number }>;
}

export function useDepartmentReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'departments', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<DepartmentReport>('/reports/departments', {
        params: filters,
      });
      return data;
    },
    enabled,
  });
}

export async function downloadDepartmentReport(
  filters: ReportFilters,
  format: 'pdf' | 'xlsx',
): Promise<void> {
  const response = await apiClient.get('/reports/departments/export', {
    params: { ...filters, format },
    responseType: 'blob',
  });
  const disposition = String(response.headers['content-disposition'] || '');
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] || `department-report.${format}`;
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
