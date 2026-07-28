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
      className: 'bg-[#eee9ff] text-atlas-ink',
      mutedClassName: 'text-atlas-current',
    },
    {
      label: 'Active work',
      value: String(overview.totals.active),
      detail: 'Open tasks in this scope',
      className: 'bg-atlas-sky text-atlas-ink',
      mutedClassName: 'text-[#526b91]',
    },
    {
      label: 'Completed',
      value: String(overview.totals.completed),
      detail: `Last ${overview.windowDays} days`,
      className: 'bg-[#fff3c9] text-atlas-ink',
      mutedClassName: 'text-[#7b6424]',
    },
    {
      label: 'Needs attention',
      value: String(overview.attention.length),
      detail: attentionDetail || 'No flagged open work',
      className: 'bg-atlas-blush text-[#a24763]',
      mutedClassName: 'text-[#8b5365]',
    },
  ];

  return (
    <section aria-label="Department pulse" className="sunny-card overflow-hidden rounded-3xl border-4 border-white bg-white">
      <dl className="grid gap-px sm:grid-cols-2 xl:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className={`min-w-0 px-5 py-4 ${cell.className}`}>
            <dt
              className={`font-atlasMono text-xs font-bold tracking-[0.02em] ${cell.mutedClassName}`}
            >
              {cell.label}
            </dt>
            <dd className="mt-2 font-atlasDisplay text-3xl font-bold tracking-[-0.02em]">
              {cell.value}
            </dd>
            <dd className={`mt-1 text-xs leading-5 ${cell.mutedClassName}`}>{cell.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
