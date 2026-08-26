# Operations Atlas Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Operations Atlas visual foundation, shared UI primitives, responsive application shell, and redesigned authentication screens without changing domain behavior.

**Architecture:** Centralize visual tokens in Tailwind and CSS variables, keep reusable behavior in focused `components/ui` files, and move navigation decisions into a typed role-aware model. Existing routes render inside the new shell unchanged until later plans migrate each page.

**Tech Stack:** React 19, TypeScript 5.7, Tailwind CSS 3, React Router 7, Vitest, jsdom, `@fontsource` local font packages

## Global Constraints

- Keep product name `OpenWork Hub`.
- Use Canopy `#123C3A`, Current `#25766F`, Field Note `#F2CB67`, Signal Coral `#F27B55`, Mist `#DCE9E6`, Paper `#F8FAF8`, and Ink `#183432`.
- Use Archivo for headings, Source Sans 3 for body/UI, and IBM Plex Mono for data labels.
- Ship fonts locally; do not add remote font requests.
- Desktop-first; every workflow remains usable on mobile.
- Meet WCAG 2.2 AA, visible focus, keyboard operation, and reduced-motion requirements.
- Preserve existing routes, authentication, RBAC, task creation rules, and API calls.
- Do not activate dormant product modules.

---

## File Structure

- `packages/frontend/src/components/ui/`: visual primitives with no domain fetching
- `packages/frontend/src/design/navigation.ts`: role-aware navigation model
- `packages/frontend/src/layouts/AppShell.tsx`: shell state, mobile navigation, top bar, Help entry, account menu
- `packages/frontend/src/layouts/DashboardLayout.tsx`: compatibility export for the new shell
- `packages/frontend/src/pages/LoginPage.tsx`: redesigned sign-in screen using existing auth behavior
- `packages/frontend/src/pages/ChangePasswordPage.tsx`: redesigned required-password flow
- `packages/frontend/src/styles/index.css`: fonts, CSS variables, base behavior, primitive classes

### Task 1: Install Local Fonts and Define Visual Tokens

**Files:**
- Modify: `packages/frontend/package.json`
- Modify: `package-lock.json`
- Modify: `packages/frontend/tailwind.config.js`
- Modify: `packages/frontend/src/styles/index.css`
- Create: `packages/frontend/src/design/tokens.ts`
- Test: `packages/frontend/src/design/tokens.spec.ts`

**Interfaces:**
- Produces: `operationsAtlasColors`, `statusTone`, and `priorityTone` exported from `design/tokens.ts`
- Consumes: existing `TaskStatus` and `TaskPriority` values from `@wrike-clone/shared`

- [ ] **Step 1: Write the failing token contract test**

```ts
import { describe, expect, it } from 'vitest';
import { operationsAtlasColors, priorityTone, statusTone } from './tokens';

describe('Operations Atlas tokens', () => {
  it('publishes approved colors and semantic task tones', () => {
    expect(operationsAtlasColors).toEqual({
      canopy: '#123C3A',
      current: '#25766F',
      fieldNote: '#F2CB67',
      signalCoral: '#F27B55',
      mist: '#DCE9E6',
      paper: '#F8FAF8',
      ink: '#183432',
    });
    expect(statusTone.completed).toBe('positive');
    expect(statusTone.blocked).toBe('danger');
    expect(priorityTone.critical).toBe('danger');
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test --workspace=@wrike-clone/frontend -- --run src/design/tokens.spec.ts`

Expected: FAIL because `design/tokens.ts` does not exist.

- [ ] **Step 3: Install fonts and implement tokens**

Run:

```bash
npm install --workspace=@wrike-clone/frontend @fontsource/archivo @fontsource/source-sans-3 @fontsource/ibm-plex-mono
```

Create `tokens.ts` with literal approved colors and complete mappings for `todo`, `in_progress`, `completed`, `blocked`, `low`, `medium`, `high`, and `critical`. Extend Tailwind with named `atlas` colors and font families. Import only required font weights in `index.css` and define matching CSS custom properties.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/design/tokens.spec.ts
npm run typecheck --workspace=@wrike-clone/frontend
npm run lint --workspace=@wrike-clone/frontend
```

Expected: token test PASS; typecheck and lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/package.json package-lock.json packages/frontend/tailwind.config.js packages/frontend/src/styles/index.css packages/frontend/src/design
git commit -m "feat: add Operations Atlas design tokens"
```

### Task 2: Build Accessible Shared UI Primitives

