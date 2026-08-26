// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductGuide } from './ProductGuide';

let container: HTMLDivElement;
let root: Root | undefined;

async function renderGuide({
  canQuickCreate = true,
  role = 'employee',
}: {
  canQuickCreate?: boolean;
  role?: 'admin' | 'employee';
} = {}) {
  const onClose = vi.fn();
  const onCreateTask = vi.fn();

  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter>
        <ProductGuide
          canQuickCreate={canQuickCreate}
          onClose={onClose}
          onCreateTask={onCreateTask}
          role={role}
        />
      </MemoryRouter>,
    );
  });

  return { onClose, onCreateTask };
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

describe('ProductGuide', () => {
  it('walks a creator into the real quick-task action', async () => {
    const { onCreateTask } = await renderGuide();
    const next = () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent === 'Next',
      );

    act(() => next()?.click());
    act(() => next()?.click());
    const createTask = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Create a task',
    );
    act(() => createTask?.click());

    expect(onCreateTask).toHaveBeenCalledOnce();
  });

  it('sends administrators to the real reports page', async () => {
    await renderGuide({ role: 'admin' });
    const next = () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent === 'Next',
      );

    act(() => next()?.click());
    act(() => next()?.click());
    act(() => next()?.click());

    expect(container.querySelector('a[href="/reports"]')?.textContent).toContain('Open reports');
  });

  it('does not claim task-creation access when the role cannot create', async () => {
    await renderGuide({ canQuickCreate: false });
    const next = () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent === 'Next',
      );

    act(() => next()?.click());
    act(() => next()?.click());

    expect(container.textContent).toContain('A manager can create and assign new work.');
    expect(container.querySelector('a[href="/my-tasks"]')).not.toBeNull();
  });
});
