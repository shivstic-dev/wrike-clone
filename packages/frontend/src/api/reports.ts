import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import apiClient from './client';
import { buildReportParams } from '../components/Reports/report-controls';

export type ReportScope = 'self' | 'individual' | 'combined';

export interface ReportFilters {
  departmentId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'todo' | 'in_progress' | 'completed' | 'blocked';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assigneeId?: string;
  scope?: ReportScope;
  targetUserId?: string;
}

export interface DepartmentReport {
  generatedAt: string;
  filters: Record<string, string | undefined>;
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
  tasks: Array<{
    id: string;
    departmentName: string;
    title: string;
    assigneeName: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
  }>;
}

export function useDepartmentReport(filters: ReportFilters, enabled = true) {
  const params = buildReportParams(filters);

  return useQuery({
    queryKey: ['reports', 'departments', params],
    queryFn: () => requestDepartmentReport(filters),
    enabled,
  });
}

export async function requestDepartmentReport(filters: ReportFilters): Promise<DepartmentReport> {
  const { data } = await apiClient.get<DepartmentReport>('/reports/departments', {
    params: buildReportParams(filters),
  });
  return data;
}

const EXPORT_ERROR_FALLBACK = 'The report could not be exported. Please retry.';

export async function reportExportErrorMessage(error: unknown): Promise<string> {
  if (!axios.isAxiosError(error)) return EXPORT_ERROR_FALLBACK;

  const responseData = error.response?.data;
  const payload = responseData instanceof Blob ? await responseData.text() : responseData;

  try {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const message =
      typeof parsed?.error?.message === 'string'
        ? parsed.error.message
        : typeof parsed?.message === 'string'
          ? parsed.message
          : undefined;
    return message || EXPORT_ERROR_FALLBACK;
  } catch {
    return EXPORT_ERROR_FALLBACK;
  }
}

export async function downloadDepartmentReport(
  filters: ReportFilters,
  format: 'pdf' | 'xlsx',
): Promise<void> {
  let response;
  try {
    const params = buildReportParams(filters);
    response = await apiClient.get('/reports/departments/export', {
      params: { ...params, format },
      responseType: 'blob',
    });
  } catch (error) {
    throw new Error(await reportExportErrorMessage(error));
  }
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
