import type { DashboardOverview } from '@wrike-clone/shared';

export interface DepartmentPulseProps {
  overview: DashboardOverview;
}

function comparisonDetail(change: number | null): string {
  if (change === null) {
    return 'No prior 30-day baseline';
  }

  const direction = change > 0 ? 'increased' : change < 0 ? 'decreased' : 'unchanged';
  const prefix = change > 0 ? '+' : '';
  return `${prefix}${change}% ${direction} from prior period`;
}

export function DepartmentPulse({ overview }: DepartmentPulseProps) {
  const completed30Days = overview.daily.reduce((total, day) => total + day.completed, 0);
  const created30Days = overview.daily.reduce((total, day) => total + day.created, 0);
  const attentionDetail = [
    overview.totals.overdue > 0 ? `${overview.totals.overdue} overdue` : null,
    overview.totals.blocked > 0 ? `${overview.totals.blocked} blocked` : null,
    overview.totals.unassigned > 0 ? `${overview.totals.unassigned} unassigned` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const cells = [
    {
      label: 'Active work',
      value: String(overview.totals.active),
      detail: overview.totals.active === 1 ? 'Open task in this scope' : 'Open tasks in this scope',
      className: 'workboard-feature border-primary-900 text-white',
      mutedClassName: 'text-emerald-100/75',
    },
    {
      label: 'Completed',
      value: String(completed30Days),
      detail: comparisonDetail(overview.comparison.completedPercentChange),
      className: 'workboard-card border-atlas-mist bg-white text-atlas-ink',
      mutedClassName: 'text-slate-500',
    },
    {
      label: 'Created',
      value: String(created30Days),
      detail: comparisonDetail(overview.comparison.createdPercentChange),
      className: 'workboard-card border-atlas-mist bg-white text-atlas-ink',
      mutedClassName: 'text-slate-500',
    },
    {
      label: 'Needs attention',
      value: String(overview.attention.length),
      detail: attentionDetail || 'No flagged open work',
      className: 'workboard-card border-atlas-mist bg-white text-atlas-ink',
      mutedClassName: 'text-slate-500',
    },
  ];

  return (
    <section aria-label="Department pulse">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cells.map((cell, index) => (
          <div
            key={cell.label}
            className={`min-w-0 rounded-2xl border px-5 py-4 ${cell.className}`}
          >
            <dt className={`font-atlasMono text-[0.6875rem] font-medium ${cell.mutedClassName}`}>
              {cell.label}
            </dt>
            <dd
              className={`mt-4 font-atlasDisplay text-3xl font-semibold tracking-[-0.045em] ${
                index === 3 ? 'text-red-700' : ''
              }`}
            >
              {cell.value}
            </dd>
            <dd className={`mt-1 text-xs leading-5 ${cell.mutedClassName}`}>{cell.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
