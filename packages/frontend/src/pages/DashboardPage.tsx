import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { Task } from '@wrike-clone/shared';
import { useGroupedDepartmentTasks, useMyTasks, type DepartmentTaskGroup } from '../api/tasks';
import {
  useChangeDepartmentRole,
  useDepartmentRoleChanges,
  useWorkspaceMembers,
  useWorkspaces,
} from '../api/workspaces';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

function AssigneeChips({ task }: { task: Task }) {
  if (!task.assignees?.length) {
    return <span className="text-xs text-slate-400">Unassigned</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {task.assignees.map((assignee) => (
        <span
          key={assignee.id || assignee.userId}
          className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700"
        >
          {assignee.displayName || assignee.email || 'Member'}
        </span>
      ))}
    </div>
  );
}

function TaskSection({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400">No tasks in this section.</p>
      ) : (
        <div className="divide-y">
          {tasks.map((task) => (
            <Link
              key={task.id}
              to={`/tasks/${task.id}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                {task.title}
              </span>
              <AssigneeChips task={task} />
              <span className="text-xs capitalize text-slate-500">
                {task.status.replace('_', ' ')}
              </span>
              <span className="text-xs text-slate-500">
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function PeopleSections({ label, groups }: { label: string; groups: DepartmentTaskGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <TaskSection
            key={group.user.userId}
            title={group.user.displayName || group.user.email}
            tasks={group.tasks}
          />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [departmentId, setDepartmentId] = useState('');
  const { data: departments = [], isLoading: departmentsLoading } = useWorkspaces();
  const selectedDepartment = departments.find((department) => department.id === departmentId);
  const role = selectedDepartment?.departmentRole || 'none';
  const managementView = role === 'admin' || role === 'department_head' || role === 'manager';
  const grouped = useGroupedDepartmentTasks(departmentId, managementView);
  const mine = useMyTasks(
    { departmentId: departmentId || undefined, perPage: 100 },
    !!departmentId && !managementView,
  );
  const members = useWorkspaceMembers(departmentId);
  const canChangeRoles = role === 'admin' || role === 'department_head';
  const changes = useDepartmentRoleChanges(departmentId, canChangeRoles);
  const changeRole = useChangeDepartmentRole();

  useEffect(() => {
    if (!departmentId && departments.length > 0) setDepartmentId(departments[0]!.id);
  }, [departmentId, departments]);

  const visibleTasks = useMemo(() => {
    if (!managementView) return mine.data?.data || [];
    const all = [
      ...(grouped.data?.myTasks || []),
      ...(grouped.data?.managerGroups.flatMap((group) => group.tasks) || []),
      ...(grouped.data?.employeeGroups.flatMap((group) => group.tasks) || []),
      ...(grouped.data?.unassigned || []),
    ];
    return [...new Map(all.map((task) => [task.id, task])).values()];
  }, [grouped.data, managementView, mine.data]);

  const overdue = visibleTasks.filter(
    (task) => task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed',
  ).length;
  const inProgress = visibleTasks.filter((task) => task.status === 'in_progress').length;
  const loading = departmentsLoading || (managementView ? grouped.isLoading : mine.isLoading);
  const error = managementView ? grouped.error : mine.error;

  async function updateRole(
    userId: string,
    oldRole: 'employee' | 'manager',
    nextRole: 'employee' | 'manager',
  ) {
    if (oldRole === nextRole) return;
    if (!window.confirm(`Change this member from ${oldRole} to ${nextRole}?`)) return;
    try {
      await changeRole.mutateAsync({ departmentId, userId, role: nextRole });
      toast.success('Department role updated');
    } catch {
      toast.error('Role change was not allowed');
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Smart Department Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {role === 'employee'
              ? 'Only tasks assigned to you are shown.'
              : role === 'manager'
                ? 'Your tasks and your employees are shown.'
                : 'Managers, employees, and unassigned work are shown.'}
          </p>
        </div>
        <label className="text-xs font-medium text-slate-600">
          Department
          <select
            className="input mt-1 block min-w-56 text-sm"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && <ErrorDisplay message="The dashboard could not be loaded." />}
      {loading ? (
        <LoadingSpinner className="py-16" size="lg" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ['Visible tasks', visibleTasks.length],
              ['In progress', inProgress],
              ['Overdue', overdue],
            ].map(([label, value]) => (
              <div key={label} className="card p-4">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <TaskSection
            title="My tasks"
            tasks={managementView ? grouped.data?.myTasks || [] : visibleTasks}
          />
          {managementView && grouped.data && (
            <>
              <PeopleSections label="Managers" groups={grouped.data.managerGroups} />
              <PeopleSections label="Employees" groups={grouped.data.employeeGroups} />
              <TaskSection title="Unassigned" tasks={grouped.data.unassigned} />
            </>
          )}
        </>
      )}

      {canChangeRoles && (
        <section className="card overflow-hidden">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold text-slate-800">Team roles</h2>
            <p className="text-xs text-slate-500">
              Promote employees to manager or return managers to employee. Every change is audited.
            </p>
          </div>
          <div className="divide-y">
            {(members.data || []).map((member) => (
              <div key={member.userId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.displayName || member.email}
                  </p>
                  <p className="text-xs text-slate-500">{member.email}</p>
                </div>
                {member.role === 'department_head' ? (
                  <span className="text-xs font-medium text-violet-700">Department head</span>
                ) : (
                  <select
                    aria-label={`Role for ${member.displayName || member.email}`}
                    className="input w-36 text-sm"
                    value={member.role}
                    disabled={changeRole.isPending}
                    onChange={(event) =>
                      updateRole(
                        member.userId,
                        member.role as 'employee' | 'manager',
                        event.target.value as 'employee' | 'manager',
                      )
                    }
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                )}
              </div>
            ))}
          </div>
          {(changes.data || []).length > 0 && (
            <div className="border-t bg-slate-50 px-4 py-3">
              <h3 className="text-xs font-semibold uppercase text-slate-500">
                Recent role changes
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {changes.data!.slice(0, 5).map((entry) => (
                  <li key={entry.id}>
                    {entry.userName || entry.userEmail}: {entry.oldRole} → {entry.newRole} by{' '}
                    {entry.changedByName || 'former administrator'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
