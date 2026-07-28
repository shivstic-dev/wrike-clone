import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { Task } from '@wrike-clone/shared';
import { useDashboardOverview } from '../api/dashboard';
import {
  useGroupedDepartmentTasks,
  useMyTasks,
  type DepartmentTaskGroup,
  type GroupedDepartmentTasks,
} from '../api/tasks';
import {
  useChangeDepartmentRole,
  useDepartmentRoleChanges,
  useWorkspaceMembers,
  useWorkspaces,
} from '../api/workspaces';
import { RoleDashboard } from '../components/Dashboard/RoleDashboard';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';

function AssigneeChips({ task }: { task: Task }) {
  if (!task.assignees?.length) {
    return <span className="text-xs text-slate-500">Unassigned</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {task.assignees.map((assignee) => (
        <span
          key={assignee.id || assignee.userId}
          className="rounded-full bg-atlas-mist px-2 py-0.5 text-[0.6875rem] text-atlas-canopy"
        >
          {assignee.displayName || assignee.email || 'Member'}
        </span>
      ))}
    </div>
  );
}
function TaskSection({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-atlas-mist bg-white shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b border-atlas-mist px-5 py-4">
        <h2 className="font-atlasDisplay text-lg font-bold text-atlas-ink">{title}</h2>
        <span className="rounded-full bg-atlas-paper px-2.5 py-1 font-atlasMono text-xs text-atlas-current">
          {tasks.length}
        </span>
      </header>
      {tasks.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-600">No tasks are available in this lane.</p>
      ) : (
        <div className="divide-y divide-atlas-mist">
          {tasks.map((task) => (
            <Link
              key={task.id}
              to={`/tasks/${task.id}`}
              className="flex flex-wrap items-center gap-3 px-5 py-3 outline-none hover:bg-atlas-paper focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-atlas-current"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-atlas-ink">
                {task.title}
              </span>
              <AssigneeChips task={task} />
              <span className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.08em] text-slate-500">
                {task.status.replace(/_/g, ' ')}
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
      <h2 className="font-atlasMono text-xs font-medium uppercase tracking-[0.1em] text-atlas-current">
        {label}
      </h2>
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

function GroupedTaskLedger({ grouped }: { grouped: GroupedDepartmentTasks }) {
  return (
    <section className="space-y-4" aria-label="Department task ledger">
      <TaskSection title="My tasks" tasks={grouped.myTasks} />
      <PeopleSections label="Managers" groups={grouped.managerGroups} />
      <PeopleSections label="Employees" groups={grouped.employeeGroups} />
      <TaskSection title="Unassigned" tasks={grouped.unassigned} />
    </section>
  );
}

function greeting(displayName?: string | null, email?: string): string {
  const label = displayName || email || '';
  const firstName = label.split(/[\s@]/).filter(Boolean)[0];
  const hour = new Date().getHours();
  const dayPart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return firstName ? `Good ${dayPart}, ${firstName}.` : `Good ${dayPart}.`;
}

export default function DashboardPage() {
  const [departmentId, setDepartmentId] = useState('');
  const { membership, user } = useAuth();
  const departments = useWorkspaces();
  const departmentList = departments.data ?? [];
  const tenantAdmin = membership?.role === 'admin';
  const selectedDepartment = departmentList.find(
    (department) => department.id === departmentId,
  );
  const departmentRole = selectedDepartment?.departmentRole || (tenantAdmin ? 'admin' : 'none');
  const managementView =
    tenantAdmin ||
    departmentRole === 'admin' ||
    departmentRole === 'department_head' ||
    departmentRole === 'manager';

  const grouped = useGroupedDepartmentTasks(departmentId, managementView && !!departmentId);
  const mine = useMyTasks(
    { departmentId: departmentId || undefined, perPage: 100 },
    !!departmentId && !managementView,
  );
  const overviewEnabled = tenantAdmin || !!departmentId;
  const overview = useDashboardOverview(
    { departmentId: departmentId || undefined, days: 30 },
    overviewEnabled,
  );

  const members = useWorkspaceMembers(departmentId);
  const canChangeRoles =
    !!departmentId && (tenantAdmin || departmentRole === 'department_head');
  const changes = useDepartmentRoleChanges(departmentId, canChangeRoles);
  const changeRole = useChangeDepartmentRole();

  useEffect(() => {
    if (!tenantAdmin && !departmentId && departmentList.length > 0) {
      setDepartmentId(departmentList[0]!.id);
    }
  }, [departmentId, departmentList, tenantAdmin]);

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

  const scopeName = departmentId
    ? selectedDepartment?.name || 'Selected department'
    : 'All departments';
  const attentionCount = overview.data?.attention.length;
  const scopeSummary =
    attentionCount === undefined
      ? 'Live operations, workload, and access signals in one field note.'
      : attentionCount === 0
        ? 'No open work is currently flagged for attention.'
        : `${attentionCount} ${attentionCount === 1 ? 'item needs' : 'items need'} attention in this scope.`;

  const showGroupedFallback =
    managementView && !!departmentId && !overview.data && !!grouped.data;
  const showPersonalTasks = !managementView && !!departmentId;

  return (
    <div className="min-h-full bg-atlas-paper p-3 sm:p-6">
      <div className="mx-auto max-w-[96rem] overflow-hidden rounded-[1.75rem] border border-atlas-mist bg-atlas-paper shadow-[0_24px_70px_rgba(18,60,58,0.12)]">
        <div className="h-2 bg-atlas-canopy" />
        <div className="space-y-5 p-4 sm:p-6 lg:p-8">
          <header className="flex flex-col gap-5 border-b border-atlas-mist pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="font-atlasMono text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-atlas-current">
                {scopeName} · Department pulse
              </p>
              <h1 className="mt-2 font-atlasDisplay text-3xl font-bold tracking-[-0.045em] text-atlas-ink sm:text-4xl">
                {greeting(user?.displayName, user?.email)}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{scopeSummary}</p>
            </div>

            <label className="text-xs font-semibold text-atlas-ink">
              Department
              <select
                className="mt-1 block min-w-64 rounded-xl border-atlas-mist bg-white text-sm shadow-sm focus:border-atlas-current focus:ring-atlas-current"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                disabled={departments.isLoading || departmentList.length === 0}
              >
                {tenantAdmin && <option value="">All departments</option>}
                {departmentList.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
          </header>

          {departments.error && (
            <ErrorDisplay
              title="Departments are unavailable"
              message="The department selector could not be loaded."
              onRetry={() => void departments.refetch()}
            />
          )}

          {departments.isLoading && departmentList.length === 0 && (
            <LoadingSpinner className="py-16" size="lg" />
          )}

          {!departments.isLoading &&
            !departments.error &&
            departmentList.length === 0 &&
            !tenantAdmin && (
              <section className="rounded-2xl border border-dashed border-atlas-mist bg-white px-6 py-12 text-center">
                <h2 className="font-atlasDisplay text-lg font-bold text-atlas-ink">
                  No department is available
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Ask an administrator to add you to a department.
                </p>
              </section>
            )}

          {overviewEnabled && overview.isLoading && (
            <section
              aria-label="Loading dashboard overview"
              className="rounded-2xl border border-atlas-mist bg-white"
            >
              <LoadingSpinner className="py-16" size="lg" />
            </section>
          )}

          {overviewEnabled && overview.error && (
            <ErrorDisplay
              title="The live overview is unavailable"
              message="Task lanes remain available below while the overview is retried."
              onRetry={() => void overview.refetch()}
            />
          )}

          {overview.data && (
            <RoleDashboard
              overview={overview.data}
              grouped={grouped.data}
              onRetryOverview={() => void overview.refetch()}
            />
          )}

          {(grouped.error || mine.error) && (
            <ErrorDisplay
              title="Task lanes are unavailable"
              message="The live overview remains available while task lanes are retried."
              onRetry={() => {
                if (managementView) void grouped.refetch();
                else void mine.refetch();
              }}
            />
          )}

          {showPersonalTasks && mine.isLoading && (
            <LoadingSpinner className="py-10" size="md" />
          )}
          {showPersonalTasks && mine.data && (
            <TaskSection title="My tasks" tasks={mine.data.data} />
          )}

          {managementView && !!departmentId && grouped.isLoading && (
            <LoadingSpinner className="py-10" size="md" />
          )}
          {showGroupedFallback && <GroupedTaskLedger grouped={grouped.data!} />}

          {tenantAdmin && !departmentId && (
            <section className="rounded-2xl border border-atlas-mist bg-white px-5 py-5 shadow-sm">
              <p className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.12em] text-atlas-current">
                Department stewardship
              </p>
              <h2 className="mt-1 font-atlasDisplay text-lg font-bold text-atlas-ink">
                Access activity
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Select a department to review its live member roles and audited role changes.
              </p>
            </section>
          )}

          {canChangeRoles && (
            <section className="overflow-hidden rounded-2xl border border-atlas-mist bg-white shadow-sm">
              <header className="border-b border-atlas-mist px-5 py-4">
                <p className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.12em] text-atlas-current">
                  Department stewardship
                </p>
                <h2 className="mt-1 font-atlasDisplay text-lg font-bold text-atlas-ink">
                  Access activity
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Team roles are audited whenever an employee or manager assignment changes.
                </p>
              </header>

              <div className="divide-y divide-atlas-mist">
                {(members.data || []).map((member) => (
                  <div key={member.userId} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-atlas-ink">
                        {member.displayName || member.email}
                      </p>
                      <p className="text-xs text-slate-500">{member.email}</p>
                    </div>
                    {member.role === 'department_head' ? (
                      <span className="text-xs font-semibold text-atlas-current">
                        Department head
                      </span>
                    ) : (
                      <select
                        aria-label={`Role for ${member.displayName || member.email}`}
                        className="w-36 rounded-lg border-atlas-mist text-sm focus:border-atlas-current focus:ring-atlas-current"
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

              <div className="border-t border-atlas-mist bg-atlas-paper px-5 py-4">
                <h3 className="font-atlasMono text-xs font-medium uppercase tracking-[0.1em] text-atlas-current">
                  Recent role changes
                </h3>
                {(changes.data || []).length === 0 ? (
                  <p className="mt-2 text-xs text-slate-600">
                    No recent role changes are recorded.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 text-xs text-slate-600">
                    {changes.data!.slice(0, 5).map((entry) => (
                      <li key={entry.id}>
                        <span className="font-semibold text-atlas-ink">
                          {entry.userName || entry.userEmail}
                        </span>
                        : {entry.oldRole} → {entry.newRole} by{' '}
                        {entry.changedByName || 'former administrator'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
