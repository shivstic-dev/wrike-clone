// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectPage from './ProjectPage';

const mocks = vi.hoisted(() => ({
  taskQueries: [] as unknown[],
  timelineScopes: [] as unknown[],
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    membership: { role: 'member' },
    user: { id: 'user-1' },
  }),
}));

vi.mock('../api/workspaces', () => ({
  useProject: () => ({
    data: {
      id: 'project-1',
      name: 'Community launch',
      folderId: null,
      departmentId: 'department-1',
      dueDate: null,
      status: 'active',
    },
    isLoading: false,
    error: null,
  }),
  useWorkspaces: () => ({
    data: [{ id: 'department-1', departmentRole: 'manager' }],
  }),
  useWorkspaceMembers: () => ({ data: [] }),
}));

vi.mock('../api/tasks', () => ({
  useTasks: (query: unknown) => {
    mocks.taskQueries.push(query);
    return {
      data: { data: [], meta: { page: 1, perPage: 100, total: 0, totalPages: 0 } },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
  },
  useCreateTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../components/Gantt/TimelineView', () => ({
  TimelineView: ({ scope }: { scope: unknown }) => {
    mocks.timelineScopes.push(scope);
    return <section aria-label="Project timeline">Timeline content</section>;
  },
}));

let container: HTMLDivElement;
let root: Root | undefined;

async function renderPage(): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await Promise.resolve();
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.taskQueries.length = 0;
  mocks.timelineScopes.length = 0;
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

describe('ProjectPage timeline', () => {
  it('keeps task queries capped for Tasks and Board while Timeline uses the project scope', async () => {
    await renderPage();

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('nav button'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Tasks', 'Board', 'Timeline']);
    expect(mocks.taskQueries).toContainEqual({ projectId: 'project-1', perPage: 100 });
    expect(mocks.timelineScopes).toHaveLength(0);

    await act(async () => {
      tabs.find((tab) => tab.textContent === 'Timeline')?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[aria-label="Project timeline"]')).not.toBeNull();
    expect(mocks.timelineScopes).toContainEqual({ kind: 'project', projectId: 'project-1' });
  });
});
