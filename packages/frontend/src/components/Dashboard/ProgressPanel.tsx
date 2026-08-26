import type { DashboardOverview } from '@wrike-clone/shared';

export interface ProgressPanelProps {
  overview: DashboardOverview;
}

function completionRate(overview: DashboardOverview): number {
  const total = overview.totals.active + overview.totals.completed;
  if (total === 0) return 0;
  return Math.round((overview.totals.completed / total) * 100);
}

export function ProgressPanel({ overview }: ProgressPanelProps) {
  const rate = completionRate(overview);
  const ringBackground = `conic-gradient(#147A50 0 ${rate}%, #DDE5E0 ${rate}% 100%)`;

  return (
    <section className="workboard-card flex h-full min-h-[21rem] flex-col overflow-hidden rounded-2xl border border-atlas-mist bg-white">
      <header className="border-b border-atlas-mist px-5 py-4">
        <p className="font-atlasMono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-atlas-current">
          Current scope
        </p>
        <h2 className="mt-1 font-atlasDisplay text-lg font-semibold text-atlas-ink">
          Work completion
        </h2>
      </header>

      <div className="grid flex-1 place-items-center px-5 py-6">
        <div className="grid w-full gap-6 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-center">
          <div
            aria-label={`${rate}% of tasks in this scope are completed`}
            className="relative mx-auto grid h-36 w-36 place-items-center rounded-full"
            role="img"
            style={{ background: ringBackground }}
          >
            <span className="grid h-[6.6rem] w-[6.6rem] place-items-center rounded-full bg-white text-center shadow-[inset_0_0_0_1px_rgba(221,229,224,0.8)]">
              <span>
                <strong className="block font-atlasDisplay text-3xl font-semibold tracking-[-0.05em] text-atlas-ink">
                  {rate}%
                </strong>
                <span className="mt-1 block text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">
                  completed
                </span>
              </span>
            </span>
          </div>

          <dl className="divide-y divide-atlas-mist">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-atlas-current" />
                Completed
              </dt>
              <dd className="font-atlasDisplay text-lg font-semibold text-atlas-ink">
                {overview.totals.completed}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-atlas-mist" />
                Active
              </dt>
              <dd className="font-atlasDisplay text-lg font-semibold text-atlas-ink">
                {overview.totals.active}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                Overdue
              </dt>
              <dd className="font-atlasDisplay text-lg font-semibold text-red-700">
                {overview.totals.overdue}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <p className="border-t border-atlas-mist bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-500">
        Completion rate uses all tasks currently visible in this scope.
      </p>
    </section>
  );
}
