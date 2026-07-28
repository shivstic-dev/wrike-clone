# Operations Atlas Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-persisted, role-aware first-login guidance, a real-action Getting Started checklist, replayable Help, and a permanent system map.

**Architecture:** Store versioned onboarding progress per tenant and user. Expose a small GET/PATCH API, keep role-step selection pure and tested, and render a custom accessible tour through an `OnboardingProvider`. Tour errors never block the underlying application.

**Tech Stack:** PostgreSQL/Supabase, Knex, NestJS 11, Zod, React 19, TanStack Query 5, Floating UI, Vitest, Jest

**Prerequisites:** Complete `2026-07-28-operations-atlas-foundations.md` and `2026-07-28-operations-atlas-dashboards.md`.

## Global Constraints

- Auto-start once after required password change.
- Users may skip, resume, complete, dismiss checklist, and replay from Help.
- Store state server-side and tenant-scope every query.
- Employee tour omits Create Task.
- Missing tour targets are skipped safely.
- Mobile uses a bottom sheet; desktop uses anchored popovers.
- Keyboard, focus restoration, reduced motion, and screen-reader announcements are required.
- Onboarding never blocks task, department, report, or admin workflows.

---

## File Structure

- `supabase/migrations/`: source-of-truth onboarding table and policies
- `packages/shared/src/`: onboarding types and PATCH validation
- `packages/backend/src/onboarding/`: current-user progress API
- `packages/frontend/src/api/onboarding.ts`: query and mutation hooks
- `packages/frontend/src/components/Onboarding/`: provider, tour, checklist, Help drawer, and system map

### Task 1: Add Onboarding Contract and Database Migration

**Files:**
- Modify: `packages/shared/src/types/api.ts`
- Modify: `packages/shared/src/validation/index.ts`
- Create: `packages/shared/src/validation/onboarding.spec.ts`
- Create: `supabase/migrations/20260728190000_user_onboarding_progress.sql`
- Create: `packages/backend/src/migrations/019_user_onboarding_progress.ts`
- Create: `packages/backend/src/migrations/019_user_onboarding_progress.spec.ts`

**Interfaces:**
- Produces:

```ts
export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed';
export interface OnboardingProgress {
  tourVersion: number;
  tourStatus: OnboardingStatus;
  currentStep: string | null;
  completedSteps: string[];
  checklistDismissedAt: string | null;
  updatedAt: string;
}
export const updateOnboardingProgressSchema: z.ZodType<Partial<{
  tourVersion: number;
  tourStatus: OnboardingStatus;
  currentStep: string | null;
  completedSteps: string[];
  checklistDismissed: boolean;
}>>;
```

- Migration test defines `readOnboardingMigration(): Promise<string>` using `readFile` and the exact Supabase migration path

- [ ] **Step 1: Write failing validation and migration tests**

```ts
it('accepts known progress fields and rejects unknown step arrays', () => {
  expect(
    updateOnboardingProgressSchema.parse({
      tourStatus: 'in_progress',
      currentStep: 'dashboard',
      completedSteps: ['welcome'],
    }),
  ).toEqual({
    tourStatus: 'in_progress',
    currentStep: 'dashboard',
    completedSteps: ['welcome'],
  });
  expect(() =>
    updateOnboardingProgressSchema.parse({ completedSteps: [42] }),
  ).toThrow();
});
```

```ts
it('creates a tenant-user unique onboarding table with RLS', async () => {
  const sql = await readOnboardingMigration();
  expect(sql).toContain('UNIQUE (tenant_id, user_id)');
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain('tour_version');
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test --workspace=@wrike-clone/shared -- --runInBand src/validation/onboarding.spec.ts
npm test --workspace=@wrike-clone/backend -- --runInBand src/migrations/019_user_onboarding_progress.spec.ts
```

Expected: FAIL because contract and migration do not exist.

- [ ] **Step 3: Implement contract and additive migration**

Create UUID primary key, tenant/user foreign keys, status check constraint, JSONB completed steps default `[]`, timestamps, unique tenant/user key, tenant index, RLS enablement, and policies matching the application DB-role pattern in existing migrations. Knex wrapper reads the SQL file.

- [ ] **Step 4: Verify shared and migration tests**

Run:

```bash
npm test --workspace=@wrike-clone/shared
npm test --workspace=@wrike-clone/backend -- --runInBand src/migrations/019_user_onboarding_progress.spec.ts
npm run typecheck --workspace=@wrike-clone/backend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src supabase/migrations/20260728190000_user_onboarding_progress.sql packages/backend/src/migrations/019_user_onboarding_progress.ts packages/backend/src/migrations/019_user_onboarding_progress.spec.ts
git commit -m "feat: add onboarding progress schema"
```

### Task 2: Add Current-User Onboarding API

