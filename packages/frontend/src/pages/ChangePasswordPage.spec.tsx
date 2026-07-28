// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChangePasswordPage from './ChangePasswordPage';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  navigate: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../api/client', () => ({
  default: {
    post: mocks.post,
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: mocks.logout }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
  },
}));

let container: HTMLDivElement;
let root: Root | undefined;

function renderChangePassword(): void {
  act(() => {
    root = createRoot(container);
    root.render(<ChangePasswordPage />);
  });
}

function updateInput(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function submitPasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<void> {
  const currentPasswordInput =
    container.querySelector<HTMLInputElement>('#currentPassword');
  const newPasswordInput = container.querySelector<HTMLInputElement>('#newPassword');
  const confirmPasswordInput =
    container.querySelector<HTMLInputElement>('#confirmPassword');
  const form = container.querySelector<HTMLFormElement>('form');
  if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput || !form) {
    throw new Error('Password form did not render');
  }

  await act(async () => {
    updateInput(currentPasswordInput, currentPassword);
    updateInput(newPasswordInput, newPassword);
    updateInput(confirmPasswordInput, confirmPassword);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.logout.mockReset();
  mocks.navigate.mockReset();
  mocks.post.mockReset();
  document.body.innerHTML = '';
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

describe('ChangePasswordPage', () => {
  it('explains required password change without exposing the dashboard', () => {
    renderChangePassword();

    expect(container.textContent).toContain('Create your private password');
    expect(container.textContent).not.toContain('Dashboard');
  });

  it('keeps the password-change request and fresh-login redirect unchanged', async () => {
    mocks.post.mockResolvedValue({});
    mocks.logout.mockResolvedValue(undefined);
    renderChangePassword();

    await submitPasswordChange('temporary-password', 'private-password', 'private-password');

    expect(mocks.post).toHaveBeenCalledWith('/auth/change-password', {
      currentPassword: 'temporary-password',
      newPassword: 'private-password',
    });
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('keeps validation errors in an accessible alert without calling the API', async () => {
    renderChangePassword();

    await submitPasswordChange('temporary-password', 'private-password', 'different-password');

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Passwords do not match',
    );
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
