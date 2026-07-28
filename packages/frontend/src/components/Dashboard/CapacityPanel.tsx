import type { DashboardOverview } from '@wrike-clone/shared';

export interface CapacityPanelProps {
  capacity: DashboardOverview['capacity'];
}

function initials(name: string): string {
  const value = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return value || '—';
}

export function CapacityPanel({ capacity }: CapacityPanelProps) {
  const maxOpenTasks = Math.max(1, ...capacity.map((item) => item.openTasks));

  return (
    <section className="sunny-card overflow-hidden rounded-3xl border border-atlas-mist bg-white">
      <header className="flex items-start justify-between gap-4 border-b border-atlas-mist px-5 py-4">
        <div>
          <p className="font-atlasMono text-[0.6875rem] uppercase tracking-[0.12em] text-atlas-current">
            Open task load
          </p>
          <h2 className="mt-1 font-atlasDisplay text-lg font-bold text-atlas-ink">
            Team capacity
          </h2>
        </div>
        <span className="text-right text-xs leading-5 text-slate-500">
          Open task counts
          <br />
          not estimated hours
        </span>
      </header>

      {capacity.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-600">
          No assigned open tasks are available for this scope.
        </p>
      ) : (
        <ul className="space-y-4 px-5 py-5">
          {capacity.map((person) => {
            const width = person.openTasks === 0 ? 0 : (person.openTasks / maxOpenTasks) * 100;
            return (
              <li
                key={person.userId}
                className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[2rem_minmax(5rem,0.65fr)_minmax(5rem,1fr)_auto]"
              >
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 place-items-center rounded-full bg-atlas-sprout/65 font-atlasMono text-[0.6875rem] font-bold text-atlas-ink"
                >
                  {initials(person.name)}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-atlas-ink">
                  {person.name}
                </span>
                <span
                  role="img"
                  aria-label={`${person.name}: ${person.openTasks} open tasks`}
                  className="col-span-3 row-start-2 h-2 min-w-0 overflow-hidden rounded-full bg-atlas-mist sm:col-span-1 sm:col-start-3 sm:row-start-1"
                >
                  <span
                    className={`block h-full rounded-full ${
                      person.overdue > 0 ? 'bg-atlas-signalCoral' : 'bg-atlas-current'
                    }`}
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className="col-start-3 row-start-1 text-right sm:col-start-4">
                  <span className="block font-atlasMono text-xs font-medium text-atlas-ink">
                    {person.openTasks} open
                  </span>
                  <span className="block text-[0.6875rem] text-slate-500">
                    {person.overdue} overdue
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