**Files:**
- Create: `packages/backend/src/onboarding/onboarding.service.ts`
- Create: `packages/backend/src/onboarding/onboarding.service.spec.ts`
- Create: `packages/backend/src/onboarding/onboarding.controller.ts`
- Create: `packages/backend/src/onboarding/onboarding.module.ts`
- Modify: `packages/backend/src/app.module.ts`

**Interfaces:**
- `OnboardingService.getCurrent(): Promise<OnboardingProgress>`
- `OnboardingService.update(input: UpdateOnboardingProgressInput): Promise<OnboardingProgress>`
- `GET /users/me/onboarding`
- `PATCH /users/me/onboarding`
- Test file defines `existingRow(overrides): void` to configure the mocked Knex chain and uses the shared tenant context fixture

- [ ] **Step 1: Write failing tenant/user isolation tests**

```ts
it('reads progress only for the current tenant and user', async () => {
  await tenantContext.run(context, () => service.getCurrent());
  expect(db).toHaveBeenCalledWith('user_onboarding_progress');
  expect(chain.where).toHaveBeenCalledWith({
    tenant_id: context.tenantId,
    user_id: context.userId,
  });
});

it('merges completed steps without losing previous milestones', async () => {
  existingRow({ completed_steps: ['welcome', 'dashboard'] });
  const result = await tenantContext.run(context, () =>
    service.update({ completedSteps: ['department'] }),
  );
  expect(result.completedSteps).toEqual(['welcome', 'dashboard', 'department']);
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test --workspace=@wrike-clone/backend -- --runInBand src/onboarding/onboarding.service.spec.ts`

Expected: FAIL because onboarding service does not exist.

- [ ] **Step 3: Implement service and controller**

Return default version `1` with `not_started` when no row exists. Use one tenant/user upsert. Convert snake_case DB fields through existing response interceptor. `checklistDismissed: true` writes current timestamp; false clears it. Guard both routes with authentication and `tenant:read`.

- [ ] **Step 4: Verify backend**

Run:

```bash
npm test --workspace=@wrike-clone/backend -- --runInBand src/onboarding
npm run typecheck --workspace=@wrike-clone/backend
npm run lint --workspace=@wrike-clone/backend
```

Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/onboarding packages/backend/src/app.module.ts
git commit -m "feat: persist current-user onboarding"
```

### Task 3: Add Frontend Onboarding Client and Role Step Registry

**Files:**
- Create: `packages/frontend/src/api/onboarding.ts`
- Create: `packages/frontend/src/api/onboarding.spec.ts`
- Create: `packages/frontend/src/components/Onboarding/tour-steps.ts`
- Create: `packages/frontend/src/components/Onboarding/tour-steps.spec.ts`

**Interfaces:**
- `ONBOARDING_VERSION = 1`
- `onboardingKeys.current()`
- `useOnboardingProgress()` and `useUpdateOnboardingProgress()`
- `tourStepsForRole(role: ShellRole): TourStep[]`

```ts
export interface TourStep {
  id: 'welcome' | 'dashboard' | 'create-task' | 'departments' | 'my-work' | 'reports';
  target: string | null;
  title: string;
  description: string;
}
```

- [ ] **Step 1: Write failing registry tests**

```ts
it('omits task creation for employees', () => {
  expect(tourStepsForRole('employee').map((step) => step.id)).toEqual([
    'welcome',
    'dashboard',
    'departments',
    'my-work',
    'reports',
  ]);
});

it('includes task creation for permitted roles', () => {
  expect(tourStepsForRole('manager').map((step) => step.id)).toContain('create-task');
  expect(tourStepsForRole('department_head').map((step) => step.id)).toContain('create-task');
  expect(tourStepsForRole('admin').map((step) => step.id)).toContain('create-task');
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/api/onboarding.spec.ts src/components/Onboarding/tour-steps.spec.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement client and literal role registry**

Mutation success updates current onboarding cache. Use stable `data-tour` selectors: `dashboard`, `create-task`, `departments`, `my-work`, and `reports`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/api/onboarding.spec.ts src/components/Onboarding/tour-steps.spec.ts
npm run typecheck --workspace=@wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/api/onboarding.ts packages/frontend/src/api/onboarding.spec.ts packages/frontend/src/components/Onboarding/tour-steps.ts packages/frontend/src/components/Onboarding/tour-steps.spec.ts
git commit -m "feat: add role-aware onboarding client"
```

### Task 4: Build Accessible Guided Tour

**Files:**
- Modify: `packages/frontend/package.json`
- Modify: `package-lock.json`
- Create: `packages/frontend/src/components/Onboarding/OnboardingProvider.tsx`
- Create: `packages/frontend/src/components/Onboarding/GuidedTour.tsx`
- Create: `packages/frontend/src/components/Onboarding/TourPopover.tsx`
- Create: `packages/frontend/src/components/Onboarding/MobileTourSheet.tsx`
- Create: `packages/frontend/src/components/Onboarding/GuidedTour.spec.tsx`
- Modify: `packages/frontend/src/layouts/AppShell.tsx`

**Interfaces:**
- `useOnboarding(): { startTour(): void; replayTour(): void; active: boolean }`
- Provider auto-starts only when auth/password flow is complete and server status is `not_started`
- Test file defines `renderTour({ steps }): void`, `flushTour(): Promise<void>`, and `clickButton(label: string): Promise<void>` using jsdom `createRoot` and React `act`

- [ ] **Step 1: Write failing tour lifecycle tests**

```tsx
it('skips a missing target and advances to the next visible step', async () => {
  renderTour({ steps: [missingStep, visibleDashboardStep] });
  await flushTour();
  expect(container.textContent).toContain('Understand your dashboard');
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ currentStep: 'dashboard' }),
  );
});

