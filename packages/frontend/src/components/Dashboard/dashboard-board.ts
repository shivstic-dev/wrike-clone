import type { Task } from '@wrike-clone/shared';

export type DashboardDepartmentRole = 'admin' | 'department_head' | 'manager' | 'employee' | 'none';

export interface DashboardBoardMember {
  userId: string;
  displayName: string;
  email: string;
  role: 'admin' | 'employee' | 'manager' | 'department_head';
}

export interface DashboardBoardFilters {
  search: string;
  projectId: string;
  assigneeId: string;
  priority: string;
  due: 'all' | 'overdue' | 'due_soon' | 'no_due_date';
}

function assignedUserIds(task: Task): string[] {
  return Array.from(
    new Set([
      ...(task.assigneeId ? [task.assigneeId] : []),
      ...(task.assignees || []).map((assignee) => assignee.userId),
    ]),
  );
}

export function canMoveDashboardTask(
  task: Task,
  currentUserId: string | undefined,
  departmentRole: DashboardDepartmentRole,
  members: DashboardBoardMember[],
): boolean {
  if (departmentRole === 'admin' || departmentRole === 'department_head') return true;
  if (!currentUserId) return false;
  const assigneeIds = assignedUserIds(task);
  if (departmentRole === 'employee') return assigneeIds.includes(currentUserId);
  if (departmentRole !== 'manager') return false;
  const roleByUserId = new Map(members.map((member) => [member.userId, member.role]));
  return !assigneeIds.some(
    (userId) => userId !== currentUserId && roleByUserId.get(userId) === 'manager',
  );
}

export function filterDashboardTasks(
  tasks: Task[],
  filters: DashboardBoardFilters,
  now = new Date(),
): Task[] {
  const search = filters.search.trim().toLocaleLowerCase();
  const dueSoon = new Date(now);
  dueSoon.setDate(dueSoon.getDate() + 7);
  return tasks.filter((task) => {
    const searchable = [
      task.title,
      task.projectName,
      ...(task.assignees || []).flatMap((assignee) => [assignee.displayName, assignee.email]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    if (search && !searchable.includes(search)) return false;
    if (filters.projectId && task.projectId !== filters.projectId) return false;
    if (filters.assigneeId) {
      const assignees = assignedUserIds(task);
      if (
        filters.assigneeId === 'unassigned'
          ? assignees.length > 0
          : !assignees.includes(filters.assigneeId)
      )
        return false;
    }
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.due === 'no_due_date') return !task.dueDate;
    if (filters.due === 'all') return true;
    if (!task.dueDate || task.status === 'completed') return false;
    const dueDate = new Date(task.dueDate);
    if (filters.due === 'overdue') return dueDate < now;
    return dueDate >= now && dueDate <= dueSoon;
  });
}
