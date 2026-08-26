// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell';

const mocks = vi.hoisted(() => ({
  departmentRole: 'employee',
  help: false,
  logout: vi.fn(),
  mobile: false,
  path: '/workspaces/department-1',
  role: 'employee',
  workspacesPending: false,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    logout: mocks.logout,
    membership: { role: mocks.role },
    user: {
      displayName: 'Eli Employee',
      email: 'eli@example.org',
    },
  }),
}));

vi.mock('../api/workspaces', () => ({
  useWorkspaces: () => ({
    data: [
      {
        id: 'department-1',
        tenantId: 'tenant-1',
        name: 'Programs',
        description: null,
        icon: null,
        sortOrder: 0,
        departmentRole: mocks.departmentRole,
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:00:00.000Z',
        deletedAt: null,
      },
    ],
    isPending: mocks.workspacesPending,
  }),
}));

let container: HTMLDivElement;
let root: Root | undefined;

function shell(helpContent?: ReactNode) {
  return (
    <MemoryRouter initialEntries={[mocks.path]}>
      <Routes>
        <Route element={<AppShell helpContent={helpContent} />} path="/">
          <Route path="workspaces/:workspaceId" element={<p>Workspace content</p>} />
          <Route path="dashboard" element={<p>Dashboard content</p>} />
          <Route path="my-tasks" element={<p>My work content</p>} />
          <Route path="calendar" element={<p>Calendar content</p>} />
          <Route path="portfolio" element={<p>Portfolio content</p>} />
          <Route path="reports" element={<p>Reports content</p>} />
          <Route path="timesheets" element={<p>Timesheets content</p>} />
          <Route path="search" element={<p>Search content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function renderShell(): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: mocks.mobile ? 640 : 1280,
  });

  act(() => {
    root = createRoot(container);
    root.render(shell(mocks.help ? <p>Help center</p> : undefined));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.departmentRole = 'employee';
  mocks.help = false;
  mocks.logout.mockReset();
  mocks.mobile = false;
  mocks.path = '/workspaces/department-1';
  mocks.role = 'employee';
  mocks.workspacesPending = false;
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

describe('AppShell', () => {
  it('shows stable employee navigation without unavailable actions', () => {
    mocks.role = 'employee';
    renderShell();

    expect(container.textContent).toContain('Dashboard');
    expect(container.textContent).toContain('My Tasks');
    expect(container.textContent).toContain('Calendar');
    expect(container.textContent).toContain('Portfolio');
    expect(container.textContent).toContain('Timesheets');
    expect(container.textContent).not.toContain('Administration');
    expect(container.textContent).not.toContain('Create task');
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="/my-tasks"]')?.textContent,
    ).toContain('My Tasks');
  });

  it('preserves department navigation and identifies the active department', () => {
    renderShell();

    expect(container.querySelector('a[href="/workspaces/department-1"]')?.textContent).toContain(
      'Programs',
    );
    expect(container.textContent).toContain('Active department');
    expect(container.textContent).toContain('Workspace content');
  });

  it('marks only Departments active at the department dashboard anchor', () => {
    mocks.path = '/dashboard#departments';
    renderShell();

    expect(
      Array.from(container.querySelectorAll<HTMLAnchorElement>('a[aria-current="page"]')).map(
        (link) => link.getAttribute('href'),
      ),
    ).toEqual(['/dashboard#departments']);
  });

  it('shows administration and task creation for an admin', () => {
    mocks.role = 'admin';
    renderShell();

    expect(container.textContent).toContain('Administration');
    expect(container.textContent).toContain('Create task');
  });

  it('uses existing department permissions for management task creation', () => {
    mocks.role = 'manager';
    mocks.departmentRole = 'employee';
    renderShell();
    expect(container.textContent).not.toContain('Create task');

    act(() => root?.unmount());
    root = undefined;
    mocks.departmentRole = 'manager';
    renderShell();
    expect(container.textContent).toContain('Create task');
  });

  it('shows Help only when help content is supplied', () => {
    renderShell();
    expect(container.textContent).not.toContain('Help');

    act(() => root?.unmount());
    root = undefined;
    mocks.help = true;
    renderShell();
    const helpTrigger = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Help',
    );
    if (!helpTrigger) throw new Error('Help trigger was not rendered');

    act(() => helpTrigger.click());
    expect(container.textContent).toContain('Help center');
  });

  it('preserves the account sign-out action', () => {
    renderShell();
    const accountTrigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open account menu"]',
    );
    if (!accountTrigger) throw new Error('Account trigger was not rendered');

    act(() => accountTrigger.click());
    expect(accountTrigger.getAttribute('aria-controls')).toBe('account-disclosure');
    const disclosure = container.querySelector<HTMLElement>('#account-disclosure');
    if (!disclosure) throw new Error('Account disclosure was not rendered');
    expect(disclosure.getAttribute('role')).toBeNull();
    expect(
      container
        .querySelector<HTMLButtonElement>('[aria-label="Close account menu"]')
        ?.getAttribute('tabindex'),
    ).toBe('-1');
    const signOut = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Sign out'),
    );
    if (!signOut) throw new Error('Sign out action was not rendered');
    expect(signOut.getAttribute('role')).toBeNull();

    act(() => signOut.click());
    expect(mocks.logout).toHaveBeenCalledOnce();
  });

  it('closes the account disclosure on Escape and restores its trigger', () => {
    renderShell();
    const accountTrigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open account menu"]',
    );
    if (!accountTrigger) throw new Error('Account trigger was not rendered');

    act(() => accountTrigger.click());
    const signOut = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Sign out'),
    );
    if (!signOut) throw new Error('Sign out action was not rendered');
    signOut.focus();

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(accountTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#account-disclosure')).toBeNull();
    expect(document.activeElement).toBe(accountTrigger);
  });

  it('moves focus into the mobile navigation when it opens', () => {
    mocks.mobile = true;
    renderShell();
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]');
    if (!trigger) throw new Error('Mobile navigation trigger was not rendered');

    act(() => trigger.click());
    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Navigation"]');
    const closeButton = dialog?.querySelector<HTMLButtonElement>(
      'button[aria-label="Close navigation"]',
    );
    if (!closeButton) throw new Error('Navigation close button was not rendered');

    expect(document.activeElement).toBe(closeButton);
  });

  it('contains forward and reverse Tab navigation inside the mobile drawer', () => {
    mocks.mobile = true;
    renderShell();
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]');
    if (!trigger) throw new Error('Mobile navigation trigger was not rendered');
    act(() => trigger.click());

    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Navigation"]');
    const closeButton = dialog?.querySelector<HTMLButtonElement>(
      'button[aria-label="Close navigation"]',
    );
    const links = dialog?.querySelectorAll<HTMLAnchorElement>('a[href]');
    const lastLink = links?.item((links?.length ?? 0) - 1);
    if (!closeButton || !lastLink) throw new Error('Navigation focus targets were not rendered');

    act(() => {
      closeButton.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Tab',
          shiftKey: true,
        }),
      );
    });
    expect(document.activeElement).toBe(lastLink);

    act(() => {
      lastLink.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Tab',
        }),
      );
    });
    expect(document.activeElement).toBe(closeButton);
  });

  it('restores the mobile trigger when the close button dismisses the drawer', () => {
    mocks.mobile = true;
    renderShell();
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]');
    if (!trigger) throw new Error('Mobile navigation trigger was not rendered');
    act(() => trigger.click());

    const closeButton = container.querySelector<HTMLButtonElement>(
      '[role="dialog"] button[aria-label="Close navigation"]',
    );
    if (!closeButton) throw new Error('Navigation close button was not rendered');
    act(() => closeButton.click());

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('opens and closes the mobile navigation with accessible state', () => {
    mocks.mobile = true;
    renderShell();
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]');
    if (!trigger) throw new Error('Mobile navigation trigger was not rendered');

    trigger.focus();
    act(() => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the mobile navigation after choosing a route', () => {
    mocks.mobile = true;
    renderShell();
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]');
    if (!trigger) throw new Error('Mobile navigation trigger was not rendered');

    act(() => trigger.click());
    const myWork = container.querySelector<HTMLAnchorElement>('a[href="/my-tasks"]');
    if (!myWork) throw new Error('My Work link was not rendered');
    act(() => myWork.click());

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(container.textContent).toContain('My work content');
  });
});