it('restores focus when the user finishes the tour', async () => {
  trigger.focus();
  renderTour({ steps: [welcomeStep] });
  await clickButton('Finish');
  expect(document.activeElement).toBe(trigger);
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test --workspace=@wrike-clone/frontend -- --run src/components/Onboarding/GuidedTour.spec.tsx`

Expected: FAIL because tour components do not exist.

- [ ] **Step 3: Install Floating UI and implement tour**

Run: `npm install --workspace=@wrike-clone/frontend @floating-ui/react`

Use portal rendering, focus management, Escape to pause, Next/Back/Skip controls, aria-live step announcements, and `window.matchMedia('(max-width: 767px)')` for bottom-sheet presentation. Missing target advances without throwing. Reduced motion disables scrolling animation.

- [ ] **Step 4: Verify tour and shell**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/components/Onboarding/GuidedTour.spec.tsx src/layouts/AppShell.spec.tsx
npm run typecheck --workspace=@wrike-clone/frontend
npm run lint --workspace=@wrike-clone/frontend
```

Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/package.json package-lock.json packages/frontend/src/components/Onboarding packages/frontend/src/layouts/AppShell.tsx
git commit -m "feat: add accessible guided onboarding tour"
```

### Task 5: Add Getting Started and Help System Map

**Files:**
- Create: `packages/frontend/src/components/Onboarding/GettingStarted.tsx`
- Create: `packages/frontend/src/components/Onboarding/GettingStarted.spec.tsx`
- Create: `packages/frontend/src/components/Onboarding/HelpDrawer.tsx`
- Create: `packages/frontend/src/components/Onboarding/SystemMap.tsx`
- Create: `packages/frontend/src/components/Onboarding/SystemMap.spec.tsx`
- Modify: `packages/frontend/src/layouts/AppShell.tsx`
- Modify: `packages/frontend/src/components/Dashboard/EmployeeDashboard.tsx`
- Modify: `packages/frontend/src/components/Dashboard/ManagerDashboard.tsx`
- Modify: `packages/frontend/src/components/Dashboard/DepartmentHeadDashboard.tsx`
- Modify: `packages/frontend/src/components/Dashboard/AdminDashboard.tsx`

**Interfaces:**
- `GettingStartedProps`: `{ role: ShellRole; progress: OnboardingProgress; onDismiss(): void }`
- Help drawer always offers `System map`, `Replay guided tour`, and `Getting started`
- Test file defines `progress(overrides?: Partial<OnboardingProgress>): OnboardingProgress` with complete version-1 defaults

- [ ] **Step 1: Write failing role checklist and system-map tests**

```tsx
it('shows only real permitted employee milestones', () => {
  const html = renderToStaticMarkup(<GettingStarted role="employee" progress={progress()} />);
  expect(html).toContain('Open your department');
  expect(html).toContain('View My Work');
  expect(html).not.toContain('Create your first task');
});

it('explains the complete hierarchy in order', () => {
  const html = renderToStaticMarkup(<SystemMap role="manager" />);
  expect(html.indexOf('Organization')).toBeLessThan(html.indexOf('Department'));
  expect(html.indexOf('Department')).toBeLessThan(html.indexOf('Folder / Project'));
  expect(html.indexOf('Folder / Project')).toBeLessThan(html.indexOf('Task'));
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/components/Onboarding/GettingStarted.spec.tsx src/components/Onboarding/SystemMap.spec.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement checklist and Help drawer**

Checklist completion derives from persisted completed-step IDs. Dashboard placement is role-independent. Help drawer contains plain role rules and never renders unauthorized user names or counts. Replay resets only tour status/current step; it does not erase completed checklist milestones.

- [ ] **Step 4: Run onboarding and full verification**

Run:

```bash
npm test --workspace=@wrike-clone/backend
npm test --workspace=@wrike-clone/frontend
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/Onboarding packages/frontend/src/layouts/AppShell.tsx packages/frontend/src/components/Dashboard
git commit -m "feat: add onboarding checklist and system map"
```
