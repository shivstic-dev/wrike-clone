import { useMyTasks } from '../api/tasks';
import { TaskTable } from '../components/Table/TaskTable';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';

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

  return (
    <div className="mx-auto max-w-[96rem] p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">Tasks assigned to you across all projects.</p>
      </div>

      {isLoading ? (
        <LoadingSpinner className="mt-20" size="lg" />
      ) : tasks.length > 0 ? (
        <TaskTable tasks={tasks} />
      ) : (
        <EmptyState
          title="No tasks assigned to you"
          description="When someone assigns you a task, it will appear here."
        />
      )}
    </div>
  );
}
