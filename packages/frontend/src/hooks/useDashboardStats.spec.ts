// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardStats } from './useDashboardStats';
import * as dashboardApi from '../api/dashboard';

vi.mock('../api/dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof dashboardApi>();
  return {
    ...actual,
    useDashboardOverview: vi.fn(),
  };
});

const mockUseDashboardOverview = vi.mocked(dashboardApi.useDashboardOverview);

let mountedRoot: Root | undefined;
let mountedContainer: HTMLDivElement | undefined;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mockUseDashboardOverview.mockReset();
});

afterEach(() => {
  if (mountedRoot) {
    act(() => mountedRoot?.unmount());
    mountedRoot = undefined;
  }
  mountedContainer?.remove();
  mountedContainer = undefined;
});

describe('useDashboardStats', () => {
  it('wraps useDashboardOverview with default filters when no filters provided', async () => {
    const mockOverview = { generatedAt: '2026-07-31T00:00:00.000Z', windowDays: 30 };
    mockUseDashboardOverview.mockReturnValue({
      data: mockOverview,
      isLoading: false,
      error: null,
    } as any);

    let result: any;
    function Harness() {
      result = useDashboardStats();
      return null;
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mountedContainer = document.createElement('div');
    document.body.append(mountedContainer);
    mountedRoot = createRoot(mountedContainer);

    await act(async () => {
      mountedRoot?.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(Harness)),
      );
      await Promise.resolve();
    });

    expect(mockUseDashboardOverview).toHaveBeenCalledWith(
      { departmentId: undefined, days: 30 },
      true,
    );
    expect(result.data).toEqual(mockOverview);
  });

  it('passes custom filters and enabled flag to useDashboardOverview', async () => {
    mockUseDashboardOverview.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as any);

    function Harness() {
      useDashboardStats({ departmentId: 'dept-123', days: 30 }, false);
      return null;
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mountedContainer = document.createElement('div');
    document.body.append(mountedContainer);
    mountedRoot = createRoot(mountedContainer);

    await act(async () => {
      mountedRoot?.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(Harness)),
      );
      await Promise.resolve();
    });

    expect(mockUseDashboardOverview).toHaveBeenCalledWith(
      { departmentId: 'dept-123', days: 30 },
      false,
    );
  });
});
