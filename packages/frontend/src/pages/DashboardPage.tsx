import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { DashboardTaskBucket, Task } from '@wrike-clone/shared';
import { useDashboardTasks } from '../api/dashboard';
import { useDashboardStats } from '../hooks/useDashboardStats';
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
import { DashboardTaskDrawer } from '../components/Dashboard/DashboardTaskDrawer';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';

const TimelineView = lazy(() =>
  import('../components/Gantt/TimelineView').then((module) => ({
    default: module.TimelineView,
  })),
);

const DashboardBoard = lazy(() =>
  import('../components/Dashboard/DashboardBoard').then((module) => ({
    default: module.DashboardBoard,
  })),
);

const DashboardAnalytics = lazy(() =>
  import('../components/Dashboard/DashboardAnalytics').then((module) => ({
    default: module.DashboardAnalytics,
  })),
);

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
    <section className="workboard-card overflow-hidden rounded-2xl border border-atlas-mist bg-white">
      <header className="flex items-center justify-between gap-4 border-b border-atlas-mist px-5 py-4">
        <h2 className="font-atlasDisplay text-lg font-semibold text-atlas-ink">{title}</h2>
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
      <h2 className="font-atlasMono text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
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

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading dashboard overview">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex h-[132px] flex-col justify-between rounded-2xl border border-atlas-mist bg-white p-5"
          >
            <Skeleton className="h-4 w-24" />
            <div>
              <Skeleton className="mb-2 h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-atlas-mist bg-white">
        <div className="border-b border-atlas-mist px-5 py-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="divide-y divide-atlas-mist">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedBucket, setSelectedBucket] = useState<DashboardTaskBucket | null>(null);
  const departmentId = searchParams.get('department') || '';
  const requestedView = searchParams.get('view');
  const view =
    requestedView === 'timeline' || requestedView === 'board' || requestedView === 'analytics'
      ? requestedView
      : 'overview';
  const { membership, user } = useAuth();
  const departments = useWorkspaces();
  const departmentList = departments.data ?? [];
  const tenantAdmin = membership?.role === 'admin';
  const selectedDepartment = departmentList.find((department) => department.id === departmentId);
  const departmentRole = selectedDepartment?.departmentRole || (tenantAdmin ? 'admin' : 'none');
  const managementView =
    tenantAdmin ||
    departmentRole === 'admin' ||
    departmentRole === 'department_head' ||
    departmentRole === 'manager';
  const boardPrincipalKey = [
    membership?.tenantId || user?.tenantId || 'no-tenant',
    membership?.id || 'no-membership',
    user?.id || 'no-user',
  ].join(':');

  const grouped = useGroupedDepartmentTasks(departmentId, managementView && !!departmentId);
  const mine = useMyTasks({ departmentId: departmentId || undefined, perPage: 100 });
  const overviewEnabled = tenantAdmin || !!departmentId;
  const overview = useDashboardStats(
    { departmentId: departmentId || undefined, days: 30 },
    overviewEnabled,
  );
  const dashboardTasks = useDashboardTasks(
    {
      bucket: selectedBucket ?? 'active',
      departmentId: departmentId || undefined,
      days: 30,
    },
    overviewEnabled && selectedBucket !== null,
  );

  const members = useWorkspaceMembers(departmentId);
  const canChangeRoles = !!departmentId && (tenantAdmin || departmentRole === 'department_head');
  const changes = useDepartmentRoleChanges(departmentId, canChangeRoles);
  const changeRole = useChangeDepartmentRole();

  useEffect(() => {
    if (!tenantAdmin && !departmentId && departmentList.length > 0) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('department', departmentList[0]!.id);
          return next;
        },
        { replace: true },
      );
    }
  }, [departmentId, departmentList, setSearchParams, tenantAdmin]);

  function selectDepartment(nextDepartmentId: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (nextDepartmentId) next.set('department', nextDepartmentId);
        else next.delete('department');
        return next;
      },
      { replace: true },
    );
  }

  function selectView(nextView: 'overview' | 'board' | 'timeline' | 'analytics') {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (nextView === 'overview') next.delete('view');
        else next.set('view', nextView);
        return next;
      },
      { replace: true },
    );
  }

  function selectBucket(bucket: DashboardTaskBucket) {
    setSelectedBucket(bucket);
  }

  const closeDashboardTaskDrawer = useCallback(() => setSelectedBucket(null), []);

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
      ? 'Live operations, workload, and access signals in one view.'
      : attentionCount === 0
        ? 'No open work is currently flagged for attention.'
        : `${attentionCount} ${attentionCount === 1 ? 'item needs' : 'items need'} attention in this scope.`;
  const generatedAt = overview.data?.generatedAt
    ? new Date(overview.data.generatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const usableGrouped = grouped.error ? undefined : grouped.data;
  const showGroupedFallback = managementView && !!departmentId && !overview.data && !!usableGrouped;
  const showPersonalTasks = !managementView || !departmentId || !usableGrouped;

  return (
    <div className="workboard-canvas min-h-full p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[96rem]">
        <div className="space-y-5">
          <header className="flex flex-col gap-5 rounded-[1.5rem] border border-atlas-mist bg-white px-5 py-5 shadow-[0_12px_40px_rgba(13,59,42,0.05)] sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="font-atlasMono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-atlas-current">
                {scopeName} · Operations overview
              </p>
              <h1 className="mt-1 font-atlasDisplay text-3xl font-semibold tracking-[-0.045em] text-atlas-ink sm:text-4xl">
                Dashboard
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                <span className="font-semibold text-atlas-ink">
                  {greeting(user?.displayName, user?.email)}
                </span>{' '}
                {scopeSummary}
              </p>
            </div>

            <div
              className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[22rem]"
              id="departments"
              tabIndex={-1}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.1em] text-slate-500">
                  {generatedAt ? `Updated ${generatedAt}` : 'Loading live data'}
                </span>
                <button
                  className="text-xs font-semibold text-atlas-current hover:text-atlas-canopy disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!overviewEnabled || overview.isFetching}
                  onClick={() => void overview.refetch()}
                  type="button"
                >
                  {overview.isFetching ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              <label className="sr-only" htmlFor="dashboard-department">
                Department
              </label>
              <select
                className="block w-full rounded-xl border-atlas-mist bg-atlas-paper text-sm font-semibold text-atlas-ink shadow-sm focus:border-atlas-current focus:ring-atlas-current"
                disabled={departments.isLoading || departmentList.length === 0}
                id="dashboard-department"
                onChange={(event) => selectDepartment(event.target.value)}
                value={departmentId}
              >
                {tenantAdmin && <option value="">All departments</option>}
                {departmentList.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-atlas-canopy px-4 text-sm font-semibold text-atlas-canopy transition-colors hover:bg-atlas-canopy hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current"
                to="/reports"
              >
                Open reports
              </Link>
            </div>
          </header>

          <div
            aria-label="Dashboard view"
            className="inline-flex w-fit rounded-xl border border-atlas-mist bg-white p-1 shadow-sm"
            role="group"
          >
            {(['overview', 'board', 'timeline', 'analytics'] as const).map((option) => (
              <button
                key={option}
                aria-pressed={view === option}
                className={
                  view === option
                    ? 'rounded-lg bg-atlas-canopy px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-atlas-paper'
                }
                onClick={() => selectView(option)}
                type="button"
              >
                {option === 'overview'
                  ? 'Overview'
                  : option === 'board'
                    ? 'Board'
                    : option === 'timeline'
                      ? 'Timeline'
                      : 'Analytics'}
              </button>
            ))}
          </div>

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
                <h2 className="font-atlasDisplay text-lg font-semibold text-atlas-ink">
                  No department is available
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Ask an administrator to add you to a department.
                </p>
              </section>
            )}

          {view === 'timeline' && overviewEnabled && (
            <Suspense fallback={<LoadingSpinner className="py-16" size="lg" />}>
              <TimelineView
                scope={{
                  kind: 'dashboard',
                  departmentId: departmentId || undefined,
                }}
              />
            </Suspense>
          )}

          {view === 'board' && overviewEnabled && (
            <Suspense fallback={<LoadingSpinner className="py-16" size="lg" />}>
              <DashboardBoard
                currentUserId={user?.id}
                departmentId={departmentId || undefined}
                departmentRole={departmentRole}
                members={members.data || []}
                membersError={members.error}
                membersReady={!members.isLoading && !members.error}
                onRetryMembers={() => void members.refetch()}
                principalKey={boardPrincipalKey}
                tenantRole={membership?.role}
              />
            </Suspense>
          )}

          {view === 'analytics' && overviewEnabled && (
            <Suspense fallback={<LoadingSpinner className="py-16" size="lg" />}>
              <DashboardAnalytics departmentId={departmentId || undefined} />
            </Suspense>
          )}

          {view === 'overview' && overviewEnabled && overview.isLoading && <DashboardSkeleton />}

          {view === 'overview' && overviewEnabled && overview.error && (
            <ErrorDisplay
              title="The live overview is unavailable"
              message="Task lanes remain available below while the overview is retried."
              onRetry={() => void overview.refetch()}
            />
          )}

          {view === 'overview' && overview.data && (
            <RoleDashboard
              grouped={usableGrouped}
              onSelectBucket={selectBucket}
              overview={overview.data}
            />
          )}

          {view === 'overview' &&
            ((managementView && !!departmentId && grouped.error) ||
              (showPersonalTasks && mine.error)) && (
              <ErrorDisplay
                title="Task lanes are unavailable"
                message="The live overview remains available while task lanes are retried."
                onRetry={() => {
                  if (managementView && departmentId) void grouped.refetch();
                  if (showPersonalTasks) void mine.refetch();
                }}
              />
            )}

          {view === 'overview' && showPersonalTasks && mine.isLoading && (
            <LoadingSpinner className="py-10" size="md" />
          )}
          {view === 'overview' && showPersonalTasks && mine.data && (
            <TaskSection title="My tasks" tasks={mine.data.data} />
          )}

          {view === 'overview' && managementView && !!departmentId && grouped.isLoading && (
            <LoadingSpinner className="py-10" size="md" />
          )}
          {view === 'overview' && showGroupedFallback && (
            <GroupedTaskLedger grouped={usableGrouped!} />
          )}

          {view === 'overview' && tenantAdmin && !departmentId && (
            <section className="workboard-card rounded-2xl border border-atlas-mist bg-white px-5 py-5">
              <p className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.12em] text-atlas-current">
                Department stewardship
              </p>
              <h2 className="mt-1 font-atlasDisplay text-lg font-semibold text-atlas-ink">
                Access activity
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Select a department to review its live member roles and audited role changes.
              </p>
            </section>
          )}

          {view === 'overview' && canChangeRoles && (
            <section className="workboard-card overflow-hidden rounded-2xl border border-atlas-mist bg-white">
              <header className="border-b border-atlas-mist px-5 py-4">
                <p className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.12em] text-atlas-current">
                  Department stewardship
                </p>
                <h2 className="mt-1 font-atlasDisplay text-lg font-semibold text-atlas-ink">
                  Access activity
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Team roles are audited whenever an employee or manager assignment changes.
                </p>
              </header>

              {members.isLoading ? (
                <div className="px-5 py-8 text-center">
                  <LoadingSpinner className="py-2" size="sm" />
                  <p className="mt-2 text-sm text-slate-600">Loading team roles…</p>
                </div>
              ) : members.error ? (
                <ErrorDisplay
                  className="rounded-none border-0 shadow-none"
                  title="Team roles are unavailable"
                  message="The member list could not be loaded."
                  onRetry={() => void members.refetch()}
                />
              ) : (members.data || []).length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-600">
                  No department members are available.
                </p>
              ) : (
                <div className="divide-y divide-atlas-mist">
                  {members.data!.map((member) => (
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
              )}

              <div className="border-t border-atlas-mist bg-slate-50 px-5 py-4">
                <h3 className="font-atlasMono text-xs font-medium uppercase tracking-[0.1em] text-atlas-current">
                  Recent role changes
                </h3>
                {changes.isLoading ? (
                  <div className="py-4 text-center">
                    <LoadingSpinner className="py-1" size="sm" />
                    <p className="mt-2 text-xs text-slate-600">Loading role-change history…</p>
                  </div>
                ) : changes.error ? (
                  <ErrorDisplay
                    className="mt-3 border-rose-200 px-4 py-6 shadow-none"
                    title="Role-change history is unavailable"
                    message="The audit trail could not be loaded."
                    onRetry={() => void changes.refetch()}
                  />
                ) : (changes.data || []).length === 0 ? (
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
      {selectedBucket && (
        <DashboardTaskDrawer
          bucket={selectedBucket}
          onClose={closeDashboardTaskDrawer}
          query={dashboardTasks}
        />
      )}
    </div>
  );
}
