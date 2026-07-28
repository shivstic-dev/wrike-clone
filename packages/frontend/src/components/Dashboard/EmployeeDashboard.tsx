import { lazy, Suspense, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardOverview, Task } from '@wrike-clone/shared';
import type { DepartmentTaskGroup, GroupedDepartmentTasks } from '../../api/tasks';
import { AttentionQueue } from './AttentionQueue';
import { DepartmentPulse } from './DepartmentPulse';
import { ProgressPanel } from './ProgressPanel';

const WorkMovementChart = lazy(() => import('./WorkMovementChart'));
const DistributionChart = lazy(() => import('./DistributionChart'));

export interface RoleCompositionProps {
  overview: DashboardOverview;
  grouped?: GroupedDepartmentTasks;
}

function ChartLoading() {
  return (
    <div className="workboard-card grid min-h-72 place-items-center rounded-2xl border border-atlas-mist bg-white text-sm text-slate-500">
      Loading live chart…
    </div>
  );
}

export function AtlasPanel({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="workboard-card h-full overflow-hidden rounded-2xl border border-atlas-mist bg-white">
      <header className="border-b border-atlas-mist px-5 py-4">
        <p className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.12em] text-atlas-current">
          {eyebrow}
        </p>
        <h2 className="mt-1 font-atlasDisplay text-lg font-semibold text-atlas-ink">{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function OverviewCore({ overview }: Pick<RoleCompositionProps, 'overview'>) {
  return <DepartmentPulse overview={overview} />;
}

export function WorkMovementPanel({ overview }: { overview: DashboardOverview }) {
  return (
    <div className="h-full min-w-0">
      <span className="sr-only">Work movement</span>
      <Suspense fallback={<ChartLoading />}>
        <WorkMovementChart generatedAt={overview.generatedAt} daily={overview.daily} />
      </Suspense>
    </div>
  );
}

export function TaskList({ tasks, title }: { tasks: Task[]; title: string }) {
  const visibleTasks = tasks.slice(0, 5);

  return (
    <AtlasPanel eyebrow={`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`} title={title}>
      {tasks.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-600">No tasks are available in this lane.</p>
      ) : (
        <ul className="divide-y divide-atlas-mist px-5">
          {visibleTasks.map((task) => (
            <li key={task.id}>
              <Link
                to={`/tasks/${task.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3 outline-none hover:text-atlas-current focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-atlas-current"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-atlas-ink">
                  {task.title}
                </span>
                <span className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.08em] text-slate-500">
                  {task.status.replace(/_/g, ' ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {tasks.length > visibleTasks.length && (
        <p className="border-t border-atlas-mist bg-slate-50 px-5 py-3 text-xs text-slate-500">
          {tasks.length - visibleTasks.length} more tasks in this lane
        </p>
      )}
    </AtlasPanel>
  );
}

export function PeopleWork({ groups, title }: { groups: DepartmentTaskGroup[]; title: string }) {
  return (
    <AtlasPanel
      eyebrow={`${groups.length} ${groups.length === 1 ? 'person' : 'people'}`}
      title={title}
    >
      {groups.length === 0 ? (
        <div className="px-5 py-8 text-sm text-slate-600">
          No grouped work is available in this lane.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-atlas-mist bg-slate-50 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-slate-500">
                <th className="px-5 py-3 font-medium" scope="col">
                  Person
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Tasks
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Open
                </th>
                <th className="px-5 py-3 font-medium" scope="col">
                  Current item
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const currentTask =
                  group.tasks.find((task) => task.status !== 'completed') ?? group.tasks[0];
                const openCount = group.tasks.filter((task) => task.status !== 'completed').length;

                return (
                  <tr className="border-b border-atlas-mist last:border-0" key={group.user.userId}>
                    <th className="px-5 py-3 font-semibold text-atlas-ink" scope="row">
                      {group.user.displayName || group.user.email}
                    </th>
                    <td className="px-4 py-3 text-right font-atlasMono text-slate-600">
                      {group.tasks.length}
                    </td>
                    <td className="px-4 py-3 text-right font-atlasMono text-atlas-ink">
                      {openCount}
                    </td>
                    <td className="max-w-64 px-5 py-3">
                      {currentTask ? (
                        <Link
                          className="block truncate font-medium text-atlas-current hover:text-atlas-canopy"
                          to={`/tasks/${currentTask.id}`}
                        >
                          {currentTask.title}
                        </Link>
                      ) : (
                        <span className="text-slate-400">No tasks</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AtlasPanel>
  );
}

export function EmployeeDashboard({ overview }: RoleCompositionProps) {
  return (
    <div className="space-y-5" data-dashboard-role="employee">
      <OverviewCore overview={overview} />
      <div className="grid items-stretch gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <WorkMovementPanel overview={overview} />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <AttentionQueue attention={overview.attention} />
        </div>
        <div className="min-w-0 xl:col-span-7">
          <span className="sr-only">My workload</span>
          <Suspense fallback={<ChartLoading />}>
            <DistributionChart
              title="My workload"
              description="Your current task count grouped by status."
              generatedAt={overview.generatedAt}
              values={overview.byStatus}
            />
          </Suspense>
        </div>
        <div className="min-w-0 xl:col-span-5">
          <ProgressPanel overview={overview} />
        </div>
      </div>
    </div>
  );
}
