/**
 * Interactive Gantt Chart component.
 * Displays tasks as horizontal bars on a timeline with dependency arrows.
 * Supports drag-and-drop for date adjustments via onTaskUpdate callback.
 */
import { useMemo, useRef, useState, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  format,
  addDays,
  differenceInDays,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  min as dateMin,
  max as dateMax,
  parseISO,
} from 'date-fns';
import type { Task } from '@wrike-clone/shared';

interface GanttChartProps {
  tasks: Task[];
  dependencies?: Array<{ taskId: string; dependsOnTaskId: string; dependencyType: string }>;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
}

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 60;
const LABEL_WIDTH = 280;
const DAY_WIDTH = 32;
const BAR_HEIGHT = 26;

export function GanttChart({ tasks, dependencies = [], onTaskUpdate }: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggingBar, setDraggingBar] = useState<{
    taskId: string;
    startX: number;
    originalStartDays: number;
  } | null>(null);
  const [tooltipTask, setTooltipTask] = useState<string | null>(null);

  // Calculate date range covering all tasks
  const { startDate, dayCount, days } = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date();
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = endOfWeek(now, { weekStartsOn: 1 });
      const days = eachDayOfInterval({ start, end });
      return { startDate: start, endDate: end, dayCount: days.length, days };
    }

    const dates = tasks.flatMap((t) => {
      const d: Date[] = [];
      if (t.startDate) d.push(new Date(t.startDate));
      if (t.dueDate) d.push(new Date(t.dueDate));
      return d;
    });

    const min = dates.length > 0 ? dateMin(dates) : new Date();
    const max = dates.length > 0 ? dateMax(dates) : new Date();

    // Add 7 days padding on each side
    const start = startOfWeek(addDays(min, -7), { weekStartsOn: 1 });
    const end = endOfWeek(addDays(max, 7), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });

    return { startDate: start, endDate: end, dayCount: days.length, days };
  }, [tasks]);

  const today = new Date();
  const todayOffset = differenceInDays(today, startDate);
  const timelineWidth = dayCount * DAY_WIDTH;

  // Calculate bar position from task dates
  const getBarPosition = useCallback(
    (task: Task) => {
      const taskStart = task.startDate ? parseISO(task.startDate) : null;
      const taskEnd = task.dueDate ? parseISO(task.dueDate) : null;
      const left = taskStart ? Math.max(0, differenceInDays(taskStart, startDate) * DAY_WIDTH) : 0;
      const width =
        taskStart && taskEnd
          ? Math.max(DAY_WIDTH, differenceInDays(taskEnd, taskStart) * DAY_WIDTH + DAY_WIDTH)
          : DAY_WIDTH * 2;
      return { left, width, taskStart, taskEnd };
    },
    [startDate, DAY_WIDTH],
  );

  // Handle mouse down on a task bar to start drag
  const handleBarMouseDown = useCallback(
    (e: React.MouseEvent, task: Task) => {
      if (!onTaskUpdate) return;
      e.preventDefault();
      const pos = getBarPosition(task);
      setDraggingBar({
        taskId: task.id,
        startX: e.clientX,
        originalStartDays: task.startDate
          ? differenceInDays(parseISO(task.startDate), startDate)
          : 0,
      });
    },
    [onTaskUpdate, getBarPosition, startDate],
  );

  // Handle mouse move during drag
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingBar) return;
      const deltaX = e.clientX - draggingBar.startX;
      const dayDelta = Math.round(deltaX / DAY_WIDTH);
      // Visual feedback handled by inline style
    },
    [draggingBar, DAY_WIDTH],
  );

  // Handle mouse up to finalize drag
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!draggingBar || !onTaskUpdate) return;
      const deltaX = e.clientX - draggingBar.startX;
      const dayDelta = Math.round(deltaX / DAY_WIDTH);

      if (dayDelta !== 0) {
        const task = tasks.find((t) => t.id === draggingBar.taskId);
        if (task) {
          const newStart = task.startDate
            ? addDays(parseISO(task.startDate), dayDelta).toISOString()
            : undefined;
          const newEnd = task.dueDate
            ? addDays(parseISO(task.dueDate), dayDelta).toISOString()
            : undefined;
          onTaskUpdate(draggingBar.taskId, {
            startDate: newStart as any,
            dueDate: newEnd as any,
          });
        }
      }
      setDraggingBar(null);
    },
    [draggingBar, onTaskUpdate, DAY_WIDTH, tasks, startDate],
  );

  // Attach global mouse move/up handlers during drag
  const handleBarMouseDownRef = useRef(handleBarMouseDown);
  handleBarMouseDownRef.current = handleBarMouseDown;

  if (tasks.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white">
        <p className="text-sm text-slate-400">
          No tasks to display on timeline. Create tasks with start and due dates.
        </p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      onMouseMove={handleMouseMove as any}
      onMouseUp={handleMouseUp as any}
      onMouseLeave={() => setDraggingBar(null)}
    >
      <div className="flex">
        {/* Task labels */}
        <div className="shrink-0 border-r border-slate-200" style={{ width: LABEL_WIDTH }}>
          <div
            className="flex items-center border-b border-slate-200 bg-slate-50 px-4 text-xs font-semibold uppercase text-slate-500"
            style={{ height: HEADER_HEIGHT }}
          >
            Tasks ({tasks.length})
          </div>
          <div>
            {tasks.map((task) => {
              const pos = getBarPosition(task);
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between border-b border-slate-100 px-4 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  style={{ height: ROW_HEIGHT }}
                  onMouseEnter={() => setTooltipTask(task.id)}
                  onMouseLeave={() => setTooltipTask(null)}
                >
                  <span className="truncate flex-1">{task.title}</span>
                  {tooltipTask === task.id && pos.taskStart && (
                    <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                      {format(pos.taskStart, 'MMM d')} -{' '}
                      {pos.taskEnd ? format(pos.taskEnd, 'MMM d') : '?'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-x-auto" ref={scrollRef}>
          {/* Header days */}
          <div
            className="flex border-b border-slate-200 bg-slate-50"
            style={{ height: HEADER_HEIGHT, minWidth: timelineWidth }}
          >
            {days.map((day, i) => (
              <div
                key={i}
                className={clsx(
                  'flex shrink-0 items-center justify-center border-r border-slate-100 text-xs',
                  day.getDay() === 0 || day.getDay() === 6 ? 'bg-slate-100/50' : '',
                  format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
                    ? 'bg-primary-50 font-bold text-primary-600'
                    : 'text-slate-500',
                )}
                style={{ width: DAY_WIDTH }}
              >
                <div className="flex flex-col items-center leading-tight">
                  <span className="font-medium">{format(day, 'd')}</span>
                  <span className="text-[10px] text-slate-400">{format(day, 'EEE')}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Task bars area */}
          <div
            className="relative"
            style={{ minWidth: timelineWidth, height: tasks.length * ROW_HEIGHT }}
          >
            {/* Vertical grid lines and weekend shading */}
            {days.map((day, i) => (
              <div
                key={i}
                className={clsx(
                  'absolute top-0 h-full border-r border-slate-100',
                  format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
                    ? 'bg-primary-100/20'
                    : '',
                )}
                style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
              />
            ))}

            {/* Today vertical line */}
            {todayOffset >= 0 && todayOffset < dayCount && (
              <div
                className="absolute top-0 h-full w-0.5 bg-primary-500 z-20 pointer-events-none"
                style={{ left: todayOffset * DAY_WIDTH }}
              />
            )}

            {/* Dependency arrows (SVG) */}
            <svg
              className="absolute top-0 left-0 pointer-events-none z-10"
              style={{ width: timelineWidth, height: tasks.length * ROW_HEIGHT }}
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="6"
                  refX="8"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                </marker>
              </defs>
              {dependencies.map((dep, i) => {
                const fromTask = tasks.find((t) => t.id === dep.dependsOnTaskId);
                const toTask = tasks.find((t) => t.id === dep.taskId);
                if (!fromTask || !toTask) return null;

                const fromIndex = tasks.indexOf(fromTask);
                const toIndex = tasks.indexOf(toTask);
                const fromPos = getBarPosition(fromTask);
                const toPos = getBarPosition(toTask);
                const fromEnd = fromPos.left + fromPos.width;
                const toStart = toPos.left;

                return (
                  <line
                    key={i}
                    x1={fromEnd}
                    y1={fromIndex * ROW_HEIGHT + ROW_HEIGHT / 2}
                    x2={toStart}
                    y2={toIndex * ROW_HEIGHT + ROW_HEIGHT / 2}
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray={dep.dependencyType === 'start_to_start' ? '4 2' : 'none'}
                    markerEnd="url(#arrowhead)"
                  />
                );
              })}
            </svg>

            {/* Task bars (draggable) */}
            {tasks.map((task, index) => {
              const pos = getBarPosition(task);
              const isDragging = draggingBar?.taskId === task.id;

              return (
                <div
                  key={task.id}
                  className={clsx(
                    'absolute flex items-center rounded-full px-2.5 text-xs font-medium text-white select-none',
                    'transition-shadow hover:shadow-md hover:z-30',
                    isDragging ? 'z-40 shadow-lg opacity-80 cursor-grabbing' : 'cursor-grab',
                    task.status === 'completed'
                      ? 'bg-green-500'
                      : task.status === 'in_progress'
                        ? 'bg-blue-500'
                        : task.status === 'blocked'
                          ? 'bg-red-400'
                          : 'bg-slate-400',
                  )}
                  style={{
                    left: Math.max(0, pos.left + (isDragging ? 0 : 0)),
                    top: index * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2,
                    width: Math.min(pos.width, timelineWidth - Math.max(0, pos.left)),
                    height: BAR_HEIGHT,
                    transition: isDragging ? 'none' : 'box-shadow 150ms',
                  }}
                  onMouseDown={(e) => handleBarMouseDownRef.current(e, task)}
                  title={`${task.title}: ${pos.taskStart ? format(pos.taskStart, 'MMM d') : '?'} - ${pos.taskEnd ? format(pos.taskEnd, 'MMM d') : '?'}`}
                >
                  <span className="truncate">{task.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
