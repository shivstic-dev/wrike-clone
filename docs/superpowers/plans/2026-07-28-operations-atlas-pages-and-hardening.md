# Operations Atlas Pages and Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every active workflow to Operations Atlas, preserve behavior, and complete accessibility, responsive, browser, and production verification.

**Architecture:** Keep API hooks and domain rules stable while replacing page composition with shared Atlas primitives. Each page owns its URL/filter state and uses role-aware actions supplied by existing permission logic. Final hardening tests the whole integrated application rather than isolated styling.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Recharts, Tailwind CSS 3, Vitest, jsdom, NestJS/Jest verification, Vite production build

**Prerequisites:** Complete the Operations Atlas foundations, dashboards, and onboarding plans.

## Global Constraints

- Active scope includes login, password setup, shell, dashboard, My Work, departments, projects, tasks, reports, and admin.
- Do not activate Gantt, automation, portfolio, timesheet, schedules, webhooks, or copilot.
- Preserve existing API contracts unless earlier dashboard/onboarding plans explicitly add contracts.
- Preserve Quick Task General-folder behavior and selected-assignee crash regression.
- Preserve role and report scope behavior.
- Empty states provide one permitted next action.
- Errors preserve user input and expose a local retry.
- Desktop-first and fully usable mobile.
- WCAG 2.2 AA, keyboard operation, focus restoration, reduced motion, and non-color status cues are release gates.

---

## File Structure

- Existing page files remain route owners.
- `components/Work/`: My Work segmentation and filters
- `components/Department/`: department tabs, folder/project summaries
- `components/Task/`: detail sections and existing creation/editing forms
- `components/Reports/`: report filters, charts, task rows, exports
- `components/Admin/`: setup health, people, departments, roles, audit
- `components/ui/`: shared primitives only; no page-specific permissions

### Task 1: Redesign My Work Around Urgency

**Files:**
- Create: `packages/frontend/src/components/Work/work-segments.ts`
- Create: `packages/frontend/src/components/Work/work-segments.spec.ts`
- Create: `packages/frontend/src/components/Work/MyWorkList.tsx`
- Create: `packages/frontend/src/components/Work/MyWorkBoard.tsx`
- Modify: `packages/frontend/src/pages/MyTasksPage.tsx`
- Create: `packages/frontend/src/pages/MyTasksPage.spec.tsx`
- Modify: `packages/frontend/src/components/Table/TaskTable.tsx`

**Interfaces:**
- Produces:

```ts
export type WorkSegment = 'today' | 'upcoming' | 'all';
export function tasksForSegment(tasks: Task[], segment: WorkSegment, now: Date): Task[];
export function compareTaskUrgency(a: Task, b: Task, now: Date): number;
```

- Test file defines `task(overrides: Partial<Task> & { id: string }): Task` with complete domain defaults

- [ ] **Step 1: Write failing urgency tests**

```ts
it('orders overdue, due today, upcoming, then no-date work', () => {
  const ordered = [...tasks].sort((a, b) =>
    compareTaskUrgency(a, b, new Date('2026-07-28T12:00:00Z')),
  );
  expect(ordered.map((task) => task.id)).toEqual([
    'overdue',
    'today',
    'upcoming',
    'no-date',
  ]);
});

it('keeps completed work out of Today', () => {
  expect(
    tasksForSegment(
      [task({ id: 'done', status: 'completed', dueDate: '2026-07-28' })],
      'today',
      new Date('2026-07-28T12:00:00Z'),
    ),
  ).toEqual([]);
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test --workspace=@wrike-clone/frontend -- --run src/components/Work/work-segments.spec.ts`

Expected: FAIL because segmentation helpers do not exist.

- [ ] **Step 3: Implement segmentation and page composition**

Use URL search params `segment`, `view`, `status`, `priority`, and `search`. Default to `today` and `list`. Empty employee state says when assignments will appear and links to Dashboard; it never offers Create Task.