**Files:**
- Create: `packages/frontend/src/components/ui/Button.tsx`
- Create: `packages/frontend/src/components/ui/Panel.tsx`
- Create: `packages/frontend/src/components/ui/PageHeader.tsx`
- Create: `packages/frontend/src/components/ui/Badge.tsx`
- Create: `packages/frontend/src/components/ui/StatePanel.tsx`
- Create: `packages/frontend/src/components/ui/Skeleton.tsx`
- Create: `packages/frontend/src/components/ui/index.ts`
- Test: `packages/frontend/src/components/ui/ui-primitives.spec.tsx`
- Modify: `packages/frontend/src/components/common/EmptyState.tsx`
- Modify: `packages/frontend/src/components/common/ErrorDisplay.tsx`

**Interfaces:**
- Produces: `Button`, `Panel`, `PageHeader`, `Badge`, `StatePanel`, and `Skeleton`
- `ButtonProps`: native button attributes plus `variant: 'primary' | 'secondary' | 'ghost' | 'danger'` and `size: 'sm' | 'md' | 'lg'`
- `StatePanelProps`: `{ title: string; description: string; action?: ReactNode; tone?: 'empty' | 'error' | 'forbidden' }`

- [ ] **Step 1: Write failing behavior tests**

```tsx
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, PageHeader, StatePanel } from './index';

describe('Operations Atlas UI primitives', () => {
  it('keeps native button semantics and exposes visible labels', () => {
    const html = renderToStaticMarkup(<Button variant="primary">Create task</Button>);
    expect(html).toContain('<button');
    expect(html).toContain('Create task');
    expect(html).toContain('focus-visible:');
  });

  it('renders one page heading and a directed empty action', () => {
    const html = renderToStaticMarkup(
      <>
        <PageHeader eyebrow="CEPAA" title="My work" description="Assigned work" />
        <StatePanel
          title="No assigned work"
          description="New assignments appear here."
          action={<a href="/dashboard">Return to dashboard</a>}
        />
      </>,
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Return to dashboard');
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test --workspace=@wrike-clone/frontend -- --run src/components/ui/ui-primitives.spec.tsx`

Expected: FAIL because primitive exports do not exist.

- [ ] **Step 3: Implement minimal primitives**

Use `forwardRef` for Button. Preserve native attributes. Keep domain copy out of primitives. `StatePanel` must accept a real action node rather than infer permissions. Adapt old `EmptyState` and `ErrorDisplay` as wrappers so current pages remain compatible during migration.

- [ ] **Step 4: Run focused tests and existing common-component consumers**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/components/ui/ui-primitives.spec.tsx src/pages/WorkspacePage.spec.tsx src/components/Reports/ReportsPanel.spec.tsx
npm run typecheck --workspace=@wrike-clone/frontend
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/ui packages/frontend/src/components/common
git commit -m "feat: add accessible Atlas UI primitives"
```

### Task 3: Create Typed Role-Aware Navigation

**Files:**
- Create: `packages/frontend/src/design/navigation.ts`
- Test: `packages/frontend/src/design/navigation.spec.ts`

**Interfaces:**
- Produces:

```ts
export type ShellRole = 'employee' | 'manager' | 'department_head' | 'admin';
export interface NavigationItem {
  label: string;
  path: string;
  section: 'overview' | 'workspace' | 'manage';
  icon: 'dashboard' | 'tasks' | 'department' | 'reports' | 'admin';
}
export function navigationForRole(role: ShellRole): NavigationItem[];
```

- [ ] **Step 1: Write the failing role matrix test**

```ts
import { describe, expect, it } from 'vitest';
import { navigationForRole } from './navigation';

