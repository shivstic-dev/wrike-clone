// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TaskStatus, type DashboardTaskListResponse } from '@wrike-clone/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardTaskDrawer } from './DashboardTaskDrawer';

const pendingHandoffStatus =
  'pending' as unknown as DashboardTaskListResponse['data'][number]['handoffStatus'];

const response: DashboardTaskListResponse = {
  generatedAt: '2026-07-30T12:00:00.000Z',
  bucket: 'ready_for_handoff',
  data: [
    {
      id: 'task-1',
      title: 'Send grant update',
      projectId: 'project-1',
      projectName: 'Grant campaign',
      departmentId: 'department-1',
      status: TaskStatus.IN_PROGRESS,
      handoffStatus: pendingHandoffStatus,
      handoffOwner: { id: 'owner-1', displayName: 'Maya Owner', email: 'maya@example.com' },
      assignees: [{ userId: 'assignee-1', name: 'Eli Assignee' }],
      dueDate: '2026-08-01T00:00:00.000Z',
      handoffReadyAt: '2026-07-30T10:00:00.000Z',
    },
  ],
};

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('DashboardTaskDrawer', () => {
  it('renders the selected bucket task details and can be closed with Escape or Close', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root = createRoot(container);
      root.render(
        <DashboardTaskDrawer
          bucket="ready_for_handoff"
          query={{ data: response, isLoading: false, error: null, refetch: vi.fn() }}
          onClose={onClose}
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Ready for handoff');
    ['Send grant update', 'Grant campaign', 'Eli Assignee', 'Maya Owner', 'Aug'].forEach((text) =>
      expect(container.textContent).toContain(text),
    );
    act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(onClose).toHaveBeenCalledOnce();
    act(() =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Close task list"]')?.click(),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps loading, retry, and empty states safe inside the selected bucket', async () => {
    const refetch = vi.fn();
    await act(async () => {
      root = createRoot(container);
      root.render(
        <DashboardTaskDrawer
          bucket="blocked"
          query={{ isLoading: true, error: null, refetch }}
          onClose={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
      'Loading blocked tasks',
    );

    await act(async () => {
      root?.render(
        <DashboardTaskDrawer
          bucket="blocked"
          query={{ isLoading: false, error: new Error('offline'), refetch }}
          onClose={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Task list is unavailable',
    );
    act(() => container.querySelector<HTMLButtonElement>('[role="alert"] button')?.click());
    expect(refetch).toHaveBeenCalledOnce();

    await act(async () => {
      root?.render(
        <DashboardTaskDrawer
          bucket="blocked"
          query={{
            data: { ...response, bucket: 'blocked', data: [] },
            isLoading: false,
            error: null,
            refetch,
          }}
          onClose={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    expect(container.textContent).toContain('No blocked tasks are in this scope.');
  });
});
