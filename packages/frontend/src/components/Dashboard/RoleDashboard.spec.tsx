// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DashboardOverview, DashboardViewerRole } from '@wrike-clone/shared';
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
      readyForHandoff: 3,
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
async function renderDashboard(
  value: DashboardOverview,
  groupedValue: GroupedDepartmentTasks | null = grouped,
): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <RoleDashboard
        grouped={groupedValue ?? undefined}
        onSelectBucket={() => undefined}
        overview={value}
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
  it('sends the selected bucket from an accessible exact-count metric', async () => {
    const onSelectBucket = vi.fn();
    await act(async () => {
      root = createRoot(container);
      root.render(
        <RoleDashboard overview={overview({ role: 'manager' })} onSelectBucket={onSelectBucket} />,
      );
      await Promise.resolve();
    });

    const metric = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.getAttribute('aria-label') === 'Show 2 overdue tasks',
    );
    expect(metric).toBeTruthy();
    act(() => metric?.click());
    expect(onSelectBucket).toHaveBeenCalledWith('overdue');
  });

  it.each([
    ['employee', ['My workload'], ['Team capacity', 'Create task']],
    ['manager', ['My workload', 'Team capacity', 'Unassigned work'], []],
    ['department_head', ['Manager work', 'Employee work', 'Team capacity'], []],
    ['admin', ['Department comparison', 'Work coverage'], []],
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

  it.each([
    ['manager', ['My workload', 'Unassigned work', 'Employee work']],
    ['department_head', ['My work', 'Unassigned work', 'Manager work', 'Employee work']],
  ] as const)(
    'keeps %s overview panels visible without rendering false empty grouped lanes',
    async (role, hiddenLanes) => {
      await renderDashboard(overview({ role }), null);

      expect(container.textContent).toContain('Active work');
      expect(container.textContent).toContain('Attention queue');
      expect(container.textContent).toContain('Team capacity');
      hiddenLanes.forEach((lane) => expect(container.textContent).not.toContain(lane));
    },
  );

  it('links every attention item directly to its task', async () => {
    await renderDashboard(overview({ role: 'manager' }));

    const taskLink = container.querySelector<HTMLAnchorElement>('a[href="/tasks/task-attention"]');
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

  it('stacks each capacity bar below the name and count until the small breakpoint', async () => {
    await renderDashboard(overview({ role: 'manager' }));

    const bar = container.querySelector<HTMLElement>('[aria-label="Maya Manager: 5 open tasks"]');
    const row = bar?.closest('li');
    expect(row?.className).toContain('grid-cols-[2rem_minmax(0,1fr)_auto]');
    expect(row?.className).toContain(
      'sm:grid-cols-[2rem_minmax(5rem,0.65fr)_minmax(5rem,1fr)_auto]',
    );
    expect(bar?.className).toContain('col-span-3');
    expect(bar?.className).toContain('row-start-2');
    expect(bar?.className).toContain('sm:col-span-1');
  });

  it('shows an honest comparison state when the prior window has no baseline', async () => {
    const value = overview({ role: 'employee' });
    value.comparison.completedPercentChange = null;
    await renderDashboard(value);

    expect(container.textContent).toContain('No prior 30-day baseline');
  });
});
