import { useState } from 'react';
import type { DashboardAnalyticsResponse } from '@wrike-clone/shared';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import toast from 'react-hot-toast';
import {
  requestDashboardAnalyticsExport,
  useDashboardAnalytics,
  type DashboardAnalyticsFilters,
} from '../../api/dashboard';
import { ErrorDisplay } from '../common/ErrorDisplay';
import { LoadingSpinner } from '../common/LoadingSpinner';

const card = 'workboard-card rounded-2xl border border-atlas-mist bg-white p-5';

function displayMetric(value: number | null, suffix = ''): string {
  return value === null ? 'Not available' : `${value}${suffix}`;
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className={card}>
      <p className="font-atlasMono text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-atlas-current">
        {label}
      </p>
      <p className="mt-3 font-atlasDisplay text-3xl font-semibold tracking-tight text-atlas-ink">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </article>
  );
}

function PanelHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-4">
      <h2 className="font-atlasDisplay text-lg font-semibold text-atlas-ink">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </header>
  );
}

export function DashboardAnalyticsPanel({
  data,
  exporting,
  onExport,
}: {
  data: DashboardAnalyticsResponse;
  exporting: 'pdf' | 'xlsx' | null;
  onExport: (format: 'pdf' | 'xlsx') => void;
}) {
  const departments = [
    ...new Map(
      data.overdueOutcome.flatMap((point) => point.departments).map((item) => [item.id, item]),
    ).values(),
  ];
  const overdueChart = data.overdueOutcome.map((point) => ({
    month: point.month,
    ...Object.fromEntries(point.departments.map((item) => [item.id, item.count])),
  }));

  return (
    <section aria-label="Dashboard analytics" className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-atlas-mist bg-atlas-canopy p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.12em] text-emerald-100">
            Last {data.period.months} months · {data.scope.role.replace('_', ' ')} scope
          </p>
          <h2 className="mt-1 font-atlasDisplay text-2xl font-semibold">Management analytics</h2>
          <p className="mt-1 text-sm text-emerald-50">
            Generated {new Date(data.generatedAt).toLocaleString()} from tasks you are allowed to
            see.
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-100">
            Export board summary
          </p>
          <div className="flex gap-2">
            {(['pdf', 'xlsx'] as const).map((format) => (
              <button
                key={format}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold uppercase text-atlas-canopy disabled:opacity-60"
                disabled={exporting !== null}
                onClick={() => onExport(format)}
                type="button"
              >
                {exporting === format ? 'Preparing…' : format}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Average completion time"
          value={displayMetric(data.kpis.averageCompletionHours, ' h')}
          note="Created-to-completed time for work finished in this period."
        />
        <Kpi
          label="Handoff success rate"
          value={displayMetric(data.kpis.handoffSuccessRate, '%')}
          note="Ready handoffs confirmed within 48 hours."
        />
        <Kpi
          label="On-time completion"
          value={displayMetric(data.kpis.onTimeCompletionRate, '%')}
          note="Due-dated work completed by its due date."
        />
        <Kpi
          label="Blocked-task ageing"
          value={displayMetric(data.blockedAgeing.averageDays, ' days')}
          note={`Oldest currently blocked task: ${displayMetric(data.blockedAgeing.maxDays, ' days')}.`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className={card}>
          <PanelHeader
            title="Monthly completion trend"
            description="Authorized tasks completed in each calendar month."
          />
          <div className="h-64" aria-label="Monthly completion chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyCompletion}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Area
                  dataKey="completed"
                  fill="#8fd3ad"
                  stroke="#147a50"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-atlas-current">
              View exact monthly data
            </summary>
            <table className="mt-2 w-full">
              <thead>
                <tr>
                  <th className="text-left">Month</th>
                  <th className="text-right">Completed</th>
                </tr>
              </thead>
              <tbody>
                {data.monthlyCompletion.map((point) => (
                  <tr key={point.month}>
                    <td>{point.month}</td>
                    <td className="text-right">{point.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </article>

        <article className={card}>
          <PanelHeader
            title="Overdue outcome trend by department"
            description="Due-month outcomes; historical due-date edits are not versioned."
          />
          <div className="h-64" aria-label="Overdue outcome chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overdueChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                {departments.map((department, index) => (
                  <Bar
                    key={department.id}
                    dataKey={department.id}
                    name={department.name}
                    stackId="overdue"
                    fill={['#dc4c4c', '#e69f35', '#6b8e7a', '#64748b'][index % 4]}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Month</th>
                <th className="text-right">Overdue outcomes</th>
              </tr>
            </thead>
            <tbody>
              {data.overdueOutcome.map((point) => (
                <tr key={point.month}>
                  <td>{point.month}</td>
                  <td className="text-right">{point.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <article className={`${card} xl:col-span-2`}>
          <PanelHeader
            title="Workload by manager and employee"
            description="Current active work, overdue work, and planned hours."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-atlas-mist text-left">
                  <th className="pb-2">Person</th>
                  <th>Role</th>
                  <th className="text-right">Active</th>
                  <th className="text-right">Overdue</th>
                  <th className="text-right">Estimated hours</th>
                </tr>
              </thead>
              <tbody>
                {data.workload.map((item) => (
                  <tr key={item.userId} className="border-b border-atlas-mist/70">
                    <td className="py-3 font-semibold">{item.name}</td>
                    <td className="capitalize">{item.role}</td>
                    <td className="text-right">{item.active}</td>
                    <td className="text-right">{item.overdue}</td>
                    <td className="text-right">{item.estimatedHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.workload.length === 0 && (
            <p className="py-8 text-sm text-slate-500">No assigned active work is visible.</p>
          )}
        </article>
        <article className={card}>
          <PanelHeader
            title="Priority distribution"
            description="Current visible active tasks by priority."
          />
          <div className="space-y-3">
            {Object.entries(data.priorityDistribution).map(([priority, count]) => {
              const total = Object.values(data.priorityDistribution).reduce(
                (sum, value) => sum + value,
                0,
              );
              return (
                <div key={priority}>
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">{priority}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-atlas-mist">
                    <div
                      className="h-2 rounded-full bg-atlas-current"
                      style={{ width: `${total ? (count / total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className={card}>
          <PanelHeader
            title="Blocked-task ageing"
            description="Days since each task most recently entered Blocked."
          />
          {data.blockedAgeing.items.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Task</th>
                  <th className="text-left">Project</th>
                  <th className="text-right">Days</th>
                </tr>
              </thead>
              <tbody>
                {data.blockedAgeing.items.map((item) => (
                  <tr key={item.taskId} className="border-t border-atlas-mist">
                    <td className="py-3 font-semibold">{item.title}</td>
                    <td>{item.projectName ?? 'No project'}</td>
                    <td className="text-right">{item.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-8 text-sm text-slate-500">No currently blocked tasks are visible.</p>
          )}
        </article>
        <article className={card}>
          <PanelHeader
            title="Project health score"
            description="Green 80–100 · amber 60–79 · red below 60."
          />
          <p className="mb-4 text-xs text-slate-500">
            35% on-time · 25% overdue control · 20% blocked ageing · 10% workload balance · 10%
            handoff success.
          </p>
          <div className="space-y-3">
            {data.projectHealth.map((project) => (
              <div key={project.projectId} className="rounded-xl border border-atlas-mist p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-atlas-ink">{project.projectName}</h3>
                    <p className="text-xs text-slate-500">{project.taskCount} visible tasks</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-bold ${project.band === 'green' ? 'bg-emerald-100 text-emerald-800' : project.band === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}
                  >
                    {project.score}
                  </span>
                </div>
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-atlas-current">
                    How this score was calculated
                  </summary>
                  <p className="mt-2 text-slate-600">
                    On-time {project.components.onTime}; overdue control{' '}
                    {project.components.overdueControl}; blocked ageing{' '}
                    {project.components.blockedAgeing}; workload balance{' '}
                    {project.components.workloadBalance}; handoff success{' '}
                    {project.components.handoffSuccess}.
                  </p>
                </details>
              </div>
            ))}
          </div>
          {data.projectHealth.length === 0 && (
            <p className="py-8 text-sm text-slate-500">No project work is visible in this scope.</p>
          )}
        </article>
      </div>
    </section>
  );
}

export function DashboardAnalytics({ departmentId }: { departmentId?: string }) {
  const filters: DashboardAnalyticsFilters = { departmentId, groupBy: 'month' };
  const query = useDashboardAnalytics(filters, true);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  async function download(format: 'pdf' | 'xlsx') {
    setExporting(format);
    try {
      const blob = await requestDashboardAnalyticsExport(filters, format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cepaa-board-summary.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('The board summary could not be exported');
    } finally {
      setExporting(null);
    }
  }

  if (query.isLoading) return <LoadingSpinner className="py-20" size="lg" />;
  if (query.error)
    return (
      <ErrorDisplay
        title="Analytics are unavailable"
        message="The role-scoped analytics could not be loaded."
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data) return null;
  return (
    <DashboardAnalyticsPanel
      data={query.data}
      exporting={exporting}
      onExport={(format) => void download(format)}
    />
  );
}

export default DashboardAnalytics;
