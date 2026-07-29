// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TaskPriority,
  TaskStatus,
  type DashboardOverview,
  type DashboardTaskListResponse,
  type PaginatedResponse,
  type Task,
} from '@wrike-clone/shared';
import DashboardPage from './DashboardPage';

const pendingHandoffStatus = 'pending' as unknown as Task['handoffStatus'];

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
  grouped: {
    data: undefined as import('../api/tasks').GroupedDepartmentTasks | undefined,
    isLoading: false,
    error: null as Error | null,
  },
  mine: {
    data: undefined as PaginatedResponse<Task> | undefined,
    isLoading: false,
    error: null as Error | null,
  },
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
  retryGrouped: vi.fn(),
  retryMine: vi.fn(),
  myTaskCalls: [] as unknown[][],
  dashboardTaskCalls: [] as unknown[][],
}));

const overview: DashboardOverview = {
  generatedAt: '2026-07-30T12:00:00.000Z',
  windowDays: 30,
  scope: { departmentId: 'department-1', role: 'department_head' },
  totals: { active: 8, completed: 3, overdue: 2, blocked: 1, unassigned: 0, readyForHandoff: 1 },
  comparison: { completedPercentChange: 0, createdPercentChange: 0 },
  daily: [], byStatus: {}, byPriority: {}, capacity: [], attention: [], departments: [],
};

const dashboardTasks: DashboardTaskListResponse = {
  generatedAt: '2026-07-30T12:00:00.000Z', bucket: 'overdue', data: [{
    id: 'task-self-assigned', title: 'Self assigned follow-up', projectId: 'project-1', projectName: 'Community launch',
    departmentId: 'department-1', status: TaskStatus.IN_PROGRESS, handoffStatus: pendingHandoffStatus, handoffOwner: null,
    assignees: [{ userId: 'user-1', name: 'Harper Head' }], dueDate: null, handoffReadyAt: null,
  }],
};

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
    data: overview,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDashboardTasks: (...args: unknown[]) => {
    mocks.dashboardTaskCalls.push(args);
    return { data: dashboardTasks, isLoading: false, error: null, refetch: vi.fn() };
  },
}));

vi.mock('../api/tasks', () => ({
  useGroupedDepartmentTasks: () => ({
    ...mocks.grouped,
    refetch: mocks.retryGrouped,
  }),
  useMyTasks: (...args: unknown[]) => {
    mocks.myTaskCalls.push(args);
    return {
      ...mocks.mine,
      refetch: mocks.retryMine,
    };
  },
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
    root.render(
      <MemoryRouter>
        <DashboardPage />
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
  mocks.members.data = undefined;
  mocks.members.isLoading = false;
  mocks.members.error = null;
  mocks.changes.data = undefined;
  mocks.changes.isLoading = false;
  mocks.changes.error = null;
  mocks.grouped.data = undefined;
  mocks.grouped.isLoading = false;
  mocks.grouped.error = null;
  mocks.mine.data = undefined;
  mocks.mine.isLoading = false;
  mocks.mine.error = null;
  mocks.retryMembers.mockReset();
  mocks.retryChanges.mockReset();
  mocks.retryGrouped.mockReset();
  mocks.retryMine.mockReset();
  mocks.myTaskCalls.length = 0;
  mocks.dashboardTaskCalls.length = 0;
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

describe('DashboardPage personal tasks', () => {
  it('keeps the current department and reveals self-assigned tasks behind the selected total', async () => {
    await renderPage();

    const metric = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.getAttribute('aria-label') === 'Show 2 overdue tasks',
    );
    expect(metric).toBeTruthy();
    act(() => metric?.click());

    expect(mocks.dashboardTaskCalls.some((call) => {
      const [filters, enabled] = call as [{ bucket?: string; departmentId?: string }, boolean];
      return filters.bucket === 'overdue' && filters.departmentId === 'department-1' && enabled === true;
    })).toBe(true);
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Overdue');
    expect(container.textContent).toContain('Self assigned follow-up');
  });

  it('shows task identities for management roles even when grouped lanes are unavailable', async () => {
    mocks.mine.data = {
      data: [
        {
          id: 'task-1',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          departmentId: 'department-1',
          parentTaskId: null,
          assigneeId: 'user-1',
          createdById: 'user-2',
          title: 'Prepare launch brief',
          description: null,
          status: TaskStatus.TODO,
          handoffRequired: true,
          handoffStatus: pendingHandoffStatus,
          handoffOwnerId: 'user-2',
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
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
          deletedAt: null,
        },
      ],
      meta: { page: 1, perPage: 100, total: 1, totalPages: 1 },
    };

    await renderPage();

    expect(container.textContent).toContain('My tasks');
    expect(container.textContent).toContain('Prepare launch brief');
    expect(mocks.myTaskCalls.length).toBeGreaterThan(0);
    expect(mocks.myTaskCalls.every((call) => call.length === 1)).toBe(true);
  });

  it('shows fresh personal assignments when a cached grouped lane fails to refresh', async () => {
    const currentTask = {
      id: 'task-current',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      departmentId: 'department-1',
      parentTaskId: null,
      assigneeId: 'user-1',
      createdById: 'user-2',
      title: 'Current personal assignment',
      description: null,
      status: TaskStatus.TODO,
      handoffRequired: true,
      handoffStatus: pendingHandoffStatus,
      handoffOwnerId: 'user-2',
      handoffReadyAt: null,
      handoffConfirmedBy: null,
      handoffConfirmedAt: null,
      priority: TaskPriority.MEDIUM,
      estimatedHours: null,
      actualHours: null,
      startDate: null,
      dueDate: null,
      completedAt: null,
      visibility: 'department' as const,
      sortOrder: 0,
      customFields: {},
      isRecurring: false,
      recurrenceRule: null,
      createdAt: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
      deletedAt: null,
    };
    const staleTask = {
      ...currentTask,
      id: 'task-stale',
      title: 'Stale grouped assignment',
    };
    mocks.mine.data = {
      data: [currentTask],
      meta: { page: 1, perPage: 100, total: 1, totalPages: 1 },
    };
    mocks.grouped.data = {
      viewerRole: 'department_head',
      myTasks: [staleTask],
      managerGroups: [],
      employeeGroups: [],
      unassigned: [],
      members: [],
    };
    mocks.grouped.error = new Error('refresh failed');

    await renderPage();

    expect(container.textContent).toContain('Current personal assignment');
    expect(container.textContent).not.toContain('Stale grouped assignment');
  });
});
