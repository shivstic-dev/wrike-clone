// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsPanel } from './ReportsPanel';

const mocks = vi.hoisted(() => ({
  auth: {
    membership: { role: 'member' },
    user: { id: 'manager-1' },
  },
  departments: [
    {
      id: 'department-1',
      name: 'Programs',
      departmentRole: 'manager',
    },
    {
      id: 'department-2',
      name: 'Operations',
      departmentRole: 'employee',
    },
  ],
  members: [
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
  report: {
    data: undefined as
      | {
          generatedAt: string;
          filters: Record<string, string | undefined>;
          scope: {
            departmentId?: string;
            role: string;
            mode: 'self' | 'individual' | 'combined';
            ownTasksOnly: boolean;
          };
          totals: {
            tasks: number;
            completed: number;
            overdue: number;
            averageCompletionHours: number | null;
          };
          byStatus: Record<string, number>;
          byPriority: Record<string, number>;
          byAssignee: Array<{
            assignee: string;
            total: number;
            completed: number;
            overdue: number;
          }>;
          tasks: Array<{
            id: string;
            departmentName: string;
            title: string;
            assigneeName: string | null;
            status: string;
            priority: string;
            dueDate: string | null;
          }>;
        }
      | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  useDepartmentReport: vi.fn(),
  downloadDepartmentReport: vi.fn(),
  toastError: vi.fn(),
}));

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

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: mocks.toastError,
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mocks.members }),
}));

vi.mock('../../api/workspaces', () => ({
  useWorkspaces: () => ({
    data: mocks.departments,
    isLoading: false,
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('../../api/reports', () => ({
  useDepartmentReport: (...args: unknown[]) => mocks.useDepartmentReport(...args),
  downloadDepartmentReport: (...args: unknown[]) => mocks.downloadDepartmentReport(...args),
}));

let container: HTMLDivElement;
let root: Root | undefined;

function reportData(
  tasks: NonNullable<typeof mocks.report.data>['tasks'],
): NonNullable<typeof mocks.report.data> {
  return {
    generatedAt: '2026-07-28T00:00:00.000Z',
    filters: {},
    scope: {
      departmentId: 'department-1',
      role: 'manager',
      mode: 'combined',
      ownTasksOnly: false,
    },
    totals: {
      tasks: tasks.length,
      completed: 0,
      overdue: 0,
      averageCompletionHours: null,
    },
    byStatus: {},
    byPriority: {},
    byAssignee: [],
    tasks,
  };
}

function renderPanel() {
  act(() => {
    root = createRoot(container);
    root.render(<ReportsPanel />);
  });
}

function selectByLabel(labelText: string): HTMLSelectElement {
  const label = Array.from(container.querySelectorAll('label')).find((candidate) =>
    candidate.textContent?.includes(labelText),
  );
  const select = label?.querySelector('select');
  if (!select) throw new Error(`${labelText} select was not rendered`);
  return select;
}

function inputByLabel(labelText: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll('label')).find((candidate) =>
    candidate.textContent?.includes(labelText),
  );
  const input = label?.querySelector('input');
  if (!input) throw new Error(`${labelText} input was not rendered`);
  return input;
}

function changeSelect(select: HTMLSelectElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('Select value setter unavailable');
  act(() => {
    setValue.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.report.data = reportData([]);
  mocks.report.isLoading = false;
  mocks.report.isError = false;
  mocks.report.refetch.mockReset();
  mocks.useDepartmentReport.mockReset();
  mocks.useDepartmentReport.mockImplementation(() => mocks.report);
  mocks.downloadDepartmentReport.mockReset();
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

describe('ReportsPanel', () => {
  it('derives permitted scope again when department reporting context changes', () => {
    renderPanel();

    expect(selectByLabel('Report scope').value).toBe('combined');
    changeSelect(selectByLabel('Department'), 'department-2');

    const scope = selectByLabel('Report scope');
    expect(scope.value).toBe('self');
    expect(Array.from(scope.options).map((option) => option.value)).toEqual(['self']);
    expect(mocks.useDepartmentReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ departmentId: 'department-2', scope: 'self' }),
      true,
    );
  });

  it('keeps controls mounted after a report error and retries only the report', () => {
    mocks.report.data = undefined;
    mocks.report.isError = true;
    renderPanel();

    expect(selectByLabel('Department')).toBeInstanceOf(HTMLSelectElement);
    expect(container.textContent).toContain('Your filters are still selected');
    const retry = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Retry report',
    );
    if (!retry) throw new Error('Retry report action was not rendered');
    act(() => retry.click());
    expect(mocks.report.refetch).toHaveBeenCalledOnce();
  });

  it('explains empty active filters and disables both exports', () => {
    renderPanel();

    expect(container.textContent).toContain('No tasks match this report');
    expect(container.textContent).toContain('Scope: Combined team');
    expect(inputByLabel('Created from')).toBeInstanceOf(HTMLInputElement);
    expect(inputByLabel('Created to')).toBeInstanceOf(HTMLInputElement);
    const exportButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button'),
    ).filter((button) => button.textContent?.startsWith('Export'));
    expect(exportButtons).toHaveLength(2);
    expect(exportButtons.every((button) => button.disabled)).toBe(true);
  });

  it('renders current task links and readable fallback values', () => {
    mocks.report.data = reportData([
      {
        id: 'task-1',
        departmentName: 'Programs',
        title: 'Call community partners',
        assigneeName: null,
        status: 'in_progress',
        priority: 'high',
        dueDate: null,
      },
    ]);
    renderPanel();

    const taskLink = container.querySelector<HTMLAnchorElement>('a[href="/tasks/task-1"]');
    expect(taskLink?.textContent).toBe('Call community partners');
    expect(container.textContent).toContain('Programs');
    expect(container.textContent).toContain('Unassigned');
    expect(container.textContent).toContain('in progress');
    expect(container.textContent).toContain('No due date');
    const exportButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button'),
    ).filter((button) => button.textContent?.startsWith('Export'));
    expect(exportButtons.every((button) => !button.disabled)).toBe(true);
  });
});
