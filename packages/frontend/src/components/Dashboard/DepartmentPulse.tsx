import type { DashboardOverview } from '@wrike-clone/shared';

export interface DepartmentPulseProps {
  overview: DashboardOverview;
}

function comparisonValue(change: number | null): { value: string; detail: string } {
  if (change === null) {
    return { value: 'No baseline', detail: 'No prior completions to compare' };
  }

  const direction = change > 0 ? '↑' : change < 0 ? '↓' : '→';
  const prefix = change > 0 ? '+' : '';
  return {
    value: `${direction} ${prefix}${change}%`,
    detail: 'Completed vs prior 30 days',
  };
}

export function DepartmentPulse({ overview }: DepartmentPulseProps) {
  const comparison = comparisonValue(overview.comparison.completedPercentChange);
  const attentionDetail = [
    overview.totals.overdue > 0 ? `${overview.totals.overdue} overdue` : null,
    overview.totals.blocked > 0 ? `${overview.totals.blocked} blocked` : null,
    overview.totals.unassigned > 0 ? `${overview.totals.unassigned} unassigned` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const cells = [
    {
      label: 'Completion trend',
      value: comparison.value,
      detail: comparison.detail,
      className: 'workboard-feature border-primary-900 text-white',
      mutedClassName: 'text-emerald-100/75',
    },
    {
      label: 'Active work',
      value: String(overview.totals.active),
      detail: 'Open tasks in this scope',
      className: 'workboard-card border-atlas-mist bg-white text-atlas-ink',
      mutedClassName: 'text-slate-500',
    },
    {
      label: 'Completed',
      value: String(overview.totals.completed),
      detail: `Last ${overview.windowDays} days`,
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
