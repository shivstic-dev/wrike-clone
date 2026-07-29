// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TaskDetailPage from './TaskDetailPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  moveLocation: vi.fn(),
  updateTask: vi.fn(),
  requestCompletion: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  departmentRole: 'manager',
  members: [] as Array<{ userId: string; displayName: string; email: string; role: 'employee' | 'manager' | 'department_head' | 'admin' }>,
}));

const task = {
  id: 'task-1',
  departmentId: 'department-1',
  departmentName: 'Community programs',
  folderId: 'general-folder',
  folderName: 'General',
  projectId: 'general-project',
  projectName: 'General Tasks',
  isSystemProject: true,
  title: 'Prepare volunteer briefing',
  description: null,
  status: 'todo',
  priority: 'medium',
  assigneeId: null,
  assignees: [],
  startDate: null,
  dueDate: null,
  estimatedHours: null,
  actualHours: null,
  handoffRequired: true,
  handoffStatus: 'pending',
  handoffOwnerId: 'owner-1',
  handoffOwner: { id: 'owner-1', displayName: 'Asha Owner', email: 'asha@example.org' },
  handoffReadyAt: null,
  handoffConfirmedBy: null as string | null,
  handoffConfirmedAt: null as string | null,
};

vi.mock('react-router-dom', () => ({
  useParams: () => ({ taskId: 'task-1' }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('../api/tasks', () => ({
  useTask: () => ({
    data: task,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateTask: () => ({
    mutateAsync: mocks.updateTask,
  }),
}));

vi.mock('../components/Task/useTaskCompletionFlow', () => ({
  useTaskCompletionFlow: () => ({
    requestCompletion: mocks.requestCompletion,
    dialogProps: {
      open: false,
      task: null,
      isPending: false,
      onConfirm: vi.fn(),
      onNotYet: vi.fn(),
      onCancel: vi.fn(),
    },
  }),
}));

vi.mock('../components/Task/HandoffCompletionDialog', () => ({
  HandoffCompletionDialog: () => null,
}));

vi.mock('../api/task-locations', () => ({
  useTaskLocations: () => ({
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
            projectId: 'appeal-project',
            projectName: 'Autumn appeal',
          },
        ],
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useMoveTaskLocation: () => ({
    mutateAsync: mocks.moveLocation,
    isPending: false,
  }),
}));

vi.mock('../api/workspaces', () => ({
  useWorkspaces: () => ({
    data: [
      {
        id: 'department-1',
        name: 'Community programs',
        departmentRole: mocks.departmentRole,
      },
    ],
  }),
  useWorkspaceMembers: () => ({ data: mocks.members }),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    membership: { role: 'member' },
    user: { id: 'manager-1' },
  }),
}));

vi.mock('../components/Comments/CommentSection', () => ({
  CommentSection: () => <div>Comments</div>,
}));

let container: HTMLDivElement;
let root: Root | undefined;

function changeSelect(select: HTMLSelectElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('Select value setter is not available');
  setValue.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function getByRole<T extends HTMLElement>(role: 'combobox', name: string): T {
  const control = [...container.querySelectorAll<HTMLElement>('select')].find((candidate) => {
    const label = candidate.id
      ? container.querySelector(`label[for="${candidate.id}"]`)
      : null;
    return label?.textContent?.trim() === name;
  });
  if (!(control instanceof HTMLElement)) throw new Error(`${role} named ${name} was not rendered`);
  return control as T;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.departmentRole = 'manager';
  mocks.members = [];
  task.status = 'todo';
  task.handoffRequired = true;
  task.handoffConfirmedBy = null;
  task.handoffConfirmedAt = null;
  mocks.moveLocation.mockReset();
  mocks.moveLocation.mockResolvedValue(task);
  mocks.updateTask.mockReset();
  mocks.updateTask.mockResolvedValue(task);
  mocks.requestCompletion.mockReset();
  mocks.requestCompletion.mockResolvedValue({ ...task, status: 'completed', handoffStatus: 'confirmed' });
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
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

describe('TaskDetailPage location editor', () => {
  it('moves to a folder General Tasks location before offering that folder projects', async () => {
    act(() => {
      root = createRoot(container);
      root.render(<TaskDetailPage />);
    });

    const department = container.querySelector<HTMLInputElement>('#task-location-department');
    const folder = container.querySelector<HTMLSelectElement>('#task-location-folder');
    const project = container.querySelector<HTMLSelectElement>('#task-location-project');
    if (!department || !folder || !project) {
      throw new Error('Location controls were not rendered');
    }
    expect(department.readOnly).toBe(true);
    expect(project.textContent).toContain('General Tasks');
    expect(project.textContent).not.toContain('Autumn appeal');

    await act(async () => {
      changeSelect(folder, 'campaigns-folder');
      await Promise.resolve();
    });
    expect(mocks.moveLocation).toHaveBeenLastCalledWith({
      taskId: 'task-1',
      folderId: 'campaigns-folder',
    });
    expect(project.textContent).toContain('Autumn appeal');

    await act(async () => {
      changeSelect(project, 'appeal-project');
      await Promise.resolve();
    });
    expect(mocks.moveLocation).toHaveBeenLastCalledWith({
      taskId: 'task-1',
      folderId: 'campaigns-folder',
      projectId: 'appeal-project',
    });
  });

  it('does not show movement controls to an employee', () => {
    mocks.departmentRole = 'employee';
    act(() => {
      root = createRoot(container);
      root.render(<TaskDetailPage />);
    });

    expect(container.querySelector('#task-location-folder')).toBeNull();
  });
});

describe('TaskDetailPage handoff completion', () => {
  it('shows a confirmer as a team member name instead of their internal identifier', () => {
    const confirmerId = '8d5f0c85-57d1-46f8-9fd0-5e1346ad875e';
    task.handoffConfirmedBy = confirmerId;
    task.handoffConfirmedAt = '2026-07-30T10:00:00.000Z';
    mocks.members = [
      {
        userId: confirmerId,
        displayName: 'Maya Mehta',
        email: 'maya@example.org',
        role: 'employee',
      },
    ];

    act(() => {
      root = createRoot(container);
      root.render(<TaskDetailPage />);
    });

    expect(container.textContent).toContain('Maya Mehta');
    expect(container.textContent).not.toContain(task.handoffConfirmedBy);
  });

  it('opens handoff confirmation when status changes to completed', async () => {
    act(() => {
      root = createRoot(container);
      root.render(<TaskDetailPage />);
    });

    const status = getByRole<HTMLSelectElement>('combobox', 'Status');

    await act(async () => {
      changeSelect(status, 'completed');
      await Promise.resolve();
    });

    expect(mocks.requestCompletion).toHaveBeenCalledWith(task);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it('uses the generic update only when reopening from Completed', async () => {
    task.status = 'completed';

    act(() => {
      root = createRoot(container);
      root.render(<TaskDetailPage />);
    });

    const status = getByRole<HTMLSelectElement>('combobox', 'Status');
    await act(async () => {
      changeSelect(status, 'in_progress');
      await Promise.resolve();
    });

    expect(mocks.updateTask).toHaveBeenCalledWith({ id: 'task-1', status: 'in_progress' });
    expect(mocks.requestCompletion).not.toHaveBeenCalled();
  });

  it('keeps a Not yet task outside Completed and shows the Ready for handoff toast', async () => {
    mocks.requestCompletion.mockResolvedValue({ ...task, status: 'in_progress', handoffStatus: 'ready' });
    act(() => {
      root = createRoot(container);
      root.render(<TaskDetailPage />);
    });

    await act(async () => {
      changeSelect(getByRole<HTMLSelectElement>('combobox', 'Status'), 'completed');
      await Promise.resolve();
    });

    expect(task.status).not.toBe('completed');
    expect(mocks.updateTask).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Saved in Ready for handoff');
  });

  it('shows the exact confirmation toast after a confirmed handoff', async () => {
    act(() => {
      root = createRoot(container);
      root.render(<TaskDetailPage />);
    });

    await act(async () => {
      changeSelect(getByRole<HTMLSelectElement>('combobox', 'Status'), 'completed');
      await Promise.resolve();
    });

    expect(mocks.toastSuccess).toHaveBeenCalledWith('Handoff confirmed and task completed');
  });

  it('does not show a dialog for a handoff-disabled task', async () => {
    task.handoffRequired = false;
    act(() => {
      root = createRoot(container);
      root.render(<TaskDetailPage />);
    });

    await act(async () => {
      changeSelect(getByRole<HTMLSelectElement>('combobox', 'Status'), 'completed');
      await Promise.resolve();
    });

    expect(mocks.requestCompletion).toHaveBeenCalledWith(expect.objectContaining({ handoffRequired: false }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('leaves the detail unchanged when the handoff dialog is cancelled', async () => {
    mocks.requestCompletion.mockResolvedValue(null);
    act(() => {
      root = createRoot(container);
      root.render(<TaskDetailPage />);
    });

    await act(async () => {
      changeSelect(getByRole<HTMLSelectElement>('combobox', 'Status'), 'completed');
      await Promise.resolve();
    });

    expect(task.status).toBe('todo');
    expect(mocks.updateTask).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('shows an error if handoff completion fails', async () => {
    mocks.requestCompletion.mockRejectedValue(new Error('Network unavailable'));
    act(() => {
      root = createRoot(container);
      root.render(<TaskDetailPage />);
    });

    await act(async () => {
      changeSelect(getByRole<HTMLSelectElement>('combobox', 'Status'), 'completed');
      await Promise.resolve();
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Failed to update status');
  });
});
