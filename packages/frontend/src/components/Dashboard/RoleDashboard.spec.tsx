// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  DashboardOverview,
  DashboardViewerRole,
} from '@wrike-clone/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupedDepartmentTasks } from '../../api/tasks';
import { RoleDashboard } from './RoleDashboard';

vi.mock('react-router-dom', () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('./WorkMovementChart', () => ({
  default: () => <div>Live movement chart</div>,
}));

vi.mock('./DistributionChart', () => ({
  default: () => <div>Live distribution chart</div>,
}));

function overview({ role }: { role: DashboardViewerRole }): DashboardOverview {
  return {
    generatedAt: '2026-07-28T12:00:00Z',
    windowDays: 30,
    scope: { departmentId: 'department-1', role },
    totals: {
      active: 8,
      completed: 5,
      overdue: 2,
      blocked: 1,
      unassigned: 1,
    },
    comparison: {
      completedPercentChange: 25,
      createdPercentChange: -10,
    },
    daily: [{ date: '2026-07-28', created: 3, completed: 2 }],
    byStatus: { todo: 3, in_progress: 5 },
    byPriority: { medium: 5, high: 3 },
    capacity: [
      { userId: 'user-1', name: 'Maya Manager', openTasks: 5, overdue: 1 },
      { userId: 'user-2', name: 'Eli Employee', openTasks: 3, overdue: 0 },
    ],
    attention: [
      {
        id: 'task-attention',
        title: 'Finalize donor report',
        reason: 'overdue',
        dueDate: '2026-07-26T12:00:00Z',
        assigneeName: 'Maya Manager',
      },
    ],
    departments: [
      {
        id: 'department-1',
        name: 'Community programs',
        active: 8,
        overdue: 2,
        completionRate: 38,
      },
    ],
  };
}

const grouped: GroupedDepartmentTasks = {
  viewerRole: 'admin',
  myTasks: [],
  managerGroups: [],
  employeeGroups: [],
  unassigned: [],
  members: [],
};

let container: HTMLDivElement;
let root: Root | undefined;
const retryOverview = vi.fn();

async function renderDashboard(value: DashboardOverview): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <RoleDashboard
        overview={value}
        grouped={grouped}
        onRetryOverview={retryOverview}
      />,
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
  retryOverview.mockReset();
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

describe('RoleDashboard', () => {
  it.each([
    ['employee', ['My workload'], ['Team capacity', 'Create task']],
    ['manager', ['My workload', 'Team capacity', 'Unassigned work'], []],
    ['department_head', ['Manager work', 'Employee work', 'Recent role changes'], []],
    ['admin', ['Department comparison', 'Setup health'], []],
  ] as const)('renders %s dashboard capabilities', async (role, shown, hidden) => {
    await renderDashboard(overview({ role }));

    shown.forEach((text) => expect(container.textContent).toContain(text));
    hidden.forEach((text) => expect(container.textContent).not.toContain(text));
    expect(container.querySelector(`[data-dashboard-role="${role}"]`)).not.toBeNull();
  });

  it('selects the composition from the overview scope instead of grouped viewer role', async () => {
    await renderDashboard(overview({ role: 'employee' }));

    expect(container.querySelector('[data-dashboard-role="employee"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Department comparison');
  });

  it('links every attention item directly to its task', async () => {
    await renderDashboard(overview({ role: 'manager' }));

    const taskLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/tasks/task-attention"]',
    );
    expect(taskLink?.textContent).toContain('Finalize donor report');
    expect(taskLink?.textContent).toContain('Overdue');
  });

  it('labels capacity as exact open task counts without inventing hours or percentages', async () => {
    await renderDashboard(overview({ role: 'manager' }));

    expect(container.textContent).toContain('5 open');
    expect(container.textContent).toContain('3 open');
    expect(container.textContent).toContain('Open task counts');
    expect(container.textContent).not.toContain('68%');
  });

  it('shows an honest comparison state when the prior window has no baseline', async () => {
    const value = overview({ role: 'employee' });
    value.comparison.completedPercentChange = null;
    await renderDashboard(value);

    expect(container.textContent).toContain('No baseline');
    expect(container.textContent).toContain('No prior completions to compare');
  });

  it('refreshes only the overview from the field-note control', async () => {
    await renderDashboard(overview({ role: 'employee' }));
    const refresh = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Refresh overview',
    );
    if (!refresh) throw new Error('Overview refresh button was not rendered');

    act(() => refresh.click());

    expect(retryOverview).toHaveBeenCalledOnce();
  });
});