- [ ] **Step 4: Verify My Work**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/components/Work src/pages/MyTasksPage.spec.tsx
npm run typecheck --workspace=@wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/Work packages/frontend/src/components/Table/TaskTable.tsx packages/frontend/src/pages/MyTasksPage.tsx packages/frontend/src/pages/MyTasksPage.spec.tsx
git commit -m "feat: redesign My Work around urgency"
```

### Task 2: Unify Department, Folder, and Project Browsing

**Files:**
- Create: `packages/frontend/src/components/Department/DepartmentTabs.tsx`
- Create: `packages/frontend/src/components/Department/DepartmentOverview.tsx`
- Create: `packages/frontend/src/components/Department/ProjectSummaryCard.tsx`
- Modify: `packages/frontend/src/components/Folder/FolderTree.tsx`
- Modify: `packages/frontend/src/components/Folder/FolderTree.spec.tsx`
- Modify: `packages/frontend/src/pages/WorkspacePage.tsx`
- Modify: `packages/frontend/src/pages/WorkspacePage.spec.tsx`
- Modify: `packages/frontend/src/pages/ProjectPage.tsx`
- Create: `packages/frontend/src/pages/ProjectPage.spec.tsx`

**Interfaces:**
- Department tabs: `overview | work | people | projects`
- Selected folder remains route-local and resets when `workspaceId` changes
- System General project remains hidden while General folder remains visible and explained
- Tests extend existing WorkspacePage mocks with `renderWorkspace(search?: string)`, `clickTab(label)`, `clickFolder(label)`, `activeTab()`, `changeWorkspace(id)`, and `lastTaskQuery()`

- [ ] **Step 1: Add failing General-folder and tab tests**

```tsx
it('opens Overview by default and explains General without exposing system project', () => {
  renderWorkspace();
  expect(container.textContent).toContain('Department overview');
  clickTab('Work');
  clickFolder('General');
  expect(container.textContent).toContain('Tasks created without a project live here');
  expect(container.textContent).not.toContain('General Tasks');
});

