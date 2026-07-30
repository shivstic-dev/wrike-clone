import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import type {
  CreateDependencyRequest,
  TaskDependency,
  TimelineResponse,
  TimelineTask,
} from '@wrike-clone/shared';
import { createTimelineScale, type TimelineZoom } from './timeline-scale';
import { dependencyPath } from './dependency-path';
import { UnscheduledTasksPanel } from './UnscheduledTasksPanel';

export interface GanttChartProps {
  data: TimelineResponse;
  zoom: TimelineZoom;
  selectedTaskId?: string;
  onScheduleChange(task: TimelineTask, next: { startDate: string; dueDate: string }): void;
  onOpenTask(taskId: string): void;
  onCreateDependency?(input: CreateDependencyRequest): void;
  onDeleteDependency?(dependencyId: string): void;
}

const ROW_HEIGHT = 64;
const HEADER_HEIGHT = 64;
const LABEL_WIDTH = 296;
const BAR_HEIGHT = 30;
const DAY_MS = 86_400_000;

type DragMode = 'move' | 'resize';
interface DragState {
  task: TimelineTask;
  mode: DragMode;
  startX: number;
}

function dateOnly(value: string | null): string {
  return value?.slice(0, 10) ?? '';
}

function addUtcDays(value: string, days: number): string {
  const date = new Date(`${dateOnly(value)}T00:00:00.000Z`);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function readableStatus(status: string): string {
  return status.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

function assigneeNames(task: TimelineTask): string {
  const names = task.assignees
    ?.map((assignee) => assignee.displayName || assignee.email)
    .filter((name): name is string => Boolean(name));
  return names?.length ? names.join(', ') : 'Unassigned';
}

function isOverdue(task: TimelineTask, today: string): boolean {
  return Boolean(task.dueDate && dateOnly(task.dueDate) < today && task.status !== 'completed');
}

function fallbackVirtualItems(count: number): VirtualItem[] {
  return Array.from({ length: count }, (_, index) => ({
    key: index,
    index,
    start: index * ROW_HEIGHT,
    end: (index + 1) * ROW_HEIGHT,
    size: ROW_HEIGHT,
    lane: 0,
  }));
}

function Header({ scale }: { scale: ReturnType<typeof createTimelineScale> }) {
  return (
    <div className="gantt-header" style={{ height: HEADER_HEIGHT }}>
      <div className="gantt-header__identity" style={{ width: LABEL_WIDTH }}>
        <span>Work item</span>
        <small>Schedule and handoff state</small>
      </div>
      <div className="gantt-header__dates" style={{ width: scale.totalWidth }}>
        {scale.headerCells.map((cell) => (
          <div key={`${cell.start}-${cell.end}`} style={{ width: cell.width }}>
            <span>{cell.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskSignals({ task, today }: { task: TimelineTask; today: string }) {
  return (
    <span className="gantt-signals">
      {task.isCritical && <span className="gantt-signal gantt-signal--critical">Critical path</span>}
      {isOverdue(task, today) && <span className="gantt-signal gantt-signal--overdue">Overdue</span>}
      {task.handoffStatus === 'ready' && <span className="gantt-signal gantt-signal--handoff">Ready for handoff</span>}
    </span>
  );
}

function AccessibleTable({
  tasks,
  today,
  onOpenTask,
  onScheduleChange,
}: {
  tasks: TimelineTask[];
  today: string;
  onOpenTask(taskId: string): void;
  onScheduleChange(task: TimelineTask, next: { startDate: string; dueDate: string }): void;
}) {
  const updateDate = (task: TimelineTask, field: 'startDate' | 'dueDate', value: string) => {
    const startDate = field === 'startDate' ? value : dateOnly(task.startDate);
    const dueDate = field === 'dueDate' ? value : dateOnly(task.dueDate);
    if (startDate && dueDate && dueDate >= startDate) {
      onScheduleChange(task, { startDate, dueDate });
    }
  };

  return (
    <div className="gantt-table-wrap">
      <table className="gantt-table">
        <caption>Timeline tasks and schedule details</caption>
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Project</th>
            <th scope="col">Start</th>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
            <th scope="col">Owner / assignees</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <th scope="row">
                <button type="button" onClick={() => onOpenTask(task.id)}>{task.title}</button>
                <TaskSignals task={task} today={today} />
              </th>
              <td>{task.projectName || 'No project'}</td>
              <td>
                {task.capabilities.canEditSchedule ? (
                  <input
                    type="date"
                    aria-label={`Start date for ${task.title}`}
                    value={dateOnly(task.startDate)}
                    max={dateOnly(task.dueDate) || undefined}
                    onChange={(event) => updateDate(task, 'startDate', event.target.value)}
                  />
                ) : dateOnly(task.startDate) || 'Not scheduled'}
              </td>
              <td>
                {task.capabilities.canEditSchedule ? (
                  <input
                    type="date"
                    aria-label={`Due date for ${task.title}`}
                    value={dateOnly(task.dueDate)}
                    min={dateOnly(task.startDate) || undefined}
                    onChange={(event) => updateDate(task, 'dueDate', event.target.value)}
                  />
                ) : dateOnly(task.dueDate) || 'Not scheduled'}
              </td>
              <td>{readableStatus(task.status)}</td>
              <td>
                {task.handoffOwner?.displayName || task.handoffOwner?.email || 'No owner'}
                <small>{assigneeNames(task)}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GanttChart({
  data,
  zoom,
  selectedTaskId,
  onScheduleChange,
  onOpenTask,
  onCreateDependency,
  onDeleteDependency,
}: GanttChartProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const markerId = `gantt-arrow-${useId().replaceAll(':', '')}`;
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dependencySourceId, setDependencySourceId] = useState<string | null>(null);
  const scale = useMemo(
    () => createTimelineScale({ from: data.meta.from, to: data.meta.to, zoom }),
    [data.meta.from, data.meta.to, zoom],
  );
  const scheduled = useMemo(
    () => data.tasks.filter((task) => task.startDate && task.dueDate),
    [data.tasks],
  );
  const unscheduled = useMemo(() => {
    const byId = new Map(data.unscheduled.map((task) => [task.id, task]));
    for (const task of data.tasks) {
      if (!task.startDate || !task.dueDate) byId.set(task.id, task);
    }
    return [...byId.values()];
  }, [data.tasks, data.unscheduled]);
  const allTasks = useMemo(() => [...scheduled, ...unscheduled], [scheduled, unscheduled]);
  const today = new Date().toISOString().slice(0, 10);
  const todayInsideRange = today >= data.meta.from && today <= data.meta.to;
  const bodyHeight = scheduled.length * ROW_HEIGHT;

  const rowVirtualizer = useVirtualizer({
    count: scheduled.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  const measuredItems = rowVirtualizer.getVirtualItems();
  const virtualItems = measuredItems.length ? measuredItems : fallbackVirtualItems(scheduled.length);
  const totalHeight = Math.max(rowVirtualizer.getTotalSize(), bodyHeight);

  const beginDrag = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    task: TimelineTask,
    mode: DragMode,
  ) => {
    if (!task.capabilities.canEditSchedule) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ task, mode, startX: event.clientX });
  }, []);

  useEffect(() => {
    if (!drag) return undefined;
    const finish = (event: PointerEvent) => {
      const snappedPixels = scale.snapDelta(event.clientX - drag.startX);
      const dayDelta = Math.round(snappedPixels / scale.columnWidth);
      if (dayDelta !== 0 && drag.task.startDate && drag.task.dueDate) {
        const startDate = dateOnly(drag.task.startDate);
        const dueDate = dateOnly(drag.task.dueDate);
        const next = drag.mode === 'move'
          ? { startDate: addUtcDays(startDate, dayDelta), dueDate: addUtcDays(dueDate, dayDelta) }
          : { startDate, dueDate: addUtcDays(dueDate, dayDelta) };
        if (next.dueDate >= next.startDate) onScheduleChange(drag.task, next);
      }
      setDrag(null);
    };
    window.addEventListener('pointerup', finish, { once: true });
    return () => window.removeEventListener('pointerup', finish);
  }, [drag, onScheduleChange, scale]);

  const openWithKeyboard = (event: KeyboardEvent<HTMLElement>, taskId: string) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onOpenTask(taskId);
    }
  };

  const boundsByTask = useMemo(() => new Map(scheduled.map((task, index) => {
    const left = scale.dateToX(dateOnly(task.startDate));
    const width = Math.max(
      scale.columnWidth,
      scale.dateToX(dateOnly(task.dueDate)) - left + scale.columnWidth,
    );
    return [task.id, { left, right: left + width, y: index * ROW_HEIGHT + ROW_HEIGHT / 2 }];
  })), [scale, scheduled]);

  const renderDependency = (dependency: TaskDependency) => {
    const predecessor = boundsByTask.get(dependency.dependsOnTaskId);
    const dependent = boundsByTask.get(dependency.taskId);
    if (!predecessor || !dependent) return null;
    const geometry = dependencyPath(dependency.dependencyType, predecessor, dependent);
    const dependentTask = scheduled.find((task) => task.id === dependency.taskId);
    const canDelete = Boolean(onDeleteDependency && dependentTask?.capabilities.canManageDependencies);
    const label = `${readableStatus(dependency.dependencyType)} dependency${dependency.lagDays ? `, ${dependency.lagDays} day lag` : ''}`;
    const middle = geometry.points[Math.floor(geometry.points.length / 2)] ?? {
      x: geometry.anchors.toX,
      y: dependent.y,
    };

    return (
      <g key={dependency.id}>
        <path
          d={geometry.path}
          className="gantt-dependency"
          markerEnd={`url(#${markerId})`}
          data-dependency-type={dependency.dependencyType}
          data-from-x={geometry.anchors.fromX}
          data-to-x={geometry.anchors.toX}
          aria-label={canDelete ? `${label}; press Delete to remove` : label}
          role={canDelete ? 'button' : 'img'}
          tabIndex={canDelete ? 0 : undefined}
          onKeyDown={(event) => {
            if (canDelete && (event.key === 'Delete' || event.key === 'Backspace')) {
              event.preventDefault();
              onDeleteDependency?.(dependency.id);
            }
          }}
        >
          <title>{label}</title>
        </path>
        {dependency.lagDays !== 0 && (
          <text x={middle.x + 5} y={middle.y - 7} className="gantt-dependency__lag">
            {dependency.lagDays > 0 ? '+' : ''}{dependency.lagDays}d
          </text>
        )}
      </g>
    );
  };

  return (
    <section className="gantt-shell" aria-label="Operations timeline">
      <div className="gantt-view-switch" role="group" aria-label="Timeline view">
        <span>{scheduled.length} scheduled · {unscheduled.length} unscheduled</span>
        <button
          type="button"
          aria-pressed={view === 'table'}
          onClick={() => setView((current) => current === 'chart' ? 'table' : 'chart')}
        >
          {view === 'chart' ? 'View as table' : 'View as chart'}
        </button>
      </div>

      {view === 'table' ? (
        <AccessibleTable
          tasks={allTasks}
          today={today}
          onOpenTask={onOpenTask}
          onScheduleChange={onScheduleChange}
        />
      ) : (
        <div
          ref={viewportRef}
          className="gantt-viewport"
          tabIndex={0}
          aria-label="Scrollable timeline chart"
        >
          <div className="gantt-canvas" style={{ width: LABEL_WIDTH + scale.totalWidth }}>
            <Header scale={scale} />
            <div
              className="gantt-body"
              style={{ height: totalHeight, minHeight: scheduled.length ? undefined : ROW_HEIGHT }}
            >
              <div
                className="gantt-grid"
                aria-hidden="true"
                style={{
                  left: LABEL_WIDTH,
                  width: scale.totalWidth,
                  backgroundSize: `${scale.columnWidth}px ${ROW_HEIGHT}px`,
                }}
              />
              {todayInsideRange && (
                <div
                  className="gantt-today"
                  data-today-line
                  aria-label={`Today, ${today}`}
                  style={{ left: LABEL_WIDTH + scale.dateToX(today) + scale.columnWidth / 2 }}
                >
                  <span>Today</span>
                </div>
              )}

              <svg
                className="gantt-dependencies"
                aria-label="Task dependencies"
                style={{ left: LABEL_WIDTH, width: scale.totalWidth, height: totalHeight }}
              >
                <defs>
                  <marker
                    id={markerId}
                    markerWidth="9"
                    markerHeight="8"
                    refX="8"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M 0 0 L 9 4 L 0 8 z" />
                  </marker>
                </defs>
                {data.dependencies.map(renderDependency)}
              </svg>

              {virtualItems.map((virtualRow) => {
                const task = scheduled[virtualRow.index];
                if (!task) return null;
                const bounds = boundsByTask.get(task.id);
                if (!bounds) return null;
                const width = bounds.right - bounds.left;
                const milestone = dateOnly(task.startDate) === dateOnly(task.dueDate);
                const selected = selectedTaskId === task.id;
                const sourceTask = dependencySourceId
                  ? scheduled.find((candidate) => candidate.id === dependencySourceId)
                  : undefined;

                return (
                  <div
                    key={task.id}
                    className="gantt-row"
                    data-gantt-row={task.id}
                    style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                    tabIndex={0}
                    aria-label={`Open ${task.title}`}
                    onKeyDown={(event) => openWithKeyboard(event, task.id)}
                  >
                    <div
                      className={`gantt-row__identity${selected ? ' gantt-row__identity--selected' : ''}`}
                      style={{ width: LABEL_WIDTH }}
                    >
                      <button type="button" onClick={() => onOpenTask(task.id)}>
                        <strong>{task.title}</strong>
                        <span>{readableStatus(task.status)} · {dateOnly(task.startDate)}–{dateOnly(task.dueDate)}</span>
                      </button>
                      <TaskSignals task={task} today={today} />
                      {onCreateDependency && task.capabilities.canManageDependencies && (
                        dependencySourceId && dependencySourceId !== task.id ? (
                          <button
                            type="button"
                            className="gantt-row__link-action"
                            aria-label={`Make ${sourceTask?.title || 'selected task'} a predecessor of ${task.title}`}
                            onClick={() => {
                              onCreateDependency({
                                dependsOnTaskId: dependencySourceId,
                                taskId: task.id,
                                dependencyType: 'finish_to_start',
                                lagDays: 0,
                              });
                              setDependencySourceId(null);
                            }}
                          >
                            Link here
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="gantt-row__link-action"
                            aria-label={`Start dependency from ${task.title}`}
                            aria-pressed={dependencySourceId === task.id}
                            onClick={() => setDependencySourceId(
                              dependencySourceId === task.id ? null : task.id,
                            )}
                          >
                            {dependencySourceId === task.id ? 'Cancel link' : 'Link'}
                          </button>
                        )
                      )}
                    </div>

                    <button
                      type="button"
                      data-gantt-bar={task.id}
                      className={[
                        'gantt-bar',
                        milestone ? 'gantt-bar--milestone' : '',
                        task.isCritical ? 'gantt-bar--critical' : '',
                        isOverdue(task, today) ? 'gantt-bar--overdue' : '',
                        selected ? 'gantt-bar--selected' : '',
                      ].filter(Boolean).join(' ')}
                      style={{
                        left: LABEL_WIDTH + bounds.left,
                        top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                        width,
                        height: BAR_HEIGHT,
                      }}
                      aria-label={[
                        task.title,
                        milestone ? `milestone on ${dateOnly(task.startDate)}` : `${dateOnly(task.startDate)} to ${dateOnly(task.dueDate)}`,
                        task.isCritical ? 'Critical path' : '',
                        isOverdue(task, today) ? 'Overdue' : '',
                        task.handoffStatus === 'ready' ? 'Ready for handoff' : '',
                      ].filter(Boolean).join(', ')}
                      onClick={() => onOpenTask(task.id)}
                    >
                      {milestone ? (
                        <span data-gantt-milestone className="gantt-milestone" aria-hidden="true" />
                      ) : (
                        <span>{task.title}</span>
                      )}
                    </button>
                    {task.capabilities.canEditSchedule && (
                      <>
                        <button
                          type="button"
                          data-drag-handle
                          className="gantt-bar__drag"
                          aria-label={`Move ${task.title}`}
                          style={{ left: LABEL_WIDTH + bounds.left + (milestone ? 0 : 8), top: 20 }}
                          onPointerDown={(event) => beginDrag(event, task, 'move')}
                        />
                        <button
                          type="button"
                          data-resize-handle
                          className="gantt-bar__resize"
                          aria-label={`Change due date for ${task.title}`}
                          style={{ left: LABEL_WIDTH + bounds.right - 9, top: 20 }}
                          onPointerDown={(event) => beginDrag(event, task, 'resize')}
                        />
                      </>
                    )}
                  </div>
                );
              })}

              {!scheduled.length && (
                <div className="gantt-empty">
                  <strong>No scheduled work in this range</strong>
                  <span>Use the planning inbox below to add dates.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <UnscheduledTasksPanel
        tasks={unscheduled}
        onOpenTask={onOpenTask}
        onScheduleChange={onScheduleChange}
      />
    </section>
  );
}
