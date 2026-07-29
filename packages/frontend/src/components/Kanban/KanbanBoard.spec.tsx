// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPriority, TaskStatus, type Task } from '@wrike-clone/shared';
import { KanbanBoard } from './KanbanBoard';

const mocks = vi.hoisted(() => ({
  updateTask: vi.fn(),
  requestCompletion: vi.fn(),
}));

const task: Task = {
  id: 'task-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  departmentId: 'department-1',
  parentTaskId: null,
  assigneeId: null,
  createdById: 'creator-1',
  title: 'Send campaign artwork',
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
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  deletedAt: null,
};

vi.mock('../../api/tasks', () => ({
  useUpdateTask: () => ({ mutateAsync: mocks.updateTask }),
}));

vi.mock('../Task/useTaskCompletionFlow', () => ({
  useTaskCompletionFlow: () => ({
    requestCompletion: mocks.requestCompletion,
    dialogProps: { open: false, task: null, isPending: false, onConfirm: vi.fn(), onNotYet: vi.fn(), onCancel: vi.fn() },
  }),
}));

vi.mock('../Task/HandoffCompletionDialog', () => ({
  HandoffCompletionDialog: () => null,
}));

vi.mock('./KanbanColumn', () => ({
  KanbanColumn: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('./TaskCard', () => ({
  TaskCard: () => <div>Task card</div>,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (event: unknown) => void }) => (
    <div>
      <button type="button" onClick={() => onDragEnd({ active: { id: 'task-1' }, over: { id: 'completed' } })}>
        Drop in Completed
      </button>
      <button type="button" onClick={() => onDragEnd({ active: { id: 'task-1' }, over: { id: 'in_progress' } })}>
        Drop in In progress
      </button>
      {children}
    </div>
  ),
  DragOverlay: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  KeyboardSensor: class KeyboardSensor {},
  PointerSensor: class PointerSensor {},
  closestCorners: vi.fn(),
  useSensor: () => ({}),
  useSensors: () => [],
}));

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  task.status = TaskStatus.IN_PROGRESS;
  mocks.updateTask.mockReset();
  mocks.updateTask.mockResolvedValue(task);
  mocks.requestCompletion.mockReset();
  mocks.requestCompletion.mockResolvedValue({
    ...task,
    status: TaskStatus.COMPLETED,
    handoffStatus: 'confirmed' as Task['handoffStatus'],
  });
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('KanbanBoard handoff completion', () => {
  it('intercepts a Kanban drop into Completed', async () => {
    act(() => {
      root = createRoot(container);
      root.render(<KanbanBoard tasks={[task]} />);
    });

    const completed = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Drop in Completed');
    if (!completed) throw new Error('Completed drop control was not rendered');
    await act(async () => {
      completed.click();
      await Promise.resolve();
    });

    expect(mocks.requestCompletion).toHaveBeenCalledWith(task);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it('uses generic update when moving from Completed to In progress', async () => {
    task.status = TaskStatus.COMPLETED;
    act(() => {
      root = createRoot(container);
      root.render(<KanbanBoard tasks={[task]} />);
    });

    const inProgress = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Drop in In progress');
    if (!inProgress) throw new Error('In progress drop control was not rendered');
    await act(async () => {
      inProgress.click();
      await Promise.resolve();
    });

    expect(mocks.updateTask).toHaveBeenCalledWith({ id: 'task-1', status: 'in_progress' });
    expect(mocks.requestCompletion).not.toHaveBeenCalled();
  });
});