it('keeps selected tab in the URL and clears folder on department change', () => {
  renderWorkspace('?tab=projects');
  expect(activeTab()).toBe('Projects');
  changeWorkspace('department-2');
  expect(lastTaskQuery()).toEqual([{ folderId: '', perPage: 100 }, false]);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/pages/WorkspacePage.spec.tsx src/pages/ProjectPage.spec.tsx
```

Expected: FAIL on tabs, guidance copy, and new project-page contract.

- [ ] **Step 3: Implement department workspace and project header**

Reuse existing folder/project hooks and creation mutations. Put creation actions only on permitted roles. Keep granular retry states for workspace, folders, projects, and tasks. Project page adopts Atlas header, status summary, list/board switch, and existing task creation behavior.

- [ ] **Step 4: Verify department and Quick Task behavior**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/pages/WorkspacePage.spec.tsx src/pages/ProjectPage.spec.tsx src/components/Folder/FolderTree.spec.tsx src/components/Task/QuickTaskModal.spec.tsx
npm run typecheck --workspace=@wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/Department packages/frontend/src/components/Folder packages/frontend/src/pages/WorkspacePage.tsx packages/frontend/src/pages/WorkspacePage.spec.tsx packages/frontend/src/pages/ProjectPage.tsx packages/frontend/src/pages/ProjectPage.spec.tsx
git commit -m "feat: redesign department and project workspaces"
```

### Task 3: Redesign Task Detail Without Changing Permissions

**Files:**
- Create: `packages/frontend/src/components/Task/TaskSummary.tsx`
- Create: `packages/frontend/src/components/Task/TaskMetadataPanel.tsx`
- Create: `packages/frontend/src/components/Task/TaskActivityTimeline.tsx`
- Modify: `packages/frontend/src/components/Task/TaskForm.tsx`
- Modify: `packages/frontend/src/components/Task/TaskForm.spec.tsx`
- Modify: `packages/frontend/src/components/Comments/CommentSection.tsx`
- Modify: `packages/frontend/src/pages/TaskDetailPage.tsx`
- Modify: `packages/frontend/src/pages/TaskDetailPage.spec.tsx`

**Interfaces:**
- Task Summary renders title, status, priority, due state, location, and assignees
- Edit controls consume current permission booleans; components do not infer permission from visual role labels
- Tests extend existing TaskDetailPage fixtures with `renderTaskDetail(): void` and `textIndex(label: string): number`

- [ ] **Step 1: Add failing role and mobile-order tests**

```tsx
it('shows co-assignees while omitting management controls for employees', () => {
  mocks.canManage = false;
  renderTaskDetail();
  expect(container.textContent).toContain('Maya Manager');
  expect(container.textContent).toContain('Eli Employee');
  expect(container.textContent).not.toContain('Delete task');
  expect(container.textContent).not.toContain('Change visibility');
});

it('places task summary before activity and comments', () => {
  renderTaskDetail();
  expect(textIndex('Task details')).toBeLessThan(textIndex('Activity'));
  expect(textIndex('Activity')).toBeLessThan(textIndex('Comments'));
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/pages/TaskDetailPage.spec.tsx src/components/Task/TaskForm.spec.tsx
```

Expected: FAIL on new section structure.

- [ ] **Step 3: Implement focused task sections**

Keep existing task update, assignee, delete, comment, and navigation mutations. Snapshot all DOM event values before functional state updates. Use explicit success/error action names. Mobile layout is Summary, Details, Activity, Comments.

- [ ] **Step 4: Verify Task Detail**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/pages/TaskDetailPage.spec.tsx src/components/Task
npm run typecheck --workspace=@wrike-clone/frontend
npm run lint --workspace=@wrike-clone/frontend
```

Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/Task packages/frontend/src/components/Comments/CommentSection.tsx packages/frontend/src/pages/TaskDetailPage.tsx packages/frontend/src/pages/TaskDetailPage.spec.tsx
git commit -m "feat: redesign task detail workflow"
```

### Task 4: Turn Reports Into Visual, Exact-Scope Analytics

**Files:**
- Create: `packages/frontend/src/components/Reports/ReportScopeSummary.tsx`
- Create: `packages/frontend/src/components/Reports/ReportTrendChart.tsx`
- Create: `packages/frontend/src/components/Reports/ReportDistribution.tsx`
- Create: `packages/frontend/src/components/Reports/ReportTaskRows.tsx`
- Modify: `packages/frontend/src/components/Reports/ReportsPanel.tsx`
- Modify: `packages/frontend/src/components/Reports/ReportsPanel.spec.tsx`
- Modify: `packages/frontend/src/pages/ReportsPage.tsx`
- Modify: `packages/frontend/src/api/reports.ts`
- Modify: `packages/frontend/src/api/reports.spec.ts`
- Modify: `packages/backend/src/reports/report.service.ts`
- Create: `packages/backend/src/reports/report.service.spec.ts`

**Interfaces:**
- Extend `DepartmentReport` with `daily: Array<{ date: string; created: number; completed: number }>`
- Screen and export continue using identical filters, scope, and task rows
- Report chart period follows active date filters; defaults to the last 30 days when no dates are selected
- Backend test defines `row(overrides): ReportTask` and `buildReportWithRows(rows): Promise<DepartmentReport>` around a deterministic mocked Knex result
- Frontend test defines `report(overrides): DepartmentReport`, `renderReports(): void`, and `button(label: string): HTMLButtonElement`

- [ ] **Step 1: Write failing daily-data and exact-scope tests**

```ts
it('returns daily created/completed values for the active report window', async () => {
  const report = await buildReportWithRows([
    row({ createdAt: '2026-07-20', completedAt: '2026-07-25', status: 'completed' }),
  ]);
  expect(report.daily).toContainEqual({ date: '2026-07-20', created: 1, completed: 0 });
  expect(report.daily).toContainEqual({ date: '2026-07-25', created: 0, completed: 1 });
});
```

```tsx
it('renders chart scope and disables export for the exact empty report', () => {
  mocks.report.data = report({ tasks: [], scope: { mode: 'combined' } });
  renderReports();
  expect(container.textContent).toContain('Combined team');
  expect(button('Export PDF').disabled).toBe(true);
  expect(button('Export XLSX').disabled).toBe(true);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test --workspace=@wrike-clone/backend -- --runInBand src/reports/report.service.spec.ts
npm test --workspace=@wrike-clone/frontend -- --run src/api/reports.spec.ts src/components/Reports/ReportsPanel.spec.tsx
```

Expected: FAIL because daily report data and visual components are absent.

- [ ] **Step 3: Implement report daily data and visual composition**

Keep export builder unchanged except shared report data now includes daily rows. Show scope summary before filters, use Atlas charts with fallback tables, and preserve current task table/links. Never infer chart values from exported files.

- [ ] **Step 4: Verify reports**

Run:

```bash
npm test --workspace=@wrike-clone/backend -- --runInBand src/reports
npm test --workspace=@wrike-clone/frontend -- --run src/api/reports.spec.ts src/components/Reports
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/reports packages/frontend/src/api/reports.ts packages/frontend/src/api/reports.spec.ts packages/frontend/src/components/Reports packages/frontend/src/pages/ReportsPage.tsx
git commit -m "feat: add visual exact-scope reports"
```

### Task 5: Redesign Administration as Guided Setup

**Files:**
- Create: `packages/frontend/src/components/Admin/SetupHealth.tsx`
- Create: `packages/frontend/src/components/Admin/PeoplePanel.tsx`
- Create: `packages/frontend/src/components/Admin/DepartmentsPanel.tsx`
- Create: `packages/frontend/src/components/Admin/RoleAuditPanel.tsx`
- Create: `packages/frontend/src/components/Admin/setup-health.ts`
- Create: `packages/frontend/src/components/Admin/setup-health.spec.ts`
- Modify: `packages/frontend/src/pages/AdminPage.tsx`
- Modify: `packages/frontend/src/pages/AdminPage.spec.tsx`
- Modify: `packages/backend/src/user/user.service.ts`
- Create: `packages/backend/src/user/user.service.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface SetupHealthInput {
  activeUsers: number;
  pendingActivation: number;
  departments: Array<{ id: string; hasHead: boolean; memberCount: number }>;
}
export function calculateSetupHealth(input: SetupHealthInput): {
  complete: number;
  total: 4;
  missing: Array<'users' | 'department' | 'department_head' | 'members'>;
};
```

- Admin test extends current fixtures with `renderAdmin(): void` and `roleControl(name: string): HTMLElement`

- [ ] **Step 1: Write failing setup-health and admin-role tests**

```ts
it('identifies missing department heads without hiding healthy checks', () => {
  expect(
    calculateSetupHealth({
      activeUsers: 4,
      pendingActivation: 0,
      departments: [{ id: 'department-1', hasHead: false, memberCount: 4 }],
    }),
  ).toEqual({
    complete: 3,
    total: 4,
    missing: ['department_head'],
  });
});
```

```tsx
it('keeps tenant admins non-editable and shows audited department role controls', () => {
  renderAdmin();
  expect(roleControl('Tenant Admin').querySelector('select')).toBeNull();
  expect(roleControl('Maya Manager').querySelector('select')).not.toBeNull();
  expect(container.textContent).toContain('Recent role changes');
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/components/Admin/setup-health.spec.ts src/pages/AdminPage.spec.tsx
```

Expected: FAIL because Setup Health and page sections do not exist.

- [ ] **Step 3: Implement guided admin sections**

Extend the tenant user listing with existing `users.must_change_password` as `mustChangePassword`; label that real state "activation pending" rather than inventing invitation data. Reuse existing user creation, department creation, member assignment, role change, and audit queries. Preserve confirmation before role changes. Show local errors beside the relevant setup section.

- [ ] **Step 4: Verify admin**

Run:

```bash
npm test --workspace=@wrike-clone/frontend -- --run src/components/Admin src/pages/AdminPage.spec.tsx
npm test --workspace=@wrike-clone/backend -- --runInBand src/user/user.service.spec.ts
npm run typecheck --workspace=@wrike-clone/frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/Admin packages/frontend/src/pages/AdminPage.tsx packages/frontend/src/pages/AdminPage.spec.tsx packages/backend/src/user/user.service.ts packages/backend/src/user/user.service.spec.ts
git commit -m "feat: redesign administration setup"
```

### Task 6: Complete Accessibility, Responsive, and Production Gates

**Files:**
- Modify: `packages/frontend/src/styles/index.css`
- Modify: `packages/frontend/src/main.tsx`
- Create: `packages/frontend/src/App.spec.tsx`
- Create: `docs/operations-atlas-browser-checklist.md`
- Modify: relevant failing components discovered during verification

**Interfaces:**
- Produces one documented browser checklist and zero known critical/important accessibility defects
- Does not change product scope
- Integrated test defines `renderAuthenticatedApp(path: string): void`, `screenReady(): Promise<void>`, and mutable `mocks.reducedMotion`

- [ ] **Step 1: Write failing integrated route and reduced-motion tests**

```tsx
it.each([
  ['/dashboard', 'Dashboard'],
  ['/my-tasks', 'My Work'],
  ['/reports', 'Reports'],
] as const)('renders one main landmark and one page heading at %s', async (path, heading) => {
  renderAuthenticatedApp(path);
  await screenReady();
  expect(document.querySelectorAll('main')).toHaveLength(1);
  expect(document.querySelectorAll('h1')).toHaveLength(1);
  expect(document.querySelector('h1')?.textContent).toContain(heading);
});

it('removes nonessential motion when reduced motion is requested', () => {
  mocks.reducedMotion = true;
  renderAuthenticatedApp('/dashboard');
  expect(document.documentElement.dataset.reducedMotion).toBe('true');
});
```

- [ ] **Step 2: Run integrated test and confirm RED**

Run: `npm test --workspace=@wrike-clone/frontend -- --run src/App.spec.tsx`

Expected: FAIL until landmark/heading ownership and reduced-motion state are consistent.

- [ ] **Step 3: Fix integrated issues and write browser checklist**

Checklist must cover four roles at 1440 px desktop and 390 px mobile: login, password change, dashboard, tour, Create Task permission, My Work, department General folder, task detail, report filters/export, admin role changes, keyboard focus, Escape behavior, 200% zoom, and reduced motion.

- [ ] **Step 4: Run full release gate**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run format:check
git diff --check
```

Expected: all workspace tests PASS and every command exits 0.

- [ ] **Step 5: Run browser verification**

Run frontend and backend development servers, then execute every item in `docs/operations-atlas-browser-checklist.md` with an authenticated account for each role. Record only defects in the task log; fix Critical and Important findings before continuing. Capture desktop/mobile screenshots for reviewer comparison with the approved Operations Atlas mockups.

- [ ] **Step 6: Request independent review**

Review the complete branch against:

- `docs/superpowers/specs/2026-07-28-operations-atlas-redesign-design.md`
- all four Operations Atlas implementation plans
- the browser checklist results

Fix all Critical and Important findings, rerun the full release gate, and require an explicit `Ready to merge: Yes` verdict.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src docs/operations-atlas-browser-checklist.md
git commit -m "test: harden Operations Atlas release"
```
