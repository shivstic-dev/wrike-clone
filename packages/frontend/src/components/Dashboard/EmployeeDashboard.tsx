import { lazy, Suspense, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardOverview, Task } from '@wrike-clone/shared';
import type { DepartmentTaskGroup, GroupedDepartmentTasks } from '../../api/tasks';
import { AttentionQueue } from './AttentionQueue';
import { DepartmentPulse } from './DepartmentPulse';

const WorkMovementChart = lazy(() => import('./WorkMovementChart'));
const DistributionChart = lazy(() => import('./DistributionChart'));

export interface RoleCompositionProps {
  overview: DashboardOverview;
  grouped?: GroupedDepartmentTasks;
  onRetryOverview(): void;
}

function ChartLoading() {
  return (
    <div className="grid min-h-72 place-items-center rounded-2xl border border-atlas-mist bg-white text-sm text-slate-500 shadow-sm">
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
    <section className="overflow-hidden rounded-2xl border border-atlas-mist bg-white shadow-sm">
      <header className="border-b border-atlas-mist px-5 py-4">
        <p className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.12em] text-atlas-current">
          {eyebrow}
        </p>
        <h2 className="mt-1 font-atlasDisplay text-lg font-bold text-atlas-ink">{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function OverviewCore({
  overview,
  onRetryOverview,
}: Pick<RoleCompositionProps, 'overview' | 'onRetryOverview'>) {
  const generated = new Date(overview.generatedAt);
  const generatedLabel = Number.isNaN(generated.getTime())
    ? 'Update time unavailable'
    : `Updated ${new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(generated)}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.12em] text-atlas-current">
          Live scope · {overview.windowDays}-day field note · {generatedLabel}
        </p>
        <button
          type="button"
          onClick={onRetryOverview}
          className="rounded-full border border-atlas-mist bg-white px-3 py-1.5 font-atlasMono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-atlas-canopy shadow-sm hover:border-atlas-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current"
        >
          Refresh overview
        </button>
      </div>

      <DepartmentPulse overview={overview} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
        <div className="min-w-0">
          <span className="sr-only">Work movement</span>
          <Suspense fallback={<ChartLoading />}>
            <WorkMovementChart generatedAt={overview.generatedAt} daily={overview.daily} />
          </Suspense>
        </div>
        <AttentionQueue attention={overview.attention} />
      </div>
    </>
  );
}

export function GettingStarted({ overview }: { overview: DashboardOverview }) {
  const fieldNotes = [
    { label: 'Open work in view', value: overview.totals.active },
    { label: 'Flagged for review', value: overview.attention.length },
    { label: `Completed in ${overview.windowDays} days`, value: overview.totals.completed },
  ];

  return (
    <AtlasPanel eyebrow="Live orientation" title="Getting started">
      <p className="px-5 pt-4 text-sm leading-6 text-slate-600">
        Start with the current scope. These checkpoints update with the overview.
      </p>
      <dl className="divide-y divide-atlas-mist px-5 pb-2 pt-3">
        {fieldNotes.map((note) => (
          <div key={note.label} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-sm text-atlas-ink">{note.label}</dt>
            <dd className="font-atlasMono text-sm font-medium text-atlas-canopy">{note.value}</dd>
          </div>
        ))}
      </dl>
    </AtlasPanel>
  );
}

export function TaskList({ tasks, title }: { tasks: Task[]; title: string }) {
  return (
    <AtlasPanel eyebrow={`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`} title={title}>
      {tasks.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-600">No tasks are available in this lane.</p>
      ) : (
        <ul className="divide-y divide-atlas-mist px-5">
          {tasks.map((task) => (
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
    </AtlasPanel>
  );
}

export function PeopleWork({
  groups,
  title,
}: {
  groups: DepartmentTaskGroup[];
  title: string;
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-atlasDisplay text-lg font-bold text-atlas-ink">{title}</h2>
        <span className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.08em] text-atlas-current">
          {groups.length} people
        </span>
      </div>
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-atlas-mist bg-white px-5 py-8 text-sm text-slate-600">
          No grouped work is available in this lane.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map((group) => (
            <TaskList
              key={group.user.userId}
              title={group.user.displayName || group.user.email}
              tasks={group.tasks}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function EmployeeDashboard({ overview, onRetryOverview }: RoleCompositionProps) {
  return (
    <div className="space-y-4" data-dashboard-role="employee">
      <OverviewCore overview={overview} onRetryOverview={onRetryOverview} />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="min-w-0">
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
        <GettingStarted overview={overview} />
      </div>
    </div>
  );
}
