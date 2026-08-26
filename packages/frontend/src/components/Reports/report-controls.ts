import type { ReportFilters, ReportScope } from '../../api/reports';

export interface DescribedReportFilters extends ReportFilters {
  departmentName?: string;
  assigneeName?: string;
  targetUserName?: string;
}

export function defaultReportScope(tenantRole?: string, departmentRole?: string): ReportScope {
  if (tenantRole === 'admin') return 'combined';
  return departmentRole === 'manager' || departmentRole === 'department_head' ? 'combined' : 'self';
}

export function allowedReportScopes(tenantRole?: string, departmentRole?: string): ReportScope[] {
  return tenantRole === 'admin' ||
    departmentRole === 'admin' ||
    departmentRole === 'department_head' ||
    departmentRole === 'manager'
    ? ['self', 'individual', 'combined']
    : ['self'];
}

export function permittedReportMembers<T extends { userId: string; role: string }>(
  members: T[],
  viewerRole: string | undefined,
  currentUserId: string | undefined,
): T[] {
  if (viewerRole === 'employee') {
    return members.filter((member) => member.userId === currentUserId);
  }
  if (viewerRole === 'manager') {
    return members.filter(
      (member) => member.userId === currentUserId || member.role === 'employee',
    );
  }
  return members;
}

export function canExportReport(enabled: boolean, taskCount: number, exporting: boolean): boolean {
  return enabled && taskCount > 0 && !exporting;
}

export function buildReportParams(filters: ReportFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).flatMap(([key, value]) => {
      if (value === undefined) return [];
      const normalizedValue = String(value).trim();
      return normalizedValue ? [[key, normalizedValue]] : [];
    }),
  );
}

const STATUS_LABELS: Record<NonNullable<ReportFilters['status']>, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

const PRIORITY_LABELS: Record<NonNullable<ReportFilters['priority']>, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const SCOPE_LABELS: Record<ReportScope, string> = {
  self: 'My tasks',
  individual: 'One person',
  combined: 'Combined team',
};

export function describeActiveReportFilters(filters: DescribedReportFilters): string {
  const descriptions: string[] = [];

  if (filters.departmentId) {
    descriptions.push(`Department: ${filters.departmentName || filters.departmentId}`);
  }
  if (filters.scope) {
    const scopeLabel =
      filters.scope === 'individual' && filters.targetUserName
        ? filters.targetUserName
        : SCOPE_LABELS[filters.scope];
    descriptions.push(`Scope: ${scopeLabel}`);
  }
  if (filters.status) descriptions.push(`Status: ${STATUS_LABELS[filters.status]}`);
  if (filters.priority) descriptions.push(`Priority: ${PRIORITY_LABELS[filters.priority]}`);
  if (filters.assigneeId) {
    descriptions.push(`Assignee: ${filters.assigneeName || filters.assigneeId}`);
  }
  if (filters.dateFrom) descriptions.push(`Created from: ${filters.dateFrom}`);
  if (filters.dateTo) descriptions.push(`Created to: ${filters.dateTo}`);

  return descriptions.length > 0 ? descriptions.join(' · ') : 'No active filters';
}
