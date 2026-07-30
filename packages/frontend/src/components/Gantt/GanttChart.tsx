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
import { DependencyType } from '@wrike-clone/shared';
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

type Interaction =
  | {
    kind: 'move' | 'resize-start' | 'resize-end';
    taskId: string;
    pointerId: number;
    originX: number;
    original: { startDate: string; dueDate: string };
  }
  | null;

interface DependencyDraft {
  taskId: string;
  dependsOnTaskId: string;
  dependencyType: DependencyType;
  lagDays: number;
}

function dateOnly(value: string | null): string {
  return value?.slice(0, 10) ?? '';
}

function addUtcDays(value: string, days: number): string {
  const date = new Date(`${dateOnly(value)}T00:00:00.000Z`);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function scheduleAfterDelta(
  original: { startDate: string; dueDate: string },
  kind: Exclude<Interaction, null>['kind'],
  dayDelta: number,
): { startDate: string; dueDate: string } {
  if (kind === 'move') {
    return {
      startDate: addUtcDays(original.startDate, dayDelta),
      dueDate: addUtcDays(original.dueDate, dayDelta),
    };
  }
  if (kind === 'resize-start') {
    const startDate = addUtcDays(original.startDate, dayDelta);
    return {
      startDate: startDate > original.dueDate ? original.dueDate : startDate,
      dueDate: original.dueDate,
    };
  }
  const dueDate = addUtcDays(original.dueDate, dayDelta);
  return {
    startDate: original.startDate,
    dueDate: dueDate < original.startDate ? original.startDate : dueDate,
  };
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
  const captureTargetRef = useRef<HTMLElement | null>(null);
  const interactionRef = useRef<Interaction>(null);
  const suppressOpenRef = useRef(false);
  const markerId = `gantt-arrow-${useId().replaceAll(':', '')}`;
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [schedulePreview, setSchedulePreview] = useState<Record<string, { startDate: string; dueDate: string }>>({});
  const [dependencyDraft, setDependencyDraft] = useState<DependencyDraft | null>(null);
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

  const interactionSchedule = useCallback((active: Exclude<Interaction, null>, clientX: number) => {
    const snappedPixels = scale.snapDelta(clientX - active.originX);
    return scheduleAfterDelta(
      active.original,
      active.kind,
      Math.round(snappedPixels / scale.columnWidth),
    );
  }, [scale]);

  const clearInteraction = useCallback(() => {
    const active = interactionRef.current;
    if (active && captureTargetRef.current?.hasPointerCapture?.(active.pointerId)) {
      captureTargetRef.current.releasePointerCapture(active.pointerId);
    }
    captureTargetRef.current = null;
    interactionRef.current = null;
    setInteraction(null);
    setSchedulePreview({});
  }, []);

  const beginInteraction = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    task: TimelineTask,
    kind: Exclude<Interaction, null>['kind'],
  ) => {
    if (!task.capabilities.canEditSchedule || !task.startDate || !task.dueDate) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const active: Exclude<Interaction, null> = {
      kind,
      taskId: task.id,
      pointerId: event.pointerId,
      originX: event.clientX,
      original: { startDate: dateOnly(task.startDate), dueDate: dateOnly(task.dueDate) },
    };
    captureTargetRef.current = event.currentTarget;
    interactionRef.current = active;
    setInteraction(active);
  }, []);

  const updateInteraction = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = interactionRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    setSchedulePreview({ [active.taskId]: interactionSchedule(active, event.clientX) });
  }, [interactionSchedule]);

  const finishInteraction = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = interactionRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const task = scheduled.find((candidate) => candidate.id === active.taskId);
    const next = interactionSchedule(active, event.clientX);
    const changed = next.startDate !== active.original.startDate || next.dueDate !== active.original.dueDate;
    suppressOpenRef.current = changed;
    clearInteraction();
    if (task && changed) {
      onScheduleChange(task, next);
    }
  }, [clearInteraction, interactionSchedule, onScheduleChange, scheduled]);

  useEffect(() => () => clearInteraction(), [clearInteraction]);

  const openWithKeyboard = (event: KeyboardEvent<HTMLElement>, taskId: string) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onOpenTask(taskId);
    }
  };

  const boundsByTask = useMemo(() => new Map(scheduled.map((task, index) => {
    const displaySchedule = schedulePreview[task.id];
    const startDate = displaySchedule?.startDate ?? dateOnly(task.startDate);
    const dueDate = displaySchedule?.dueDate ?? dateOnly(task.dueDate);
    const left = scale.dateToX(startDate);
    const width = Math.max(
      scale.columnWidth,
      scale.dateToX(dueDate) - left + scale.columnWidth,
    );
    return [task.id, { left, right: left + width, y: index * ROW_HEIGHT + ROW_HEIGHT / 2 }];
  })), [scale, schedulePreview, scheduled]);

  const renderDependency = (dependency: TaskDependency) => {
    const predecessor = boundsByTask.get(dependency.dependsOnTaskId);
    const dependent = boundsByTask.get(dependency.taskId);
    if (!predecessor || !dependent) return null;
    const geometry = dependencyPath(dependency.dependencyType, predecessor, dependent);
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
          aria-hidden="true"
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
          data-interaction={interaction?.kind}
          onPointerMove={updateInteraction}
          onPointerUp={finishInteraction}
          onPointerCancel={clearInteraction}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && interactionRef.current) {
              event.preventDefault();
              clearInteraction();
              return;
            }
          }}
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
                const displaySchedule = schedulePreview[task.id];

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
                        dependencyDraft?.taskId === task.id ? (
                          <form
                            aria-label="Add dependency"
                            className="gantt-row__dependency-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (!dependencyDraft.dependsOnTaskId) return;
                              onCreateDependency(dependencyDraft);
                              setDependencyDraft(null);
                            }}
                          >
                            <label>
                              <span className="sr-only">Predecessor</span>
                              <select
                                aria-label="Predecessor"
                                value={dependencyDraft.dependsOnTaskId}
                                onChange={(event) => setDependencyDraft((draft) => draft && {
                                  ...draft, dependsOnTaskId: event.target.value,
                                })}
                              >
                                {scheduled.filter((candidate) => candidate.id !== task.id).map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span className="sr-only">Dependency type</span>
                              <select
                                aria-label="Dependency type"
                                value={dependencyDraft.dependencyType}
                                onChange={(event) => setDependencyDraft((draft) => draft && {
                                  ...draft, dependencyType: event.target.value as DependencyType,
                                })}
                              >
                                {Object.values(DependencyType).map((type) => (
                                  <option key={type} value={type}>{readableStatus(type)}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span className="sr-only">Lag in days</span>
                              <input
                                aria-label="Lag in days"
                                type="number"
                                value={dependencyDraft.lagDays}
                                onChange={(event) => setDependencyDraft((draft) => draft && {
                                  ...draft, lagDays: Number(event.target.value) || 0,
                                })}
                              />
                            </label>
                            <button type="submit">Create dependency</button>
                            <button type="button" onClick={() => setDependencyDraft(null)}>Cancel</button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="gantt-row__link-action"
                            aria-label={`Add a dependency to ${task.title}`}
                            onClick={() => {
                              const firstPredecessor = scheduled.find((candidate) => candidate.id !== task.id);
                              if (firstPredecessor) {
                                setDependencyDraft({
                                  taskId: task.id,
                                  dependsOnTaskId: firstPredecessor.id,
                                  dependencyType: DependencyType.FINISH_TO_START,
                                  lagDays: 0,
                                });
                              }
                            }}
                          >
                            Add dependency
                          </button>
                        )
                      )}
                    </div>

                    <button
                      type="button"
                      data-gantt-bar={task.id}
                      data-can-schedule={String(task.capabilities.canEditSchedule)}
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
                        touchAction: 'none',
                      }}
                      aria-label={[
                        task.title,
                        milestone ? `milestone on ${displaySchedule?.startDate ?? dateOnly(task.startDate)}` : `${displaySchedule?.startDate ?? dateOnly(task.startDate)} to ${displaySchedule?.dueDate ?? dateOnly(task.dueDate)}`,
                        task.isCritical ? 'Critical path' : '',
                        isOverdue(task, today) ? 'Overdue' : '',
                        task.handoffStatus === 'ready' ? 'Ready for handoff' : '',
                      ].filter(Boolean).join(', ')}
                      onPointerDown={(event) => beginInteraction(event, task, 'move')}
                      onClick={() => {
                        if (suppressOpenRef.current) {
                          suppressOpenRef.current = false;
                          return;
                        }
                        onOpenTask(task.id);
                      }}
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
                          data-resize-start-handle
                          className="gantt-bar__resize gantt-bar__resize--start"
                          aria-label={`Change start date for ${task.title}`}
                          style={{ left: LABEL_WIDTH + bounds.left - 1, top: 20, touchAction: 'none' }}
                          onPointerDown={(event) => beginInteraction(event, task, 'resize-start')}
                        />
                        <button
                          type="button"
                          data-resize-end-handle
                          className="gantt-bar__resize"
                          aria-label={`Change due date for ${task.title}`}
                          style={{ left: LABEL_WIDTH + bounds.right - 9, top: 20, touchAction: 'none' }}
                          onPointerDown={(event) => beginInteraction(event, task, 'resize-end')}
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

      {data.dependencies.length > 0 && (
        <section className="gantt-dependency-list" aria-label="Task dependencies">
          <h3>Dependencies</h3>
          <ul>
            {data.dependencies.map((dependency) => {
              const dependentTask = scheduled.find((task) => task.id === dependency.taskId);
              const predecessor = scheduled.find((task) => task.id === dependency.dependsOnTaskId);
              const canDelete = Boolean(onDeleteDependency && dependentTask?.capabilities.canManageDependencies);
              return (
                <li key={dependency.id}>
                  <span>{predecessor?.title || 'Outside timeline'} → {dependentTask?.title || 'Outside timeline'} ({readableStatus(dependency.dependencyType)})</span>
                  {canDelete && <button type="button" onClick={() => onDeleteDependency?.(dependency.id)}>Remove dependency</button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <UnscheduledTasksPanel
        tasks={unscheduled}
        onOpenTask={onOpenTask}
        onScheduleChange={onScheduleChange}
      />
    </section>
  );
}
