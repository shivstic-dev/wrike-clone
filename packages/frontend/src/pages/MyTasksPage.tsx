import { useMyTasks } from '../api/tasks';
import { Link } from 'react-router-dom';
import { TaskTable } from '../components/Table/TaskTable';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';

function formatWaitingTime(readyAt: string | null): string {
  if (!readyAt) return 'Waiting time unavailable';

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(readyAt).getTime()) / 60_000));
  if (elapsedMinutes < 1) return 'Waiting less than a minute';
  if (elapsedMinutes < 60) return `Waiting ${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'}`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Waiting ${elapsedHours} hour${elapsedHours === 1 ? '' : 's'}`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `Waiting ${elapsedDays} day${elapsedDays === 1 ? '' : 's'}`;
}

export default function MyTasksPage() {
  const {
    data: tasksData,
    isLoading,
    error,
    refetch,
  } = useMyTasks({
    perPage: 100,
  });

  if (error) {
    return (
      <div className="p-6">
        <ErrorDisplay message="Failed to load your tasks" onRetry={() => refetch()} />
      </div>
    );
  }

  const tasks = tasksData?.data || [];
  const readyTasks = tasks.filter((task) => task.handoffStatus === 'ready');
  const otherTasks = tasks.filter((task) => task.handoffStatus !== 'ready');

  return (
    <div className="mx-auto max-w-[96rem] p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">Tasks assigned to you across all projects.</p>
      </div>

      {isLoading ? (
        <LoadingSpinner className="mt-20" size="lg" />
      ) : (
        <div className="space-y-6">
          <section
            className="overflow-hidden rounded-xl border border-atlas-mist bg-white shadow-sm"
            aria-labelledby="ready-for-handoff-heading"
          >
            <div className="flex flex-col gap-2 border-b border-atlas-mist bg-atlas-cream px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-atlas-current">
                  Final handoff
                </p>
                <h2 id="ready-for-handoff-heading" className="mt-1 text-lg font-semibold text-atlas-ink">
                  Ready for handoff
                </h2>
              </div>
              <span className="inline-flex w-fit rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-atlas-current ring-1 ring-inset ring-atlas-mist">
                {readyTasks.length} {readyTasks.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>
            {readyTasks.length > 0 ? (
              <ul className="divide-y divide-slate-100" aria-label="Tasks ready for handoff">
                {readyTasks.map((task) => (
                  <li key={task.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <Link
                          to={`/tasks/${task.id}`}
                          className="font-medium text-primary-700 hover:text-primary-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                        >
                          {task.title}
                        </Link>
                        <p className="mt-1 text-sm text-slate-600">
                          Owner: {task.handoffOwner?.displayName || task.handoffOwner?.email || 'Not assigned'}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium text-atlas-current">
                        {formatWaitingTime(task.handoffReadyAt || null)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-sm text-slate-500 sm:px-5">
                No tasks are waiting for handoff confirmation.
              </p>
            )}
          </section>

          {otherTasks.length > 0 && <TaskTable tasks={otherTasks} />}
          {tasks.length === 0 && (
            <EmptyState
              title="No tasks assigned to you"
              description="When someone assigns you a task, it will appear here."
            />
          )}
        </div>
      )}
    </div>
  );
}
