// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQuickTaskErrorMessage, QuickTaskModal } from './QuickTaskModal';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutateAsync: vi.fn(),
  toastCustom: vi.fn(),
  toastDismiss: vi.fn(),
  workspacesResult: {
    data: [
      {
        id: 'department-1',
        tenantId: 'tenant-1',
        name: 'Programs',
        description: null,
        icon: null,
        sortOrder: 0,
        departmentRole: 'manager',
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:00:00.000Z',
        deletedAt: null,
      },
    ],
    isPending: false,
    isError: false,
  },
  membersResult: {
    data: [
      {
        userId: 'manager-1',
        displayName: 'Maya Manager',
        email: 'maya@example.org',
        role: 'manager',
      },
      {
        userId: 'manager-2',
        displayName: 'Morgan Manager',
        email: 'morgan@example.org',
        role: 'manager',
      },
      {
        userId: 'employee-1',
        displayName: 'Eli Employee',
        email: 'eli@example.org',
        role: 'employee',
      },
    ],
    isPending: false,
    isError: false,
  },
  locationsResult: {
    data: [
      {
        folderId: 'general-folder',
        folderName: 'General',
        isGeneral: true,
        projects: [],
      },
      {
        folderId: 'campaigns-folder',
        folderName: 'Campaigns',
        isGeneral: false,
        projects: [
          {
            projectId: 'spring-appeal',
            projectName: 'Spring appeal',
          },
        ],
      },
    ],
    isPending: false,
    isError: false,
  },
  createTaskResult: {
    isPending: false,
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    custom: mocks.toastCustom,
    dismiss: mocks.toastDismiss,
  },
}));

vi.mock('../../api/task-locations', () => ({
  useTaskLocations: () => mocks.locationsResult,
}));

vi.mock('../../api/tasks', () => ({
  useCreateTask: () => ({
    ...mocks.createTaskResult,
    mutateAsync: mocks.mutateAsync,
  }),
}));

vi.mock('../../api/workspaces', () => ({
  useWorkspaces: () => mocks.workspacesResult,
  useWorkspaceMembers: () => mocks.membersResult,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    membership: { role: 'member' },
    user: { id: 'manager-1' },
  }),
}));

const createdTask = {
  id: 'task-1',
  tenantId: 'tenant-1',
  projectId: 'general-project',
  folderId: 'general-folder',
  folderName: 'General',
  projectName: 'General Tasks',
  departmentId: 'department-1',
  parentTaskId: null,
  assigneeId: null,
  assignees: [],
  createdById: 'manager-1',
  title: 'Prepare volunteer briefing',
  description: null,
  status: 'todo',
  priority: 'low',
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
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
  deletedAt: null,
};

let container: HTMLDivElement;
let root: Root | undefined;
let trigger: HTMLButtonElement;

function renderModal(onClose = vi.fn()) {
  act(() => {
    root = createRoot(container);
    root.render(<QuickTaskModal open initialDepartmentId="department-1" onClose={onClose} />);
  });
  return onClose;
}

function enterTitle(value: string) {
  const input = document.querySelector<HTMLInputElement>('#quick-task-name');
  if (!input) throw new Error('Task title input was not rendered');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('Input value setter is not available');

  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.navigate.mockReset();
  mocks.mutateAsync.mockReset();
  mocks.toastCustom.mockReset();
  mocks.toastDismiss.mockReset();
  mocks.createTaskResult.isPending = false;
  mocks.workspacesResult.data[0]!.departmentRole = 'manager';

  document.body.innerHTML = '';
  trigger = document.createElement('button');
  trigger.textContent = 'Create task';
  document.body.append(trigger);
  trigger.focus();
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = undefined;
  }
  document.body.innerHTML = '';
});

