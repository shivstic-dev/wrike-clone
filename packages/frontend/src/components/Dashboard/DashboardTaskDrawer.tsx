import { useEffect, useRef } from 'react';
import type { DashboardTaskBucket, DashboardTaskListResponse } from '@wrike-clone/shared';
import { ErrorDisplay } from '../common/ErrorDisplay';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface DashboardTaskDrawerQuery {
  data?: DashboardTaskListResponse;
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
}

const bucketLabels: Record<DashboardTaskBucket, string> = {
  active: 'Active work',
  completed: 'Completed',
  overdue: 'Overdue',
  blocked: 'Blocked',
  unassigned: 'Unassigned',
  ready_for_handoff: 'Ready for handoff',
};

function personName(person: { displayName: string | null; email: string } | null): string {
  return person?.displayName || person?.email || 'Not assigned';
}

function formatDueDate(value: string | null): string {
  if (!value) return 'No due date';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function DashboardTaskDrawer({
  bucket,
  onClose,
  query,
}: {
  bucket: DashboardTaskBucket;
  onClose: () => void;
  query: DashboardTaskDrawerQuery;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const label = bucketLabels[bucket];

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    headingRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-atlas-ink/25" onMouseDown={onClose}>
      <aside
        aria-labelledby="dashboard-task-drawer-heading"
        aria-modal="true"
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-atlas-mist px-5 py-5">
          <div>
            <p className="font-atlasMono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-atlas-current">
              Task list
            </p>
            <h2
              className="mt-1 font-atlasDisplay text-2xl font-semibold text-atlas-ink"
              id="dashboard-task-drawer-heading"
              ref={headingRef}
              tabIndex={-1}
            >
              {label}
            </h2>
          </div>
          <button
            aria-label="Close task list"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-atlas-canopy hover:bg-atlas-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>

        <div className="p-5">
          {query.isLoading ? (
            <LoadingSpinner className="py-16" label={`Loading ${label.toLowerCase()} tasks`} />
          ) : query.error ? (
            <ErrorDisplay
              message="This task list could not be loaded. Try again to refresh it."
              onRetry={() => void query.refetch()}
              title="Task list is unavailable"
            />
          ) : (query.data?.data.length ?? 0) === 0 ? (
            <p className="rounded-xl border border-dashed border-atlas-mist px-5 py-10 text-center text-sm text-slate-600">
              No {label.toLowerCase()} tasks are in this scope.
            </p>
          ) : (
            <ul className="divide-y divide-atlas-mist">
              {query.data!.data.map((task) => (
                <li className="py-4" key={task.id}>
                  <a
                    className="block rounded-lg outline-none hover:bg-atlas-paper focus-visible:ring-2 focus-visible:ring-atlas-current"
                    href={`/tasks/${task.id}`}
                  >
                    <p className="font-semibold text-atlas-ink">{task.title}</p>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-slate-500">Project</dt>
                        <dd>{task.projectName || 'No project'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Assignee</dt>
                        <dd>
                          {task.assignees.length
                            ? task.assignees.map((assignee) => assignee.name).join(', ')
                            : 'Unassigned'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Task owner</dt>
                        <dd>{personName(task.handoffOwner)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Due</dt>
                        <dd>{formatDueDate(task.dueDate)}</dd>
                      </div>
                    </dl>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
