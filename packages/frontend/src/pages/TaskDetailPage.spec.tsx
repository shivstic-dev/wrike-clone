// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TaskDetailPage from './TaskDetailPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  moveLocation: vi.fn(),
  departmentRole: 'manager',
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
};

vi.mock('react-router-dom', () => ({
  useParams: () => ({ taskId: 'task-1' }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
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
    mutateAsync: vi.fn(),
  }),
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
  useWorkspaceMembers: () => ({ data: [] }),
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

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.departmentRole = 'manager';
  mocks.moveLocation.mockReset();
  mocks.moveLocation.mockResolvedValue(task);
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
