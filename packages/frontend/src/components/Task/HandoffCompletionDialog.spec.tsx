// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPriority, TaskStatus, type Task } from '@wrike-clone/shared';
import { HandoffCompletionDialog } from './HandoffCompletionDialog';
import { useTaskCompletionFlow } from './useTaskCompletionFlow';

const completionMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
}));

vi.mock('../../api/tasks', () => ({
  useCompleteTask: () => completionMutation,
}));

const task: Task = {
  id: 'task-1',
  tenantId: 'tenant-1',
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  deletedAt: null,
  projectId: 'project-1',
  departmentId: 'department-1',
  parentTaskId: null,
  assigneeId: 'member-1',
  createdById: 'owner-1',
  title: 'Publish the outreach reel',
  description: null,
  status: TaskStatus.IN_PROGRESS,
  handoffRequired: true,
  handoffStatus: 'pending' as Task['handoffStatus'],
  handoffOwnerId: 'owner-1',
  handoffOwner: {
    id: 'owner-1',
    displayName: 'Asha Mehta',
    email: 'asha@example.org',
  },
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
};

let mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  completionMutation.mutateAsync.mockReset();
});

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
});

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof HandoffCompletionDialog>> = {},
) {
  const props = {
    open: true,
    task,
    isPending: false,
    onConfirm: vi.fn(),
    onNotYet: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });

  act(() => root.render(<HandoffCompletionDialog {...props} />));
  return props;
}

function getButton(name: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button ${name} was not found`);
  return button;
}

describe('HandoffCompletionDialog', () => {
  it('anchors the confirmation to the intended recipient and exposes both choices by name', () => {
    renderDialog();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.textContent).toContain(
      'Has the finished work been shared with the intended recipient?',
    );
    expect(dialog?.textContent).toContain('Asha Mehta');
    expect(getButton('Yes, handoff completed')).toBeInstanceOf(HTMLButtonElement);
    expect(getButton('Not yet')).toBeInstanceOf(HTMLButtonElement);
  });

  it('keeps the member in control by cancelling on Escape and preserving the page scroll setting', () => {
    const priorScroll = document.body.style.overflow;
    const props = renderDialog();

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe(priorScroll);
  });

  it('prevents a second handoff choice while the completion request is pending', () => {
    const props = renderDialog({ isPending: true });

    expect(getButton('Yes, handoff completed').disabled).toBe(true);
    expect(getButton('Not yet').disabled).toBe(true);
    act(() => getButton('Yes, handoff completed').click());

    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});

describe('useTaskCompletionFlow', () => {
  it('completes a handoff-disabled task immediately with the confirmed outcome', async () => {
    completionMutation.mutateAsync.mockResolvedValue(task);
    let requestCompletion: ((value: Task) => Promise<Task | null>) | undefined;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    function Harness() {
      requestCompletion = useTaskCompletionFlow().requestCompletion;
      return null;
    }

    act(() => root.render(<Harness />));
    const result = await requestCompletion?.({ ...task, handoffRequired: false });

    expect(completionMutation.mutateAsync).toHaveBeenCalledWith({
      taskId: 'task-1',
      outcome: 'confirmed',
    });
    expect(result).toEqual(task);
  });

  it('resolves Not yet only after the member makes that explicit choice', async () => {
    completionMutation.mutateAsync.mockResolvedValue({ ...task, handoffStatus: 'ready' });
    let requestCompletion: ((value: Task) => Promise<Task | null>) | undefined;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    function Harness() {
      const flow = useTaskCompletionFlow();
      requestCompletion = flow.requestCompletion;
      return <HandoffCompletionDialog {...flow.dialogProps} />;
    }

    act(() => root.render(<Harness />));
    let result: Promise<Task | null> | undefined;
    act(() => {
      result = requestCompletion?.(task);
    });
    if (!result) throw new Error('Completion request was not created');
    await act(async () => {
      getButton('Not yet').click();
      await result;
    });

    await expect(result).resolves.toMatchObject({ handoffStatus: 'ready' });
    expect(completionMutation.mutateAsync).toHaveBeenCalledWith({
      taskId: 'task-1',
      outcome: 'not_yet',
    });
  });

  it('resolves null when the member cancels the confirmation', async () => {
    let requestCompletion: ((value: Task) => Promise<Task | null>) | undefined;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    function Harness() {
      const flow = useTaskCompletionFlow();
      requestCompletion = flow.requestCompletion;
      return <HandoffCompletionDialog {...flow.dialogProps} />;
    }

    act(() => root.render(<Harness />));
    let result: Promise<Task | null> | undefined;
    act(() => {
      result = requestCompletion?.(task);
    });
    if (!result) throw new Error('Completion request was not created');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    await expect(result).resolves.toBeNull();
    expect(completionMutation.mutateAsync).not.toHaveBeenCalled();
  });
});
