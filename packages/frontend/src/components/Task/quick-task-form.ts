import type { CreateTaskRequest } from '@wrike-clone/shared';
import { TaskPriority } from '@wrike-clone/shared';

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
    priority: TaskPriority.LOW,
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

export function normalizeQuickTaskInput(state: QuickTaskFormState): CreateTaskRequest {
  return {
    title: state.title.trim(),
    departmentId: state.departmentId,
    folderId: state.folderId.trim() || undefined,
    projectId: state.projectId.trim() || undefined,
    assigneeIds: state.assigneeIds,
    dueDate: state.dueDate ? new Date(state.dueDate).toISOString() : undefined,
    description: state.description.trim() || undefined,
    priority: state.priority,
    startDate: state.startDate ? new Date(state.startDate).toISOString() : undefined,
    estimatedHours: state.estimatedHours === '' ? undefined : Number(state.estimatedHours),
    visibility: state.visibility,
  };
}

export function canCreateQuickTask(
  departments: Array<{ departmentRole?: string }>,
  tenantRole?: string,
): boolean {
  return (
    tenantRole === 'admin' ||
    departments.some((department) =>
      ['admin', 'department_head', 'manager'].includes(department.departmentRole || ''),
    )
  );
}

export function permittedQuickTaskAssignees<T extends { userId: string; role: string }>(
  members: T[],
  viewerRole: string | undefined,
  currentUserId: string | undefined,
): T[] {
  return viewerRole === 'manager'
    ? members.filter(
        (member) => member.userId === currentUserId || member.role === 'employee',
      )
    : members;
}
