/**
 * Leaf module for task query keys and shared shapes.
 * Kept dependency-free so both api/tasks.ts and lib/taskCache.ts can import
 * it without cycles.
 */

import type { Task, TaskFilterParams } from '@wrike-clone/shared';

// ---- Query key factory ----
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters: TaskFilterParams) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  mine: (filters: TaskFilterParams) => [...taskKeys.all, 'mine', filters] as const,
  grouped: (departmentId: string) => [...taskKeys.all, 'grouped', departmentId] as const,
  allList: (filters: TaskFilterParams, principalKey = 'anonymous') =>
    [...taskKeys.all, 'all-list', principalKey, filters] as const,
};

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
