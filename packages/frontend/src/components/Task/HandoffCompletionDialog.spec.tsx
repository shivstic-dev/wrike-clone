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

function getByRole<T extends HTMLElement>(role: 'button' | 'dialog' | 'heading', name: string): T {
  const selector = {
    button: 'button, [role="button"]',
    dialog: '[role="dialog"]',
    heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
  }[role];
  const match = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((candidate) => {
    const labelledBy = candidate.getAttribute('aria-labelledby');
    const accessibleName = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .join(' ')
      : candidate.getAttribute('aria-label') || candidate.textContent?.trim();
    return accessibleName === name;
  });
  if (!(match instanceof HTMLElement)) throw new Error(`${role} ${name} was not found`);
  return match as T;
}

function getButton(name: string): HTMLButtonElement {
  return getByRole<HTMLButtonElement>('button', name);
}

describe('HandoffCompletionDialog', () => {
  it('anchors the confirmation to the intended recipient and exposes both choices by name', () => {
    renderDialog();

    const dialog = getByRole<HTMLDivElement>('dialog', 'Confirm final handoff');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(
      getByRole<HTMLHeadingElement>(
        'heading',
        'Has the finished work been shared with the intended recipient?',
      ),
    ).toBeInstanceOf(HTMLHeadingElement);
    expect(getByRole<HTMLHeadingElement>('heading', 'Asha Mehta')).toBeInstanceOf(
      HTMLHeadingElement,
    );
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
    const props = renderDialog({ isSubmitting: true });

    expect(getButton('Yes, handoff completed').disabled).toBe(true);
    expect(getButton('Not yet').disabled).toBe(true);
    act(() => getButton('Yes, handoff completed').click());

    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('cycles focus between the available handoff choices', () => {
    renderDialog();
    const notYet = getButton('Not yet');
    const confirmed = getButton('Yes, handoff completed');

    confirmed.focus();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })));
    expect(document.activeElement).toBe(notYet);

    notYet.focus();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })));
    expect(document.activeElement).toBe(confirmed);
  });

  it('keeps reverse tabbing inside the dialog from the initial heading focus', () => {
    renderDialog();
    const heading = getByRole<HTMLHeadingElement>('heading', 'Confirm final handoff');
    const confirmed = getButton('Yes, handoff completed');

    expect(document.activeElement).toBe(heading);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })));
    expect(document.activeElement).toBe(confirmed);
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

  it('shares one immediate completion mutation for rapid requests to the same task', async () => {
    let resolveMutation: ((value: Task) => void) | undefined;
    completionMutation.mutateAsync.mockReturnValue(
      new Promise<Task>((resolve) => {
        resolveMutation = resolve;
      }),
    );
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
    let first: Promise<Task | null> | undefined;
    let second: Promise<Task | null> | undefined;
    act(() => {
      first = requestCompletion?.({ ...task, handoffRequired: false });
      second = requestCompletion?.({ ...task, handoffRequired: false });
    });
    if (!first || !second || !resolveMutation)
      throw new Error('Completion requests were not created');

    expect(second).toBe(first);
    expect(completionMutation.mutateAsync).toHaveBeenCalledTimes(1);
    resolveMutation(task);
    await expect(first).resolves.toEqual(task);
    await expect(second).resolves.toEqual(task);
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

  it('deduplicates repeated completion requests for the same required task', async () => {
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
    let first: Promise<Task | null> | undefined;
    let second: Promise<Task | null> | undefined;
    act(() => {
      first = requestCompletion?.(task);
      second = requestCompletion?.(task);
    });
    if (!first || !second) throw new Error('Completion requests were not created');

    expect(second).toBe(first);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
  });

  it('rejects a different required task while another confirmation is pending', async () => {
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
    let first: Promise<Task | null> | undefined;
    let second: Promise<Task | null> | undefined;
    act(() => {
      first = requestCompletion?.(task);
      second = requestCompletion?.({ ...task, id: 'task-2', title: 'Prepare the annual report' });
    });
    if (!first || !second) throw new Error('Completion requests were not created');

    const differentTaskRejection = expect(second).rejects.toThrow(
      'Another task is already awaiting handoff confirmation',
    );
    expect(second).not.toBe(first);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    await differentTaskRejection;
    await expect(first).resolves.toBeNull();
  });

  it('settles an open confirmation as cancelled when the flow unmounts', async () => {
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
    let result: Promise<Task | null> | undefined;
    act(() => {
      result = requestCompletion?.(task);
    });
    if (!result) throw new Error('Completion request was not created');
    act(() => root.unmount());

    await expect(result).resolves.toBeNull();
  });

  it('locks an in-flight completion before React publishes pending state', async () => {
    let resolveMutation: ((value: Task) => void) | undefined;
    completionMutation.mutateAsync.mockReturnValue(
      new Promise<Task>((resolve) => {
        resolveMutation = resolve;
      }),
    );
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
    const completeMutation = resolveMutation;
    if (!result || !completeMutation) throw new Error('Completion request was not created');
    act(() => {
      getButton('Yes, handoff completed').click();
      getButton('Yes, handoff completed').click();
    });

    expect(completionMutation.mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      completeMutation(task);
      await result;
    });
    await expect(result).resolves.toEqual(task);
  });

  it('clears a failed completion so the member can make a new choice', async () => {
    completionMutation.mutateAsync.mockRejectedValueOnce(new Error('Network unavailable'));
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
    let failed: Promise<Task | null> | undefined;
    act(() => {
      failed = requestCompletion?.(task);
    });
    if (!failed) throw new Error('Completion request was not created');
    await act(async () => {
      getButton('Yes, handoff completed').click();
      await failed?.catch(() => undefined);
    });
    await expect(failed).rejects.toThrow('Network unavailable');

    let retry: Promise<Task | null> | undefined;
    act(() => {
      retry = requestCompletion?.(task);
    });
    if (!retry) throw new Error('Retry request was not created');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    await expect(retry).resolves.toBeNull();
  });
});
