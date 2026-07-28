import { useTasks } from '../api/tasks';
import { CalendarView } from '../components/Calendar/CalendarView';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorDisplay } from '../components/common/ErrorDisplay';

export default function CalendarPage() {
  const { data: tasksData, isLoading, error, refetch } = useTasks({ perPage: 500 });

  if (isLoading) return <LoadingSpinner className="mt-20" size="lg" />;
  if (error)
    return (
      <div className="p-6">
        <ErrorDisplay message="Failed to load tasks" onRetry={() => refetch()} />
      </div>
    );

  const tasks = tasksData?.data || [];

  return (
    <div className="mx-auto max-w-[96rem] p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">View tasks by due date across all projects.</p>
      </div>
      <CalendarView tasks={tasks} />
    </div>
  );
}
