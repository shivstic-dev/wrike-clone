// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';

interface MemberValue {
  userId: string;
  displayName: string;
  email: string;
  role: 'admin' | 'employee' | 'manager' | 'department_head';
}

interface ChangeValue {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  changedByName: string | null;
  oldRole: 'employee' | 'manager';
  newRole: 'employee' | 'manager';
  changedAt: string;
}

const mocks = vi.hoisted(() => ({
  members: {
    data: undefined as MemberValue[] | undefined,
    isLoading: false,
    error: null as Error | null,
  },
  changes: {
    data: undefined as ChangeValue[] | undefined,
    isLoading: false,
    error: null as Error | null,
  },
  retryMembers: vi.fn(),
  retryChanges: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    membership: { role: 'member' },
    user: { displayName: 'Harper Head', email: 'harper@example.com' },
  }),
}));

vi.mock('../api/dashboard', () => ({
  useDashboardOverview: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../api/tasks', () => ({
  useGroupedDepartmentTasks: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useMyTasks: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../api/workspaces', () => ({
  useWorkspaces: () => ({
    data: [
      {
        id: 'department-1',
        name: 'Community programs',
        departmentRole: 'department_head',
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useWorkspaceMembers: () => ({
    ...mocks.members,
    refetch: mocks.retryMembers,
  }),
  useDepartmentRoleChanges: () => ({
    ...mocks.changes,
    refetch: mocks.retryChanges,
  }),
  useChangeDepartmentRole: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

let container: HTMLDivElement;
let root: Root | undefined;

async function renderPage(): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(<DashboardPage />);
    await Promise.resolve();
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.members.data = undefined;
  mocks.members.isLoading = false;
  mocks.members.error = null;
  mocks.changes.data = undefined;
  mocks.changes.isLoading = false;
  mocks.changes.error = null;
  mocks.retryMembers.mockReset();
  mocks.retryChanges.mockReset();
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

describe('DashboardPage access activity', () => {
  it('shows independent loading states instead of false empty messages', async () => {
    mocks.members.isLoading = true;
    mocks.changes.isLoading = true;

    await renderPage();

    expect(container.textContent).toContain('Loading team roles');
    expect(container.textContent).toContain('Loading role-change history');
    expect(container.textContent).not.toContain('No department members are available');
    expect(container.textContent).not.toContain('No recent role changes are recorded');
  });

  it('shows local member and audit errors with query-specific retries', async () => {
    mocks.members.error = new Error('members failed');
    mocks.changes.error = new Error('changes failed');

    await renderPage();

    const alerts = Array.from(container.querySelectorAll<HTMLElement>('[role="alert"]'));
    const memberAlert = alerts.find((alert) =>
      alert.textContent?.includes('Team roles are unavailable'),
    );
    const changesAlert = alerts.find((alert) =>
      alert.textContent?.includes('Role-change history is unavailable'),
    );
    if (!memberAlert || !changesAlert) throw new Error('Access activity errors were not rendered');

    act(() => {
      memberAlert.querySelector<HTMLButtonElement>('button')?.click();
      changesAlert.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(mocks.retryMembers).toHaveBeenCalledOnce();
    expect(mocks.retryChanges).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain('No recent role changes are recorded');
  });

  it('uses empty copy only after both queries resolve successfully', async () => {
    mocks.members.data = [];
    mocks.changes.data = [];

    await renderPage();

    expect(container.textContent).toContain('No department members are available');
    expect(container.textContent).toContain('No recent role changes are recorded');
  });
});
