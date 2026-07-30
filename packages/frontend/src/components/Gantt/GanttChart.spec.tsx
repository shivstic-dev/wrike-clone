// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DependencyType,
  HandoffStatus,
  TaskPriority,
  TaskStatus,
  type TimelineResponse,
  type TimelineTask,
} from '@wrike-clone/shared';
import { GanttChart } from './GanttChart';

function timelineTask(overrides: Partial<TimelineTask> = {}): TimelineTask {
  return {
    id: 'task-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    projectName: 'Community campaign',
    departmentId: 'department-1',
    parentTaskId: null,
    assigneeId: 'person-1',
    assignees: [{
      id: 'assignment-1',
      taskId: 'task-1',
      userId: 'person-1',
      assignedById: 'manager-1',
      isPrimary: true,
      assignedAt: '2026-07-01T00:00:00.000Z',
      displayName: 'Mira Sen',
      email: 'mira@example.org',
    }],
    createdById: 'manager-1',
    title: 'Prepare health-camp banner',
    description: null,
    status: TaskStatus.IN_PROGRESS,
    handoffRequired: true,
    handoffStatus: HandoffStatus.PENDING,
    handoffOwnerId: 'manager-1',
    handoffOwner: { id: 'manager-1', displayName: 'Asha Rao', email: 'asha@example.org' },
    handoffReadyAt: null,
    handoffConfirmedBy: null,
    handoffConfirmedAt: null,
    priority: TaskPriority.HIGH,
    estimatedHours: null,
    actualHours: null,
    startDate: '2026-07-02',
    dueDate: '2026-07-04',
    completedAt: null,
    visibility: 'department',
    sortOrder: 0,
    customFields: {},
    isRecurring: false,
    recurrenceRule: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
    capabilities: { canEditSchedule: true, canManageDependencies: true },
    isCritical: false,
    ...overrides,
  };
}

function response(
  tasks: TimelineTask[],
  unscheduled: TimelineTask[] = [],
  dependencies: TimelineResponse['dependencies'] = [],
  range = { from: '2026-07-01', to: '2026-07-10' },
): TimelineResponse {
  return {
    tasks,
    unscheduled,
    dependencies,
    meta: { ...range, nextCursor: null },
  };
}

let container: HTMLDivElement;
let root: Root | undefined;