describe('navigationForRole', () => {
  it.each(['employee', 'manager', 'department_head'] as const)(
    'omits Administration for %s',
    (role) => {
      expect(navigationForRole(role).map((item) => item.label)).toEqual([
        'Dashboard',
        'My Work',
        'Departments',
        'Reports',
      ]);
    },
  );

  it('adds Administration only for admins', () => {
    expect(navigationForRole('admin').map((item) => item.label)).toContain('Administration');
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test --workspace=@wrike-clone/frontend -- --run src/design/navigation.spec.ts`

Expected: FAIL because navigation model does not exist.

- [ ] **Step 3: Implement the literal navigation registry**

Do not infer roles from labels. Keep route paths compatible with current routes: `/dashboard`, `/my-tasks`, department links supplied separately by the shell, `/reports`, and `/admin`.

- [ ] **Step 4: Run focused test**

Run: `npm test --workspace=@wrike-clone/frontend -- --run src/design/navigation.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/design/navigation.ts packages/frontend/src/design/navigation.spec.ts
git commit -m "feat: add role-aware Atlas navigation"
```

### Task 4: Replace DashboardLayout with Responsive AppShell

**Files:**
- Create: `packages/frontend/src/layouts/AppShell.tsx`
- Create: `packages/frontend/src/layouts/AppShell.spec.tsx`
- Modify: `packages/frontend/src/layouts/DashboardLayout.tsx`
- Modify: `packages/frontend/src/App.tsx`
- Modify: `packages/frontend/src/components/Task/QuickTaskModal.tsx`

**Interfaces:**
- Consumes: `navigationForRole`, existing `useAuth`, `useWorkspaces`, and Quick Task permission helpers
- Produces: default `AppShell` layout and a compatibility default export from `DashboardLayout.tsx`
- Shell owns mobile drawer, account menu, global Create Task trigger, optional typed `helpContent?: ReactNode` slot, and active-department footer; the Help trigger renders only when content is supplied
- Test file defines `renderShell(): void` against mocked auth/workspace hooks and a mutable `mocks.mobile: boolean`

- [ ] **Step 1: Write failing shell behavior tests**

```tsx
// @vitest-environment jsdom
it('shows stable employee navigation without unavailable actions', () => {
  mocks.role = 'employee';
  renderShell();
  expect(container.textContent).toContain('Dashboard');
  expect(container.textContent).toContain('My Work');
  expect(container.textContent).not.toContain('Administration');
  expect(container.textContent).not.toContain('Create task');
});

it('opens and closes the mobile navigation with accessible state', () => {
  mocks.mobile = true;
  renderShell();
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')!;
  act(() => trigger.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test --workspace=@wrike-clone/frontend -- --run src/layouts/AppShell.spec.tsx`

Expected: FAIL because AppShell does not exist.

- [ ] **Step 3: Implement AppShell**

Split rendering into small private components: `PrimaryNavigation`, `TopBar`, `AccountMenu`, and `MobileNavigationSheet`. Keep Create Task behavior and the recently fixed synchronous assignee snapshot unchanged. Rename visible navigation copy from "My Tasks" to "My Work" while keeping `/my-tasks`.

- [ ] **Step 4: Verify shell and Quick Task regression**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/layouts/AppShell.spec.tsx src/components/Task/QuickTaskModal.spec.tsx
npm run typecheck --workspace=@wrike-clone/frontend
npm run lint --workspace=@wrike-clone/frontend
```

Expected: all tests PASS; no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/layouts packages/frontend/src/App.tsx packages/frontend/src/components/Task/QuickTaskModal.tsx
git commit -m "feat: add responsive Operations Atlas shell"
```

### Task 5: Redesign Login and Required Password Change

**Files:**
- Modify: `packages/frontend/src/layouts/AuthLayout.tsx`
- Modify: `packages/frontend/src/pages/LoginPage.tsx`
- Modify: `packages/frontend/src/pages/LoginPage.spec.ts`
- Modify: `packages/frontend/src/pages/ChangePasswordPage.tsx`
- Create: `packages/frontend/src/pages/ChangePasswordPage.spec.tsx`

**Interfaces:**
- Consumes: unchanged `useAuth().login` and password-change API behavior
- Produces: Operations Atlas auth layout with specific errors, preserved redirects, and responsive single-column mobile state
- Test files define `renderLogin(): void`, `submitLogin(email: string, password: string): Promise<void>`, and `renderChangePassword(): void`

- [ ] **Step 1: Add failing auth presentation tests**

```tsx
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

it('explains required password change without exposing the dashboard', () => {
  renderChangePassword();
  expect(container.textContent).toContain('Create your private password');
  expect(container.textContent).not.toContain('Dashboard');
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/pages/LoginPage.spec.ts src/pages/ChangePasswordPage.spec.tsx
```

Expected: FAIL on new copy and missing ChangePasswordPage test support.

- [ ] **Step 3: Implement approved auth presentation**

Use the two-panel desktop layout, one-panel mobile layout, local fonts, and existing form submissions. Keep exact backend error messages when safe. Do not add password reset because no approved reset API exists.

- [ ] **Step 4: Run full foundation verification**

Run:

```bash
npm test --workspace=@wrike-clone/frontend
npm run typecheck --workspace=@wrike-clone/frontend
npm run lint --workspace=@wrike-clone/frontend
npm run build --workspace=@wrike-clone/frontend
git diff --check
```

Expected: all frontend tests PASS and every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/layouts/AuthLayout.tsx packages/frontend/src/pages/LoginPage.tsx packages/frontend/src/pages/LoginPage.spec.ts packages/frontend/src/pages/ChangePasswordPage.tsx packages/frontend/src/pages/ChangePasswordPage.spec.tsx
git commit -m "feat: redesign OpenWork Hub authentication"
```
