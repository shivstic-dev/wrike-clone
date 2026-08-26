import { useCallback, useMemo, useState } from 'react';
import type { Task, TenantRole } from '@wrike-clone/shared';
import { useAllTasks } from '../../api/tasks';
import { KanbanBoard } from '../Kanban/KanbanBoard';
import { ErrorDisplay } from '../common/ErrorDisplay';
import { LoadingSpinner } from '../common/LoadingSpinner';
import {
  canMoveDashboardTask,
  filterDashboardTasks,
  type DashboardBoardFilters,
  type DashboardBoardMember,
  type DashboardDepartmentRole,
} from './dashboard-board';

interface DashboardBoardProps {
  currentUserId?: string;
  departmentId?: string;
  departmentRole: DashboardDepartmentRole;
  members: DashboardBoardMember[];
  membersError?: Error | null;
  membersReady?: boolean;
  onRetryMembers?: () => void;
  principalKey?: string;
  tenantRole?: TenantRole;
}

const initialFilters: DashboardBoardFilters = {
  search: '',
  projectId: '',
  assigneeId: '',
  priority: '',
  due: 'all',
};
const controlClass =
  'min-h-10 rounded-xl border-atlas-mist bg-white text-sm text-atlas-ink focus:border-atlas-current focus:ring-atlas-current';

export function DashboardBoard({
  currentUserId,
  departmentId,
  departmentRole,
  members,
  membersError,
  membersReady = true,
  onRetryMembers,
  principalKey = 'anonymous',
  tenantRole,
}: DashboardBoardProps) {
  const [filters, setFilters] = useState(initialFilters);
  const tasks = useAllTasks({ departmentId }, true, principalKey);
  const effectiveRole = tenantRole === 'admin' ? 'admin' : departmentRole;
  const visibleTasks = useMemo(
    () => filterDashboardTasks(tasks.data || [], filters),
    [filters, tasks.data],
  );
  const projects = useMemo(() => {
    const options = new Map<string, string>();
    for (const task of tasks.data || [])
      options.set(task.projectId, task.projectName || 'Unnamed project');
    return [...options].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks.data]);
  const assignees = useMemo(() => {
    const options = new Map(
      members.map((member) => [member.userId, member.displayName || member.email]),
    );
    for (const task of tasks.data || [])
      for (const assignee of task.assignees || [])
        options.set(assignee.userId, assignee.displayName || assignee.email || 'Member');
    return [...options].sort((a, b) => a[1].localeCompare(b[1]));
  }, [members, tasks.data]);
  const canMoveTask = useCallback(
    (task: Task) =>
      effectiveRole === 'manager' && !membersReady
        ? false
        : canMoveDashboardTask(task, currentUserId, effectiveRole, members),
    [currentUserId, effectiveRole, members, membersReady],
  );
  const getReadOnlyReason = useCallback(() => {
    if (effectiveRole === 'manager' && !membersReady)
      return 'Task movement is locked until team roles are available.';
    if (effectiveRole === 'manager')
      return 'This task belongs to another manager and is view only.';
    return 'Only tasks assigned to you can be moved.';
  }, [effectiveRole, membersReady]);

  if (tasks.isLoading) return <LoadingSpinner className="py-16" size="lg" />;
  if (tasks.error)
    return (
      <ErrorDisplay
        title="The Board is unavailable"
        message="Tasks could not be loaded."
        onRetry={() => void tasks.refetch()}
      />
    );

  return (
    <section aria-label="Dashboard board" className="space-y-4">
      {effectiveRole === 'manager' && membersError && (
        <ErrorDisplay
          className="px-5 py-6"
          title="Task movement is temporarily unavailable"
          message="Team roles could not be loaded, so all cards remain view only."
          onRetry={onRetryMembers}
        />
      )}
      <div className="workboard-card rounded-2xl border border-atlas-mist bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-52 flex-1 text-xs font-semibold text-slate-600">
            Search tasks
            <input
              className={`${controlClass} mt-1 block w-full`}
              onChange={(event) =>
                setFilters((current) => ({ ...current, search: event.target.value }))
              }
              placeholder="Task, project, or person"
              type="search"
              value={filters.search}
            />
          </label>
          <BoardSelect
            label="Project"
            value={filters.projectId}
            onChange={(projectId) => setFilters((current) => ({ ...current, projectId }))}
          >
            <option value="">All projects</option>
            {projects.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </BoardSelect>
          <BoardSelect
            label="Assignee"
            value={filters.assigneeId}
            onChange={(assigneeId) => setFilters((current) => ({ ...current, assigneeId }))}
          >
            <option value="">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {assignees.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </BoardSelect>
          <BoardSelect
            label="Priority"
            value={filters.priority}
            onChange={(priority) => setFilters((current) => ({ ...current, priority }))}
          >
            <option value="">All priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </BoardSelect>
          <BoardSelect
            label="Due date"
            value={filters.due}
            onChange={(due) =>
              setFilters((current) => ({ ...current, due: due as DashboardBoardFilters['due'] }))
            }
          >
            <option value="all">Any due date</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due in 7 days</option>
            <option value="no_due_date">No due date</option>
          </BoardSelect>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Showing {visibleTasks.length} of {tasks.data?.length || 0} authorized tasks
        </p>
      </div>
      {(tasks.data || []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-atlas-mist bg-white px-6 py-12 text-center text-sm text-slate-600">
          No tasks are available in this scope.
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-atlas-mist bg-white px-6 py-12 text-center text-sm text-slate-600">
          No tasks match these filters.
        </div>
      ) : (
        <KanbanBoard
          tasks={visibleTasks}
          canMoveTask={canMoveTask}
          getReadOnlyReason={getReadOnlyReason}
        />
      )}
    </section>
  );
}

function BoardSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <select
        className={`${controlClass} mt-1 block min-w-36`}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}
