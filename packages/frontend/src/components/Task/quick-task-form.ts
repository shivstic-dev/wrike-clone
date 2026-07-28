import type { CreateTaskRequest, TaskPriority } from '@wrike-clone/shared';
import { TASK_PRIORITY } from '../../api/enums';

export interface QuickTaskFormState {
  title: string;
  departmentId: string;
  folderId: string;
  projectId: string;
  assigneeIds: string[];
  dueDate: string;
  description: string;
  priority: TaskPriority;
  startDate: string;
  estimatedHours: number | '';
  visibility: 'global' | 'department';
}

export function createQuickTaskFormState(departmentId = ''): QuickTaskFormState {
  return {
    title: '',
    departmentId,
    folderId: '',
    projectId: '',
    assigneeIds: [],
    dueDate: '',
    description: '',
    priority: TASK_PRIORITY.LOW as TaskPriority,
    startDate: '',
    estimatedHours: '',
    visibility: 'department',
  };
}

export function changeQuickTaskDepartment(
  state: QuickTaskFormState,
  departmentId: string,
): QuickTaskFormState {
  return {
    ...state,
    departmentId,
    folderId: '',
    projectId: '',
    assigneeIds: [],
  };
}

export function changeQuickTaskFolder(
  state: QuickTaskFormState,
  folderId: string,
): QuickTaskFormState {
  return {
    ...state,
    folderId,
    projectId: '',
  };
}

function normalizeQuickTaskDate(value: string): string | undefined {
  const trimmedValue = value.trim();
  if (!trimmedValue) return undefined;

  const timestamp = new Date(trimmedValue).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function normalizeQuickTaskEstimatedHours(
  value: QuickTaskFormState['estimatedHours'],
): number | undefined {
  if (value === '') return undefined;

  const estimatedHours = Number(value);
  return Number.isFinite(estimatedHours) && estimatedHours >= 0 ? estimatedHours : undefined;
}

export function normalizeQuickTaskInput(state: QuickTaskFormState): CreateTaskRequest {
  return {
    title: state.title.trim(),
    departmentId: state.departmentId,
    folderId: state.folderId.trim() || undefined,
    projectId: state.projectId.trim() || undefined,
    assigneeIds: state.assigneeIds,
    dueDate: normalizeQuickTaskDate(state.dueDate),
    description: state.description.trim() || undefined,
    priority: state.priority,
    startDate: normalizeQuickTaskDate(state.startDate),
    estimatedHours: normalizeQuickTaskEstimatedHours(state.estimatedHours),
    visibility: state.visibility,
  };
}

export function canCreateQuickTask<T extends { departmentRole?: string }>(
  departments: T[],
  tenantRole?: string,
): boolean {
  return (
    tenantRole === 'admin' ||
    departments.some((department) =>
      ['admin', 'department_head', 'manager'].includes(department.departmentRole || ''),
    )
  );
}

export function creatableQuickTaskDepartments<T extends { departmentRole?: string }>(
  departments: T[],
  tenantRole?: string,
): T[] {
  return tenantRole === 'admin'
    ? departments
    : departments.filter((department) =>
        ['admin', 'department_head', 'manager'].includes(department.departmentRole || ''),
      );
}

export function resolveQuickTaskInitialDepartmentId(
  routeDepartmentId: string | undefined,
  departments: Array<{ id: string }>,
): string {
  return departments.some((department) => department.id === routeDepartmentId)
    ? routeDepartmentId || ''
    : '';
}

export function canSetQuickTaskVisibility(
  tenantRole: string | undefined,
  departmentRole: string | undefined,
): boolean {
  return (
    tenantRole === 'admin' || departmentRole === 'admin' || departmentRole === 'department_head'
  );
}

export function permittedQuickTaskAssignees<T extends { userId: string; role: string }>(
  members: T[],
  viewerRole: string | undefined,
  currentUserId: string | undefined,
): T[] {
  const assignableMembers = members.filter((member) => member.role !== 'admin');
  return viewerRole === 'manager'
    ? assignableMembers.filter(
        (member) => member.userId === currentUserId || member.role === 'employee',
      )
    : assignableMembers;
}
