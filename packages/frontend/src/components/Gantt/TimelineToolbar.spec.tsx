// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineToolbar } from './TimelineToolbar';

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('TimelineToolbar', () => {
  it('renders native labelled navigation, zoom, filters, and critical-path controls', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <TimelineToolbar
          zoom="week"
          onZoomChange={vi.fn()}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onToday={vi.fn()}
          filters={{ projectId: '', departmentId: '', assigneeId: '', status: '', criticalOnly: false }}
          onFiltersChange={vi.fn()}
          projects={[{ id: 'project-1', label: 'Community campaign' }]}
          departments={[{ id: 'department-1', label: 'Outreach' }]}
          assignees={[{ id: 'person-1', label: 'Mira Sen' }]}
        />,
      );
    });

    expect(container.querySelector('button[aria-label="Previous date range"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Next date range"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Show today"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Timeline zoom"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Filter by project"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Filter by department"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Filter by assignee"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Filter by status"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Show critical path only"]')).not.toBeNull();
  });

  it('reports navigation, zoom, and filter changes', () => {
    const onZoomChange = vi.fn();
    const onPrevious = vi.fn();
    const onFiltersChange = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <TimelineToolbar
          zoom="day"
          onZoomChange={onZoomChange}
          onPrevious={onPrevious}
          onNext={vi.fn()}
          onToday={vi.fn()}
          filters={{ projectId: '', departmentId: '', assigneeId: '', status: '', criticalOnly: false }}
          onFiltersChange={onFiltersChange}
        />,
      );
    });

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Previous date range"]')?.click());
    const zoom = container.querySelector<HTMLSelectElement>('select[aria-label="Timeline zoom"]');
    act(() => {
      if (!zoom) return;
      zoom.value = 'month';
      zoom.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const critical = container.querySelector<HTMLInputElement>('input[aria-label="Show critical path only"]');
    act(() => critical?.click());

    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onZoomChange).toHaveBeenCalledWith('month');
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ criticalOnly: true }));
  });
});
