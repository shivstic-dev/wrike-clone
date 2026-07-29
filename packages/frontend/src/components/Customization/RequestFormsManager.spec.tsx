// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestFormsManager } from './CustomizationPanel';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../../api/client', () => ({ default: apiMocks }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

let container: HTMLDivElement;
let root: Root | undefined;

async function renderManager(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <QueryClientProvider client={queryClient}>
        <RequestFormsManager />
      </QueryClientProvider>,
    );
  });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (container.textContent?.includes('Grant request')) return queryClient;
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error('Request forms did not render');
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  apiMocks.get.mockReset();
  apiMocks.get.mockImplementation((path: string) => {
    if (path === '/customization/request-forms') {
      return Promise.resolve({
        data: [{ id: 'form-1', name: 'Grant request', form_fields: [], is_public: false }],
      });
    }
    return Promise.resolve({ data: [{ id: 'folder-1', name: 'Intake' }] });
  });
  apiMocks.post.mockReset();
  apiMocks.patch.mockResolvedValue({ data: { id: 'form-1', is_public: true } });
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  root = undefined;
});

describe('RequestFormsManager publication controls', () => {
  it('shows a private form as unpublished and lets an administrator publish it', async () => {
    const queryClient = await renderManager();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const publish = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Publish',
    );

    expect(container.textContent).toContain('Unpublished');
    expect(publish).toBeDefined();
    await act(async () => {
      publish?.click();
      await Promise.resolve();
    });

    expect(apiMocks.patch).toHaveBeenCalledWith('/customization/request-forms/form-1', {
      isPublic: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['request-forms'] });
  });

  it('lets a new form opt into public access explicitly', async () => {
    await renderManager();
    const newForm = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '+ New Form',
    );
    await act(async () => newForm?.click());

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox?.checked).toBe(false);
  });
});
