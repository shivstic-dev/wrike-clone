// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPriority, TaskStatus, type PaginatedResponse, type Task } from '@wrike-clone/shared';
import { TaskTable } from '../components/Table/TaskTable';
import MyTasksPage from './MyTasksPage';

const mocks = vi.hoisted(() => ({
  data: undefined as PaginatedResponse<Task> | undefined,
  isLoading: false,
  error: null as Error | null,
  refetch: vi.fn(),
  calls: [] as unknown[][],
}));

vi.mock('../api/tasks', () => ({
  useMyTasks: (...args: unknown[]) => {
    mocks.calls.push(args);
    return {
      data: mocks.data,
      isLoading: mocks.isLoading,
      error: mocks.error,
      refetch: mocks.refetch,
    };
  },
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-self-assigned',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    departmentId: 'department-1',
    parentTaskId: null,
    assigneeId: 'user-1',
    createdById: 'user-1',
    title: 'Prepare volunteer briefing',
    description: null,
    status: TaskStatus.IN_PROGRESS,
    handoffRequired: true,
    handoffStatus: 'pending' as Task['handoffStatus'],
    handoffOwnerId: 'owner-1',
    handoffOwner: { id: 'owner-1', displayName: 'Asha Owner', email: 'asha@example.org' },
    handoffReadyAt: null,
    handoffConfirmedBy: null,
    handoffConfirmedAt: null,
    priority: TaskPriority.MEDIUM,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    visibility: 'department',
    sortOrder: 0,
    customFields: {},
    isRecurring: false,
    recurrenceRule: null,
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | undefined;

async function renderPage(): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter>
        <MyTasksPage />
      </MemoryRouter>,
    );
    await Promise.resolve();
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
  mocks.data = undefined;
  mocks.isLoading = false;
  mocks.error = null;
  mocks.refetch.mockReset();
  mocks.calls.length = 0;
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = undefined;
  }
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('MyTasksPage handoff queue', () => {
  it('keeps the ready-for-handoff queue visible when there are no assigned tasks', async () => {
    mocks.data = {
      data: [],
      meta: { page: 1, perPage: 100, total: 0, totalPages: 0 },
    };

    await renderPage();

    expect(
      container.querySelector('[aria-labelledby="ready-for-handoff-heading"]')?.textContent,
    ).toContain('0 tasks');
    expect(container.textContent).toContain('No tasks assigned to you');
  });

  it('renders a self-assigned task returned by /tasks/my', async () => {
    mocks.data = {
      data: [makeTask()],
      meta: { page: 1, perPage: 100, total: 1, totalPages: 1 },
    };

    await renderPage();

    expect(container.textContent).toContain('Prepare volunteer briefing');
    expect(mocks.calls).toEqual([[{ perPage: 100 }]]);
  });

  it('keeps ready tasks in a persistent handoff section with owner and waiting time', async () => {
    const readyTask = makeTask({
      id: 'task-ready',
      title: 'Send the community update',
      status: TaskStatus.IN_PROGRESS,
      handoffStatus: 'ready' as Task['handoffStatus'],
      handoffReadyAt: '2026-07-30T10:00:00.000Z',
    });
    const completedTask = makeTask({
      id: 'task-completed',
      title: 'Archive last month update',
      status: TaskStatus.COMPLETED,
      handoffStatus: 'confirmed' as Task['handoffStatus'],
      handoffRequired: false,
      handoffReadyAt: null,
    });
    mocks.data = {
      data: [readyTask, completedTask],
      meta: { page: 1, perPage: 100, total: 2, totalPages: 1 },
    };

    await renderPage();

    const readySection = container.querySelector<HTMLElement>(
      '[aria-labelledby="ready-for-handoff-heading"]',
    );
    expect(readySection).not.toBeNull();
    expect(readySection?.textContent).toContain('Ready for handoff');
    expect(readySection?.textContent).toContain('1 task');
    expect(readySection?.textContent).toContain('Send the community update');
    expect(readySection?.textContent).toContain('Asha Owner');
    expect(readySection?.textContent).toContain('Waiting 2 hours');
    expect(readySection?.querySelector('a[href="/tasks/task-ready"]')?.textContent).toContain(
      'Send the community update',
    );
    expect(readySection?.textContent).not.toContain('Archive last month update');
    expect(container.querySelectorAll('a[href="/tasks/task-ready"]')).toHaveLength(1);
    expect(container.textContent).toContain('Archive last month update');
  });

  it('shows a compact accessible ready-for-handoff badge in task tables', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <MemoryRouter>
          <TaskTable
            tasks={[
              makeTask({
                handoffStatus: 'ready' as Task['handoffStatus'],
                handoffReadyAt: '2026-07-30T10:00:00.000Z',
              }),
            ]}
          />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[aria-label="Ready for handoff"]')?.textContent).toContain(
      'Ready for handoff',
    );
  });
});