describe('QuickTaskModal', () => {
  it('renders an accessible dialog, focuses the title, and filters manager assignees', () => {
    renderModal();

    expect(document.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector('#quick-task-name'));
    expect(document.querySelector('#quick-task-visibility')).toBeNull();

    const assigneeText = document.querySelector('#quick-task-assignees')?.textContent;
    expect(assigneeText).toContain('Maya Manager');
    expect(assigneeText).toContain('Eli Employee');
    expect(assigneeText).not.toContain('Morgan Manager');
  });

  it('closes on Escape and restores focus to the trigger when unmounted', () => {
    const onClose = renderModal();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledOnce();

    act(() => root?.unmount());
    root = undefined;
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape while task creation is pending', () => {
    mocks.mutateAsync.mockImplementation(
      () =>
        new Promise(() => {
          // Deliberately unresolved so submissionRef remains active.
        }),
    );
    const onClose = renderModal();
    enterTitle('Prepare volunteer briefing');
    const form = document.querySelector('form');
    if (!form) throw new Error('Quick task form was not rendered');

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(mocks.mutateAsync).toHaveBeenCalledOnce();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps Tab focus inside the dialog', () => {
    renderModal();
    const closeButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="Close create task"]',
    );
    const cancelButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Cancel',
    );
    if (!closeButton || !cancelButton) {
      throw new Error('Expected dialog controls were not rendered');
    }

    closeButton.focus();
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(cancelButton);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(closeButton);
  });

  it('keeps the More details summary tabbable while its descendants are hidden', () => {
    renderModal();
    const summary = document.querySelector<HTMLElement>('details:not([open]) > summary');
    if (!summary) throw new Error('Closed More details summary was not rendered');
    const hiddenDescription =
      document.querySelector<HTMLTextAreaElement>('#quick-task-description');
    if (!hiddenDescription) throw new Error('Hidden More details field was not rendered');

    document
      .querySelectorAll<
        HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('button, input, select, textarea')
      .forEach((element) => {
        if (element !== hiddenDescription) element.disabled = true;
      });
    expect(hiddenDescription.disabled).toBe(false);
    hiddenDescription.focus();
    expect(document.activeElement).toBe(hiddenDescription);
    summary.focus();
    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      document.dispatchEvent(tabEvent);
    });

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(summary);
  });

  it('closes when the backdrop area is pressed', () => {
    const onClose = renderModal();
    const dialog = document.querySelector('[role="dialog"]');
    const backdropArea = dialog?.parentElement;
    if (!backdropArea) throw new Error('Backdrop area was not rendered');

    act(() => {
      backdropArea.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('guards against double submit and exposes a working Open task action', async () => {
    mocks.mutateAsync.mockResolvedValue(createdTask);
    const onClose = renderModal();
    enterTitle('Prepare volunteer briefing');
    const form = document.querySelector('form');
    if (!form) throw new Error('Quick task form was not rendered');

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.toastCustom).toHaveBeenCalledOnce();

    const toastRenderer = mocks.toastCustom.mock.calls[0]?.[0] as
      ((instance: { id: string }) => ReactNode) | undefined;
    if (!toastRenderer) throw new Error('Success toast was not created');
    const toastContainer = document.createElement('div');
    document.body.append(toastContainer);
    const toastRoot = createRoot(toastContainer);
    act(() => {
      toastRoot.render(toastRenderer({ id: 'toast-1' }));
    });
    const openTaskButton = Array.from(
      toastContainer.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent === 'Open task');
    if (!openTaskButton) throw new Error('Open task action was not rendered');

    act(() => openTaskButton.click());
    expect(mocks.toastDismiss).toHaveBeenCalledWith('toast-1');
    expect(mocks.navigate).toHaveBeenCalledWith('/tasks/task-1');
    act(() => toastRoot.unmount());
  });

  it('shows a submission error and permits retry after a failed mutation', async () => {
    mocks.mutateAsync
      .mockRejectedValueOnce({
        response: {
          data: {
            message: 'You cannot assign this task.',
          },
        },
      })
      .mockResolvedValueOnce(createdTask);
    const onClose = renderModal();
    enterTitle('Prepare volunteer briefing');
    const form = document.querySelector('form');
    if (!form) throw new Error('Quick task form was not rendered');

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'You cannot assign this task.',
    );

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('getQuickTaskErrorMessage', () => {
  it('uses the backend error envelope message', () => {
    expect(
      getQuickTaskErrorMessage({
        response: {
          data: {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Department access denied',
            },
          },
        },
      }),
    ).toBe('Department access denied');
  });

  it('uses a meaningful API response message', () => {
    expect(
      getQuickTaskErrorMessage({
        response: {
          data: {
            message: '  Managers may only assign employees or themselves.  ',
          },
        },
      }),
    ).toBe('Managers may only assign employees or themselves.');
  });

  it('uses a retry-oriented fallback instead of a generic Axios status message', () => {
    expect(getQuickTaskErrorMessage(new Error('Request failed with status code 403'))).toBe(
      'Task could not be created. Review the details and try again.',
    );
  });

  it('keeps a meaningful non-Axios error message', () => {
    expect(getQuickTaskErrorMessage(new Error('You cannot assign this task.'))).toBe(
      'You cannot assign this task.',
    );
  });
});
