import type { DashboardOverview } from '@wrike-clone/shared';
import { Link } from 'react-router-dom';

export interface AttentionQueueProps {
  attention: DashboardOverview['attention'];
}

const reasonLabels: Record<DashboardOverview['attention'][number]['reason'], string> = {
  overdue: 'Overdue',
  blocked: 'Blocked',
  unassigned: 'Unassigned',
};

function dueLabel(dueDate: string | null): string {
  if (!dueDate) return 'No due date';
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return dueDate;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export function AttentionQueue({ attention }: AttentionQueueProps) {
  const visibleAttention = attention.slice(0, 5);

  return (
    <section className="workboard-card flex h-full min-h-[21rem] flex-col overflow-hidden rounded-2xl border border-atlas-mist bg-white">
      <header className="flex items-start justify-between gap-4 border-b border-atlas-mist px-5 py-4">
        <div>
          <p className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.12em] text-atlas-current">
            Priority review
          </p>
          <h2 className="mt-1 font-atlasDisplay text-lg font-semibold text-atlas-ink">
            Attention queue
          </h2>
        </div>
        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 font-atlasMono text-xs font-semibold text-red-700">
          {attention.length} flagged
        </span>
      </header>

      {attention.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-600">
          No open work is flagged for attention.
        </p>
      ) : (
        <ol className="divide-y divide-atlas-mist px-5">
          {visibleAttention.map((item) => (
            <li key={item.id}>
              <Link
                to={`/tasks/${item.id}`}
                className="group grid grid-cols-[0.625rem_minmax(0,1fr)_auto] items-center gap-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-atlas-current"
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-full ${
                    item.reason === 'unassigned' ? 'bg-atlas-fieldNote' : 'bg-atlas-signalCoral'
                  }`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-atlas-ink group-hover:text-atlas-current">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {item.assigneeName ? `Owner · ${item.assigneeName}` : 'No owner'}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-atlasMono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-red-700">
                    {reasonLabels[item.reason]}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {dueLabel(item.dueDate)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {attention.length > visibleAttention.length && (
        <p className="mt-auto border-t border-atlas-mist bg-slate-50 px-5 py-3 text-xs text-slate-500">
          {attention.length - visibleAttention.length} more flagged tasks
        </p>
      )}
    </section>
  );
}
