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
      label: 'Department pulse',
      value: comparison.value,
      detail: comparison.detail,
      className: 'bg-atlas-canopy text-white',
      mutedClassName: 'text-atlas-mist',
    },
    {
      label: 'Active work',
      value: String(overview.totals.active),
      detail: 'Open tasks in this scope',
      className: 'bg-white text-atlas-ink',
      mutedClassName: 'text-atlas-current',
    },
    {
      label: 'Completed',
      value: String(overview.totals.completed),
      detail: `Last ${overview.windowDays} days`,
      className: 'bg-white text-atlas-ink',
      mutedClassName: 'text-atlas-current',
    },
    {
      label: 'Needs attention',
      value: String(overview.attention.length),
      detail: attentionDetail || 'No flagged open work',
      className: 'bg-[#fff8f4] text-atlas-signalCoral',
      mutedClassName: 'text-[#a74429]',
    },
  ];

  return (
    <section aria-label="Department pulse" className="overflow-hidden rounded-2xl border border-atlas-mist bg-atlas-mist">
      <dl className="grid gap-px sm:grid-cols-2 xl:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className={`min-w-0 px-5 py-4 ${cell.className}`}>
            <dt
              className={`font-atlasMono text-[0.6875rem] font-medium uppercase tracking-[0.12em] ${cell.mutedClassName}`}
            >
              {cell.label}
            </dt>
            <dd className="mt-2 font-atlasDisplay text-2xl font-bold tracking-[-0.04em]">
              {cell.value}
            </dd>
            <dd className={`mt-1 text-xs leading-5 ${cell.mutedClassName}`}>{cell.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
