/**
 * Calendar View component.
 * Shows tasks grouped by due date in month, week, and day views.
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from 'date-fns';
import type { Task } from '@wrike-clone/shared';

type CalendarViewMode = 'month' | 'week' | 'day';

interface CalendarViewProps {
  tasks: Task[];
}

export function CalendarView({ tasks }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((task) => {
      if (task.dueDate) {
        const dateKey = format(new Date(task.dueDate), 'yyyy-MM-dd');
        if (!map.has(dateKey)) map.set(dateKey, []);
        map.get(dateKey)!.push(task);
      }
    });
    return map;
  }, [tasks]);

  const navigateNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const navigatePrev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const navigateToday = () => setCurrentDate(new Date());

  const renderDay = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const dayTasks = tasksByDate.get(dateKey) || [];
    const isCurrentMonth = isSameMonth(day, currentDate);

    return (
      <div
        key={dateKey}
        className={clsx(
          'min-h-[80px] border-b border-r border-slate-100 p-1 transition-colors',
          !isCurrentMonth && 'bg-slate-50/50',
          isToday(day) && 'bg-primary-50',
        )}
      >
        <span
          className={clsx(
            'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
            isToday(day) ? 'bg-primary-600 text-white font-bold' : 'text-slate-500',
          )}
        >
          {format(day, 'd')}
        </span>
        <div className="mt-1 space-y-0.5">
          {dayTasks.slice(0, 3).map((task) => (
            <Link
              key={task.id}
              to={`/tasks/${task.id}`}
              className={clsx(
                'block truncate rounded px-1 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80',
                task.status === 'done' ? 'bg-green-100 text-green-700' :
                task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                task.status === 'in_review' ? 'bg-amber-100 text-amber-700' :
                task.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                'bg-slate-100 text-slate-600',
              )}
            >
              {task.title}
            </Link>
          ))}
          {dayTasks.length > 3 && (
            <span className="text-[11px] text-slate-400">
              +{dayTasks.length - 3} more
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <div>
        <div className="grid grid-cols-7 border-b border-slate-200">
          {dayHeaders.map((d) => (
            <div key={d} className="bg-slate-50 px-2 py-2 text-center text-xs font-semibold uppercase text-slate-500">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => renderDay(day))}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

    return (
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <div key={format(day, 'yyyy-MM-dd')} className="border-r border-slate-200 last:border-r-0">
            <div className={clsx(
              'border-b border-slate-100 p-2 text-center',
              isToday(day) && 'bg-primary-50',
            )}>
              <span className="text-xs text-slate-500">{format(day, 'EEE')}</span>
              <div className={clsx(
                'mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm',
                isToday(day) ? 'bg-primary-600 text-white font-bold' : 'text-slate-700',
              )}>
                {format(day, 'd')}
              </div>
            </div>
            <div className="space-y-1 p-1">
              {tasksByDate.get(format(day, 'yyyy-MM-dd'))?.map((task) => (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className={clsx(
                    'block truncate rounded px-2 py-1 text-xs font-medium transition-colors hover:opacity-80',
                    task.status === 'done' ? 'bg-green-100 text-green-700' :
                    task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                    task.status === 'in_review' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-600',
                  )}
                >
                  {task.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderDayView = () => {
    const dateKey = format(currentDate, 'yyyy-MM-dd');
    const dayTasks = tasksByDate.get(dateKey) || [];

    return (
      <div>
        <div className={clsx(
          'border-b border-slate-200 p-4 text-center',
          isToday(currentDate) && 'bg-primary-50',
        )}>
          <h3 className="text-lg font-semibold text-slate-900">
            {format(currentDate, 'EEEE, MMMM d, yyyy')}
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {dayTasks.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">
              No tasks due on this day.
            </p>
          ) : (
            dayTasks.map((task) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
              >
                <span className={clsx(
                  'h-2 w-2 rounded-full',
                  task.status === 'done' ? 'bg-green-400' :
                  task.status === 'in_progress' ? 'bg-blue-400' :
                  task.status === 'in_review' ? 'bg-amber-400' :
                  'bg-slate-300',
                )} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{task.title}</p>
                  <p className="text-xs text-slate-400">
                    {task.status.replace('_', ' ')} · {task.priority}
                  </p>
                </div>
                <span className={clsx(
                  'text-xs font-medium',
                  task.priority === 'urgent' ? 'text-red-600' :
                  task.priority === 'high' ? 'text-amber-600' : 'text-slate-400',
                )}>
                  {task.priority}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Header controls */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={navigatePrev} className="btn-ghost btn-sm p-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h2 className="text-base font-semibold text-slate-900 min-w-[200px] text-center">
            {viewMode === 'month' && format(currentDate, 'MMMM yyyy')}
            {viewMode === 'week' && `Week of ${format(currentDate, 'MMM d, yyyy')}`}
            {viewMode === 'day' && format(currentDate, 'MMM d, yyyy')}
          </h2>
          <button onClick={navigateNext} className="btn-ghost btn-sm p-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={navigateToday} className="btn-secondary btn-sm text-xs">Today</button>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['month', 'week', 'day'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  viewMode === mode ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-auto max-h-[600px]">
        {viewMode === 'month' && renderMonthView()}
        {viewMode === 'week' && renderWeekView()}
        {viewMode === 'day' && renderDayView()}
      </div>
    </div>
  );
}
