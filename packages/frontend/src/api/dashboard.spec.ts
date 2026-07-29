// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from './client';
import {
  buildDashboardParams,
  dashboardKeys,
  requestDashboardOverview,
  requestDashboardTasks,
  useDashboardTasks,
  useDashboardOverview,
} from './dashboard';

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
  },
}));

const getMock = vi.mocked(apiClient.get);
let mountedRoot: Root | undefined;
let mountedContainer: HTMLDivElement | undefined;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  getMock.mockReset();
});

afterEach(() => {
  if (mountedRoot) {
    act(() => mountedRoot?.unmount());
    mountedRoot = undefined;
  }
  mountedContainer?.remove();
  mountedContainer = undefined;
});

describe('dashboard API', () => {
  it('uses stable dashboard query parameter order', () => {
    expect(buildDashboardParams({ departmentId: 'department-1', days: 30 }).toString()).toBe(
      'departmentId=department-1&days=30',
    );
  });

  it('omits an absent department without omitting the fixed window', () => {
    expect(buildDashboardParams({ days: 30 }).toString()).toBe('days=30');
    expect(buildDashboardParams({ departmentId: '   ', days: 30 }).toString()).toBe('days=30');
  });

  it('builds a canonical overview key from equivalent filters', () => {
    expect(dashboardKeys.overview({ departmentId: ' department-1 ', days: 30 })).toEqual([
      'dashboard',
      'overview',
      'departmentId=department-1&days=30',
    ]);
    expect(dashboardKeys.overview({ departmentId: undefined, days: 30 })).toEqual(
      dashboardKeys.overview({ days: 30 }),
    );
  });

  it('requests the typed overview using the canonical parameters', async () => {
    const response = { generatedAt: '2026-07-28T12:00:00.000Z', windowDays: 30 };
    getMock.mockResolvedValueOnce({ data: response });

    await expect(
      requestDashboardOverview({ departmentId: ' department-1 ', days: 30 }),
    ).resolves.toBe(response);
    const [, config] = getMock.mock.calls[0] ?? [];

    expect(getMock).toHaveBeenCalledWith('/dashboard/overview', expect.any(Object));
    expect(config?.params?.toString()).toBe('departmentId=department-1&days=30');
  });

  it('serializes the ready-for-handoff bucket and current department exactly', async () => {
    const response = { generatedAt: '2026-07-30T12:00:00.000Z', bucket: 'ready_for_handoff', data: [] };
    getMock.mockResolvedValueOnce({ data: response });

    await expect(
      requestDashboardTasks({
        departmentId: ' department-1 ',
        days: 30,
        bucket: 'ready_for_handoff',
      }),
    ).resolves.toBe(response);

    const [, config] = getMock.mock.calls[0] ?? [];
    expect(getMock).toHaveBeenCalledWith('/dashboard/tasks', expect.any(Object));
    expect(config?.params?.toString()).toBe(
      'departmentId=department-1&days=30&bucket=ready_for_handoff',
    );
  });

  it('does not fetch when the overview query is disabled', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    function Harness() {
      useDashboardOverview({ days: 30 }, false);
      return null;
    }

    mountedContainer = document.createElement('div');
    document.body.append(mountedContainer);
    mountedRoot = createRoot(mountedContainer);

    await act(async () => {
      mountedRoot?.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(Harness)),
      );
      await Promise.resolve();
    });

    expect(getMock).not.toHaveBeenCalled();
  });

  it('does not fetch bucket tasks until a valid selection enables it', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    function Harness() {
      useDashboardTasks({ bucket: 'overdue', days: 30 }, false);
      return null;
    }

    mountedContainer = document.createElement('div');
    document.body.append(mountedContainer);
    mountedRoot = createRoot(mountedContainer);

    await act(async () => {
      mountedRoot?.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(Harness)),
      );
      await Promise.resolve();
    });

    expect(getMock).not.toHaveBeenCalled();
  });
});
