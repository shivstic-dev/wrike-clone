import { useState, useCallback } from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { useTasks } from '../api/tasks';
import { CalendarView } from '../components/Calendar/CalendarView';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorDisplay } from '../components/common/ErrorDisplay';

export default function CalendarPage() {
  // Default range: visible calendar grid for the current month
  const now = new Date();
  const defaultStart = startOfWeek(startOfMonth(now), { weekStartsOn: 1 });
  const defaultEnd = endOfWeek(endOfMonth(now), { weekStartsOn: 1 });

  const [dateRange, setDateRange] = useState({
    start: defaultStart.toISOString(),
    end: defaultEnd.toISOString(),
  });

  const handleDateRangeChange = useCallback((start: string, end: string) => {
    setDateRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, []);

  const {
    data: tasksData,
    isLoading,
    error,
    refetch,
  } = useTasks({
    perPage: 100,
    dueDateAfter: dateRange.start,
    dueDateBefore: dateRange.end,
  });

  const tasks = tasksData?.data || [];

  return (
    <div className="mx-auto max-w-[96rem] p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">View tasks by due date across all projects.</p>
      </div>
      {error ? (
        <ErrorDisplay message="Failed to load tasks" onRetry={() => refetch()} />
      ) : (
        <CalendarView
          tasks={tasks}
          isLoading={isLoading}
          onDateRangeChange={handleDateRangeChange}
        />
      )}
    </div>
  );
}
