// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage, { resolveLoginTenantSlug } from './LoginPage';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  setTenantSlug: vi.fn(),
  tenantSlug: 'cankids-india',
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ login: mocks.login }),
}));

vi.mock('../contexts/TenantContext', () => ({
  useTenant: () => ({
    setTenantSlug: mocks.setTenantSlug,
    tenantSlug: mocks.tenantSlug,
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
  },
}));

let container: HTMLDivElement;
let root: Root | undefined;

function renderLogin(): void {
  act(() => {
    root = createRoot(container);
    root.render(createElement(LoginPage));
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

async function submitLogin(email: string, password: string): Promise<void> {
  const emailInput = container.querySelector<HTMLInputElement>('#email');
  const passwordInput = container.querySelector<HTMLInputElement>('#password');
  const form = container.querySelector<HTMLFormElement>('form');
  if (!emailInput || !passwordInput || !form) {
    throw new Error('Login form did not render');
  }

  await act(async () => {
    updateInput(emailInput, email);
    updateInput(passwordInput, password);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.login.mockReset();
  mocks.setTenantSlug.mockReset();
  mocks.tenantSlug = 'cankids-india';
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

describe('resolveLoginTenantSlug', () => {
  it('uses the saved tenant when the tenant field is hidden', () => {
    expect(resolveLoginTenantSlug('', 'cankids-india')).toBe('cankids-india');
  });

  it('prefers a tenant entered by the user', () => {
    expect(resolveLoginTenantSlug('another-tenant', 'cankids-india')).toBe('another-tenant');
  });

  it('returns undefined when no tenant is available', () => {
    expect(resolveLoginTenantSlug('  ', '  ')).toBeUndefined();
  });
});

describe('LoginPage', () => {
  it('labels the organization sign-in and keeps backend errors actionable', async () => {
    mocks.login.mockRejectedValue(new Error('Email or password is incorrect'));
    renderLogin();

    expect(container.textContent).toContain('OpenWork Hub');
    expect(container.textContent).toContain('Sign in to your organization workspace');

    await submitLogin('user@example.org', 'wrong-password');

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Email or password is incorrect',
    );
  });

  it('keeps the saved organization in the existing login request', async () => {
    mocks.login.mockResolvedValue(undefined);
    renderLogin();

    await submitLogin('  user@example.org  ', 'private-password');

    expect(mocks.login).toHaveBeenCalledWith({
      email: 'user@example.org',
      password: 'private-password',
      tenantSlug: 'cankids-india',
    });
    expect(mocks.setTenantSlug).toHaveBeenCalledWith('cankids-india');
  });
});
