import type { DashboardOverview, DashboardTaskBucket } from '@wrike-clone/shared';

export interface DepartmentPulseProps {
  overview: DashboardOverview;
  onSelectBucket: (bucket: DashboardTaskBucket) => void;
}

function comparisonDetail(change: number | null): string {
  if (change === null) return 'No prior 30-day baseline';
  const direction = change > 0 ? 'increased' : change < 0 ? 'decreased' : 'unchanged';
  return `${change > 0 ? '+' : ''}${change}% ${direction} from prior period`;
}

export function DepartmentPulse({ overview, onSelectBucket }: DepartmentPulseProps) {
  const cells = [
    {
      label: 'Active work',
      value: overview.totals.active,
      bucket: 'active' as const,
      detail: overview.totals.active === 1 ? 'Open task in this scope' : 'Open tasks in this scope',
      className: 'workboard-feature border-primary-900 text-white',
      mutedClassName: 'text-emerald-100/75',
    },
    {
      label: 'Completed',
      value: overview.totals.completed,
      bucket: 'completed' as const,
      detail: `${overview.totals.completed === 1 ? 'Completed task in this scope' : 'Completed tasks in this scope'} · ${comparisonDetail(overview.comparison.completedPercentChange)}`,
      className: 'workboard-card border-atlas-mist bg-white text-atlas-ink',
      mutedClassName: 'text-slate-500',
    },
    {
      label: 'Overdue',
      value: overview.totals.overdue,
      bucket: 'overdue' as const,
      detail: overview.totals.overdue === 1 ? 'Task past its due date' : 'Tasks past their due date',
      className: 'workboard-card border-atlas-mist bg-white text-atlas-ink',
      mutedClassName: 'text-slate-500',
    },
    {
      label: 'Blocked',
      value: overview.totals.blocked,
      bucket: 'blocked' as const,
      detail: overview.totals.blocked === 1 ? 'Task is currently blocked' : 'Tasks are currently blocked',
      className: 'workboard-card border-atlas-mist bg-white text-atlas-ink',
      mutedClassName: 'text-slate-500',
    },
    {
      label: 'Unassigned',
      value: overview.totals.unassigned,
      bucket: 'unassigned' as const,
      detail: overview.totals.unassigned === 1 ? 'Open task needs an assignee' : 'Open tasks need assignees',
      className: 'workboard-card border-atlas-mist bg-white text-atlas-ink',
      mutedClassName: 'text-slate-500',
    },
    {
      label: 'Ready for handoff',
      value: overview.totals.readyForHandoff,
      bucket: 'ready_for_handoff' as const,
      detail: overview.totals.readyForHandoff === 1 ? 'Task awaits final handoff' : 'Tasks await final handoff',
      className: 'workboard-card border-atlas-mist bg-white text-atlas-ink',
      mutedClassName: 'text-slate-500',
    },
  ];

  return (
    <section aria-label="Department pulse">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cells.map((cell) => (
          <button
            aria-label={`Show ${cell.value} ${cell.label.toLowerCase()} ${cell.value === 1 ? 'task' : 'tasks'}`}
            className={`min-w-0 rounded-2xl border px-5 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current ${cell.className}`}
            key={cell.label}
            onClick={() => onSelectBucket(cell.bucket)}
            type="button"
          >
            <span className={`block font-atlasMono text-[0.6875rem] font-medium ${cell.mutedClassName}`}>
              {cell.label}
            </span>
            <span className={`mt-4 block font-atlasDisplay text-3xl font-semibold tracking-[-0.045em] ${cell.bucket === 'overdue' ? 'text-red-700' : ''}`}>
              {cell.value}
            </span>
            <span className={`mt-1 block text-xs leading-5 ${cell.mutedClassName}`}>{cell.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