function renderChart(data: TimelineResponse, props: Partial<ComponentProps<typeof GanttChart>> = {}) {
  const onScheduleChange = vi.fn();
  const onOpenTask = vi.fn();
  act(() => {
    root = createRoot(container);
    root.render(
      <GanttChart
        data={data}
        zoom="day"
        onScheduleChange={onScheduleChange}
        onOpenTask={onOpenTask}
        {...props}
      />,
    );
  });
  return { onScheduleChange, onOpenTask };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-05T10:00:00.000Z'));
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('GanttChart renderer', () => {
  it('renders one identity row and one timeline bar per scheduled task', () => {
    renderChart(response([
      timelineTask(),
      timelineTask({ id: 'task-2', title: 'Confirm volunteer roster', startDate: '2026-07-05', dueDate: '2026-07-08' }),
    ]));

    expect(container.querySelectorAll('[data-gantt-row]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-gantt-bar]')).toHaveLength(2);
  });

  it('gives a same-day milestone one full day of width', () => {
    renderChart(response([timelineTask({ startDate: '2026-07-03', dueDate: '2026-07-03' })]));

    const bar = container.querySelector<HTMLElement>('[data-gantt-bar]');
    expect(bar?.style.width).toBe('40px');
    expect(container.querySelector('[data-gantt-milestone]')).not.toBeNull();
  });

  it('keeps unscheduled work in its panel instead of placing it at the timeline origin', () => {
    const unscheduled = timelineTask({ id: 'task-unscheduled', title: 'Call district coordinator', startDate: null, dueDate: null });
    renderChart(response([], [unscheduled]));

    expect(container.querySelector('[data-unscheduled-task="task-unscheduled"]')).not.toBeNull();
    expect(container.querySelector('[data-gantt-bar="task-unscheduled"]')).toBeNull();
  });

  it('shows Today only when the current date is inside the visible range', () => {
    renderChart(response([timelineTask()]));
    expect(container.querySelector('[data-today-line]')).not.toBeNull();

    act(() => {
      root?.render(
        <GanttChart
          data={response([timelineTask()], [], [], { from: '2026-06-01', to: '2026-06-10' })}
          zoom="day"
          onScheduleChange={vi.fn()}
          onOpenTask={vi.fn()}
        />,
      );
    });
    expect(container.querySelector('[data-today-line]')).toBeNull();
  });

  it.each([
    [DependencyType.FINISH_TO_START, '160', '240'],
    [DependencyType.START_TO_START, '40', '240'],
    [DependencyType.FINISH_TO_FINISH, '160', '360'],
    [DependencyType.START_TO_FINISH, '40', '360'],
  ])('uses the correct anchors for %s dependencies', (dependencyType, fromX, toX) => {
    const first = timelineTask();
    const second = timelineTask({ id: 'task-2', title: 'Deliver final artwork', startDate: '2026-07-07', dueDate: '2026-07-09' });
    renderChart(response([first, second], [], [{
      id: `dependency-${dependencyType}`,
      taskId: second.id,
      dependsOnTaskId: first.id,
      dependencyType,
      lagDays: 2,
    }]));

    const path = container.querySelector(`[data-dependency-type="${dependencyType}"]`);
    expect(path?.getAttribute('data-from-x')).toBe(fromX);
    expect(path?.getAttribute('data-to-x')).toBe(toX);
    expect(container.textContent).toContain('+2d');
  });

  it('announces critical, overdue, and handoff-ready work', () => {
    renderChart(response([timelineTask({
      dueDate: '2026-07-03',
      isCritical: true,
      handoffStatus: HandoffStatus.READY,
    })]));

    expect(container.querySelector('[aria-label*="Critical path"]')).not.toBeNull();
    expect(container.textContent).toContain('Overdue');
    expect(container.textContent).toContain('Ready for handoff');
  });

  it('removes schedule affordances when the task cannot be edited', () => {
    renderChart(response([timelineTask({
      capabilities: { canEditSchedule: false, canManageDependencies: false },
    })]));

    expect(container.querySelector('[data-drag-handle]')).toBeNull();
    expect(container.querySelector('[data-resize-handle]')).toBeNull();
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  it('opens a task row with Enter', () => {
    const { onOpenTask } = renderChart(response([timelineTask()]));
    const row = container.querySelector<HTMLElement>('[data-gantt-row="task-1"]');

    act(() => row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));

    expect(onOpenTask).toHaveBeenCalledWith('task-1');
  });

  it('uses unique dependency marker IDs for multiple charts', () => {
    const first = timelineTask();
    const second = timelineTask({ id: 'task-2', startDate: '2026-07-07', dueDate: '2026-07-09' });
    const data = response([first, second], [], [{
      id: 'dependency-1',
      taskId: second.id,
      dependsOnTaskId: first.id,
      dependencyType: DependencyType.FINISH_TO_START,
      lagDays: 0,
    }]);

    act(() => {
      root = createRoot(container);
      root.render(<>
        <GanttChart data={data} zoom="day" onScheduleChange={vi.fn()} onOpenTask={vi.fn()} />
        <GanttChart data={data} zoom="day" onScheduleChange={vi.fn()} onOpenTask={vi.fn()} />
      </>);
    });

    const markerIds = [...container.querySelectorAll('marker')].map((marker) => marker.id);
    expect(new Set(markerIds).size).toBe(2);
  });

  it('provides a table fallback with complete task context and permitted date editing', () => {
    const { onScheduleChange } = renderChart(response([timelineTask()]));
    const toggle = [...container.querySelectorAll('button')].find((button) => button.textContent === 'View as table');
    act(() => toggle?.click());

    expect(container.querySelector('table')?.textContent).toContain('Community campaign');
    expect(container.querySelector('table')?.textContent).toContain('Mira Sen');
    const startInput = container.querySelector<HTMLInputElement>('table input[aria-label="Start date for Prepare health-camp banner"]');
    act(() => {
      if (!startInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        startInput,
        '2026-07-03',
      );
      startInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onScheduleChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1' }),
      { startDate: '2026-07-03', dueDate: '2026-07-04' },
    );
  });
});
