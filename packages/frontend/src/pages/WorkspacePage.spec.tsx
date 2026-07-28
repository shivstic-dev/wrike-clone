// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspacePage from './WorkspacePage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useTasks: vi.fn(),
  createFolder: vi.fn(),
  createProject: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ workspaceId: 'department-1' }),
  useNavigate: () => mocks.navigate,
  Link: ({ children, to, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    membership: { role: 'member' },
  }),
}));

vi.mock('../api/tasks', () => ({
  useTasks: (...args: unknown[]) => mocks.useTasks(...args),
}));

vi.mock('../api/workspaces', () => ({
  useWorkspace: () => ({
    data: {
      id: 'department-1',
      name: 'Community programs',
      description: 'Program delivery',
    },
    isLoading: false,
    error: null,
  }),
  useFolderTree: () => ({
    data: [
      {
        id: 'general-folder',
        name: 'General',
        workspaceId: 'department-1',
        parentFolderId: null,
        isSystemGeneral: true,
      },
      {
        id: 'campaigns-folder',
        name: 'Campaigns',
        workspaceId: 'department-1',
        parentFolderId: null,
        isSystemGeneral: false,
      },
    ],
    isLoading: false,
  }),
  useWorkspaceProjects: () => ({
    data: [
      {
        id: 'system-project',
        folderId: 'general-folder',
        name: 'General Tasks',
        status: 'active',
        isSystem: true,
      },
      {
        id: 'campaign-project',
        folderId: 'campaigns-folder',
        name: 'Autumn appeal',
        status: 'active',
        isSystem: false,
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateFolder: () => ({
    mutateAsync: mocks.createFolder,
    isPending: false,
  }),
  useCreateProject: () => ({
    mutateAsync: mocks.createProject,
    isPending: false,
  }),
}));

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.useTasks.mockReset();
  mocks.useTasks.mockReturnValue({
    data: {
      data: [
        {
          id: 'task-1',
          title: 'Call community partners',
          status: 'todo',
          priority: 'medium',
          visibility: 'department',
          assigneeId: null,
          dueDate: null,
          estimatedHours: null,
        },
      ],
      meta: { page: 1, perPage: 100, total: 1, totalPages: 1 },
    },
    isLoading: false,
  });
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

describe('WorkspacePage folder browsing', () => {
  it('guards the task query until a folder is selected, then shows that folder tasks and projects', () => {
    act(() => {
      root = createRoot(container);
      root.render(<WorkspacePage />);
    });

    expect(mocks.useTasks).toHaveBeenLastCalledWith(
      { folderId: '', perPage: 100 },
      false,
    );
    expect(container.textContent).not.toContain('General Tasks');
    expect(container.textContent).toContain('Autumn appeal');

    const campaigns = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Campaigns'),
    );
    if (!campaigns) throw new Error('Campaigns folder was not rendered');
    act(() => campaigns.click());

    expect(mocks.useTasks).toHaveBeenLastCalledWith(
      { folderId: 'campaigns-folder', perPage: 100 },
      true,
    );
    expect(container.textContent).toContain('Tasks in Campaigns');
    expect(container.textContent).toContain('Call community partners');
    expect(container.textContent).toContain('Autumn appeal');
  });

  it('never exposes the automatic system project when General is selected', () => {
    act(() => {
      root = createRoot(container);
      root.render(<WorkspacePage />);
    });
    const general = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('General'),
    );
    if (!general) throw new Error('General folder was not rendered');
    act(() => general.click());

    expect(container.textContent).not.toContain('General Tasks');
    expect(container.textContent).not.toContain('Autumn appeal');
  });
});
