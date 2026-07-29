# Wrike Clone Blueprint Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the review blueprint as a secure, fast, zero-cost work-management product with Vercel-hosted React, Railway-hosted NestJS, and Supabase Postgres/RLS/Storage/Realtime.

**Architecture:** Keep the persistent NestJS process on Railway so Socket.IO, schedules, and optional BullMQ workers remain valid; host the Vite SPA on Vercel; use the Supabase transaction pooler and tenant-first RLS schema. Database DDL has two synchronized entry points: immutable Supabase production migrations and self-contained Knex migrations used by Railway.

**Tech Stack:** Node.js 22, TypeScript, NestJS 11, Knex 3, PostgreSQL 17/Supabase, React 19, Vite 6, TanStack Query/Table/Virtual, Zustand, dnd-kit, Vitest, Jest, Playwright, GitHub Actions.

## Global Constraints

- Railway deployment and environment mutation are manual-only; Codex may prepare and verify code and provide exact commands.
- Vercel and Supabase deployment, verification, and monitoring are handled through their connected accounts.
- Preserve strict tenant isolation: every tenant-owned query includes `tenant_id`, and RLS request context uses transaction-local `set_config`.
- Use the Supabase transaction pooler on port `6543`; begin Railway production with `DB_MAX_CONNECTIONS=1`.
- Keep frontend and backend independently deployable; frontend API calls use `VITE_API_URL`.
- Maintain Node.js `22.x` locally, in CI, on Vercel, and on Railway.
- New behavior is test-driven and each task ends with an independently testable result.
- No paid services are required.

---

## File Map

- `packages/backend/src/migrations/018_operations_atlas_analytics.ts`: self-contained analytics schema migration.
- `packages/backend/src/migrations/019_search_and_hot_path_indexes.ts`: Railway parity for production search/index DDL.
- `supabase/migrations/*.sql`: immutable production migration history.
- `packages/backend/src/customization/customization.service.ts`: transactional blueprints and request-form submissions.
- `packages/backend/src/main.ts`, `auth/auth.controller.ts`, `notification/notification.service.ts`, `health/health.controller.ts`: global validation, auth throttling, authorization, and readiness.
- `packages/backend/src/{task,project,notification,timelog,search}`: keyset pagination boundaries.
- `packages/frontend/src/design`, `styles/index.css`, `components/ui`: semantic tokens, density, dark mode, and accessible primitives.
- `packages/frontend/src/components/CommandPalette`, `hooks/useKeyboardModel.ts`: keyboard-first interaction model.
- `packages/frontend/src/components/{Table,Kanban,Task}`: inline editing, bulk actions, optimistic drag, and undo.
- `packages/frontend/src/lib/supabase.ts`, `hooks/useTaskRealtime.ts`, `hooks/usePresence.ts`: Realtime subscriptions and presence.
- `packages/frontend/src/pages/ProjectPage.tsx`, `components/Gantt/GanttChart.tsx`: routed timeline and critical path.
- `.github/workflows/ci.yml`, `.github/workflows/deployed-smoke.yml`, `.github/dependabot.yml`: quality, security, coverage, and deployed smoke gates.

### Task 1: Production Database and Railway Migration Parity

**Files:**
- Modify: `packages/backend/src/migrations/018_operations_atlas_analytics.ts`
- Create: `packages/backend/src/migrations/019_search_and_hot_path_indexes.ts`
- Create: `packages/backend/test/unit/migration-runtime-resolvability.spec.ts`
- Create: `packages/backend/test/unit/search-and-hot-path-migration.spec.ts`
- Modify/Create: `supabase/migrations/20260729074816_*.sql` through `supabase/migrations/20260729075153_*.sql`

**Interfaces:**
- Consumes: Knex `Migration` exports with `up(knex)` and `down(knex)`.
- Produces: `tasks.search_vec`, `pg_trgm` in schema `extensions`, and six tenant-first indexes.

- [x] **Step 1: Write migration contract tests**

```ts
expect(sql).toContain('GENERATED ALWAYS AS');
expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_tasks_search');
expect(sql).toContain("WHERE status <> 'completed'");
expect(sql).toContain('WHERE is_read = false');
```

- [x] **Step 2: Run the migration tests and observe the missing runtime file/index migration**

Run: `npm test -w @wrike-clone/backend -- --runInBand migration`

- [x] **Step 3: Embed migration 018 SQL and implement idempotent migration 019**

```ts
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS extensions');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions');
  await knex.raw(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS search_vec tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED`);
}
```

- [x] **Step 4: Apply and verify Supabase migrations**

Expected: `tasks.search_vec` is generated, all six indexes exist, and the Supabase security advisor returns no findings.

- [x] **Step 5: Verify Railway migration runtime**

Run: `npm run build -w @wrike-clone/backend && npm test -w @wrike-clone/backend -- --runInBand migration`
Expected: compiled migrations resolve without source-file dependencies.

### Task 2: Request Forms and Blueprints Correctness

**Files:**
- Modify: `packages/backend/src/customization/customization.service.ts`
- Modify: `packages/backend/src/customization/customization.controller.ts`
- Test: `packages/backend/test/unit/customization.service.spec.ts`

**Interfaces:**
- Consumes: `submitRequestForm(formId: string, values: Record<string, unknown>)`.
- Produces: one task in a real project, associated with the configured folder, in a single transaction.

- [x] **Step 1: Add failing tests for folder/project mismatch, disabled public forms, required fields, and rollback**

```ts
await expect(service.submitPublicRequestForm(formId, {}))
  .rejects.toThrow('Required field');
expect(trx.rollback).toHaveBeenCalled();
expect(taskInsert.project_id).toBe(inboxProject.id);
expect(taskInsert.project_id).not.toBe(form.folder_id);
```

- [x] **Step 2: Run the scoped tests**

Run: `npm test -w @wrike-clone/backend -- --runInBand customization.service.spec.ts`
Expected: failures prove the old folder UUID was incorrectly used as `project_id`.

- [x] **Step 3: Resolve a valid target project transactionally**

```ts
const project = await trx('projects')
  .where({ tenant_id: form.tenant_id, folder_id: form.folder_id, is_request_inbox: true })
  .first();
if (!project) throw new UnprocessableEntityException('Request inbox project is not configured');
```

- [x] **Step 4: Validate normalized values and commit task plus folder location atomically**

```ts
await trx('task_locations').insert({
  tenant_id: form.tenant_id,
  task_id: task.id,
  folder_id: form.folder_id,
  is_primary: true,
});
```

- [x] **Step 5: Run customization tests, backend typecheck, and build**

Run: `npm test -w @wrike-clone/backend -- --runInBand customization.service.spec.ts && npm run typecheck -w @wrike-clone/backend && npm run build -w @wrike-clone/backend`

### Task 3: API Guardrails and Readiness

**Files:**
- Modify: `packages/backend/src/main.ts`
- Modify: `packages/backend/src/auth/auth.controller.ts`
- Modify: `packages/backend/src/notification/notification.service.ts`
- Modify: `packages/backend/src/health/health.controller.ts`
- Test: `packages/backend/src/main.spec.ts`
- Test: `packages/backend/test/unit/{auth.controller,notification.service,health.controller}.spec.ts`

**Interfaces:**
- Produces: strict DTO validation, five login attempts per minute, tenant/user-scoped notification updates, and HTTP 503 readiness failures.

- [x] **Step 1: Add failing guardrail tests**

```ts
expect(pipeOptions).toMatchObject({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
expect(update.where).toHaveBeenCalledWith({
  id: notificationId,
  tenant_id: tenantId,
  user_id: userId,
});
```

- [x] **Step 2: Configure global validation and login throttling**

```ts
app.useGlobalPipes(new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
}));

@Throttle({ default: { limit: 5, ttl: 60_000 } })
```

- [x] **Step 3: Scope notification writes and return a non-success readiness status**

```ts
throw new ServiceUnavailableException({
  status: 'unhealthy',
  checks: { database: { status: 'error' } },
});
```

- [x] **Step 4: Run all guardrail tests**

Run: `npm test -w @wrike-clone/backend -- --runInBand main.spec.ts auth.controller.spec.ts notification.service.spec.ts health.controller.spec.ts`

### Task 4: Keyset Pagination

**Files:**
- Modify: `packages/backend/src/task/task.service.ts`
- Modify: `packages/backend/src/project/project.service.ts`
- Modify: `packages/backend/src/notification/notification.service.ts`
- Modify: `packages/backend/src/timelog/timelog.service.ts`
- Modify: `packages/backend/src/search/search.service.ts`
- Modify: corresponding controllers and frontend API clients.
- Test: matching service and API specs.

**Interfaces:**
- Produces: `CursorPage<T> = { data: T[]; nextCursor: string | null; hasMore: boolean }`.

- [ ] **Step 1: Define and test an opaque cursor**

```ts
export type PageCursor = { sortValue: string; id: string };
export const encodeCursor = (cursor: PageCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString('base64url');
```

- [ ] **Step 2: Add a failing stable-order test**

```ts
expect(query.orderBy).toHaveBeenNthCalledWith(1, 'due_date', 'asc');
expect(query.orderBy).toHaveBeenNthCalledWith(2, 'id', 'asc');
expect(result.nextCursor).toBeTruthy();
```

- [ ] **Step 3: Replace offset predicates with tuple-safe keyset predicates**

```ts
query.where((builder) => builder
  .where('due_date', '>', cursor.sortValue)
  .orWhere((tie) => tie.where('due_date', cursor.sortValue).andWhere('id', '>', cursor.id)));
```

- [ ] **Step 4: Fetch `limit + 1`, trim, and emit the next cursor**

Run: `npm test -w @wrike-clone/backend -- --runInBand task project notification timelog search`
Expected: constant query shape at deep pages and no skipped rows on ties.

### Task 5: Auth Session Hardening

**Files:**
- Create: `packages/backend/src/migrations/021_refresh_token_families.ts`
- Modify: `packages/backend/src/auth/auth.service.ts`
- Modify: `packages/backend/src/auth/auth.controller.ts`
- Test: `packages/backend/test/e2e/auth.e2e-spec.ts`

**Interfaces:**
- Produces: rotated refresh tokens with `family_id`, `token_hash`, `used_at`, and `revoked_at`.

- [ ] **Step 1: Add e2e tests for rotation, replay, logout, expiry, and lockout**

```ts
await refresh(oldToken).expect(201);
await refresh(oldToken).expect(401);
await refresh(newToken).expect(401); // family revoked after replay
```

- [ ] **Step 2: Add the token-family migration with tenant/user indexes**

```sql
CREATE TABLE refresh_token_families (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  revoked_at timestamptz
);
```

- [ ] **Step 3: Rotate in one transaction and revoke the family on replay**

- [ ] **Step 4: Set refresh cookie `HttpOnly`, `Secure`, `SameSite=Strict`, and add a double-submit CSRF token**

- [ ] **Step 5: Run auth e2e**

Run: `npm run test:e2e -w @wrike-clone/backend -- --runInBand auth.e2e-spec.ts`

### Task 6: Accessible Design Foundation

**Files:**
- Modify: `packages/frontend/src/design/tokens.ts`
- Modify: `packages/frontend/src/styles/index.css`
- Create: `packages/frontend/src/stores/preferences.ts`
- Create: `packages/frontend/src/components/ui/{Dialog,Popover,Dropdown,Tooltip,Select}.tsx`
- Test: `packages/frontend/src/design/tokens.spec.ts`
- Test: `packages/frontend/src/components/ui/accessibility.spec.tsx`

**Interfaces:**
- Produces: `density: 'comfortable' | 'compact' | 'ultra'` and `theme: 'light' | 'dark' | 'system'`.

- [ ] **Step 1: Add failing semantic-token and keyboard-focus tests**

```ts
expect(document.documentElement.dataset.density).toBe('ultra');
expect(dialog).toHaveAttribute('aria-modal', 'true');
```

- [ ] **Step 2: Define light/dark semantic CSS variables**

```css
:root { --surface: 255 255 255; --text-muted: 100 116 139; }
.dark { --surface: 15 23 42; --text-muted: 148 163 184; }
[data-density="ultra"] { --row-height: 28px; }
```

- [ ] **Step 3: Persist theme and density and expose controls in `AppShell`**

- [ ] **Step 4: Convert loading boundaries from spinners to existing `Skeleton` primitives**

Run: `npm test -w @wrike-clone/frontend -- tokens accessibility && npm run build -w @wrike-clone/frontend`

### Task 7: Command Palette and Keyboard Workflow

**Files:**
- Create: `packages/frontend/src/components/CommandPalette/CommandPalette.tsx`
- Create: `packages/frontend/src/hooks/useKeyboardModel.ts`
- Modify: `packages/frontend/src/layouts/AppShell.tsx`
- Test: `packages/frontend/src/components/CommandPalette/CommandPalette.spec.tsx`

**Interfaces:**
- Produces: `⌘/Ctrl+K`, `/`, `j`, `k`, `Enter`, `e`, `a`, `Escape`, and `?`.

- [ ] **Step 1: Test shortcut suppression inside editable controls**

```ts
fireEvent.keyDown(input, { key: 'j' });
expect(onNext).not.toHaveBeenCalled();
fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
expect(screen.getByRole('dialog')).toBeVisible();
```

- [ ] **Step 2: Implement command search across tasks, projects, people, and actions**

- [ ] **Step 3: Add focus-safe list navigation and shortcut sheet**

- [ ] **Step 4: Verify keyboard-only operation**

Run: `npm test -w @wrike-clone/frontend -- CommandPalette`

### Task 8: Inline Editing, Bulk Actions, Optimistic Drag, and Undo

**Files:**
- Modify: `packages/frontend/src/components/Table/TaskTable.tsx`
- Modify: `packages/frontend/src/components/Kanban/KanbanBoard.tsx`
- Modify: `packages/frontend/src/api/tasks.ts`
- Create: `packages/frontend/src/components/Task/BulkActionBar.tsx`
- Test: corresponding component/API specs.

**Interfaces:**
- Produces: shift-range selection, Tab-to-next-cell editing, optimistic cache updates, rollback, and undoable delete.

- [ ] **Step 1: Add failing interaction tests**

```ts
await user.click(rows[1]);
await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
expect(screen.getByRole('toolbar', { name: /bulk/i })).toBeVisible();
```

- [ ] **Step 2: Implement optimistic mutation snapshots**

```ts
onMutate: async (patch) => {
  await queryClient.cancelQueries({ queryKey: ['tasks'] });
  const previous = queryClient.getQueriesData({ queryKey: ['tasks'] });
  applyTaskPatch(queryClient, patch);
  return { previous };
}
```

- [ ] **Step 3: Roll back on failure and expose an Undo toast**

- [ ] **Step 4: Add spring-like layout transitions using CSS and dnd-kit transforms**

Run: `npm test -w @wrike-clone/frontend -- TaskTable Kanban tasks`

### Task 9: Supabase Realtime and Presence

**Files:**
- Create: `packages/frontend/src/lib/supabase.ts`
- Create: `packages/frontend/src/hooks/useTaskRealtime.ts`
- Create: `packages/frontend/src/hooks/usePresence.ts`
- Modify: `packages/frontend/src/pages/ProjectPage.tsx`
- Create: a forward Supabase migration adding the selected tables to `supabase_realtime`.

**Interfaces:**
- Produces: project-scoped task invalidation and presence avatars; consumes a short-lived authenticated Supabase token containing tenant/user claims.

- [ ] **Step 1: Add hook tests with a fake Realtime channel**

```ts
expect(channel.on).toHaveBeenCalledWith(
  'postgres_changes',
  expect.objectContaining({ table: 'tasks', filter: `project_id=eq.${projectId}` }),
  expect.any(Function),
);
```

- [ ] **Step 2: Add only `tasks`, `task_locations`, and `comments` to the publication**

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE tasks, task_locations, comments;
```

- [ ] **Step 3: Invalidate narrow React Query keys on CDC events**

- [ ] **Step 4: Track project presence and render named viewer avatars**

- [ ] **Step 5: Verify two authenticated tenants cannot receive each other's changes**

### Task 10: Gantt, Critical Path, Custom Fields, and Rich Comments

**Files:**
- Modify: `packages/frontend/src/App.tsx`
- Modify: `packages/frontend/src/pages/ProjectPage.tsx`
- Modify: `packages/frontend/src/components/Gantt/GanttChart.tsx`
- Create: `packages/backend/src/task/critical-path.service.ts`
- Modify: `packages/frontend/src/components/Customization/CustomizationPanel.tsx`
- Modify: `packages/frontend/src/components/Comments/CommentSection.tsx`

**Interfaces:**
- Produces: routed timeline, DAG critical path, editable custom fields, rich comments, and `@mention` notifications.

- [ ] **Step 1: Add DAG tests for a longest dependency chain and cycle rejection**

```ts
expect(findCriticalPath(tasks, edges)).toEqual(['A', 'C', 'D']);
expect(() => findCriticalPath(tasks, cyclicEdges)).toThrow('Dependency cycle');
```

- [ ] **Step 2: Route the existing Gantt component and persist date drags optimistically**

- [ ] **Step 3: Render custom-field definitions as typed task editors**

- [ ] **Step 4: Store sanitized rich-text JSON and emit mention notifications**

- [ ] **Step 5: Run backend and frontend feature tests**

### Task 11: Saved Views and Focus Mode

**Files:**
- Create: `packages/backend/src/migrations/022_saved_views.ts`
- Create: `packages/backend/src/saved-view/*`
- Create: `packages/frontend/src/api/saved-views.ts`
- Modify: `packages/frontend/src/pages/MyTasksPage.tsx`
- Modify: `packages/frontend/src/components/Table/TaskTable.tsx`

**Interfaces:**
- Produces: personal/shared `{ filters, sort, grouping, columns }` views and a Today/Overdue/Next focus mode.

- [ ] **Step 1: Test tenant/user ownership and shared-project authorization**

- [ ] **Step 2: Add a JSONB saved-view schema with tenant-first indexes and RLS**

- [ ] **Step 3: Implement CRUD and URL-safe view activation**

- [ ] **Step 4: Build Focus Mode from due date, status, and assignee keyset queries**

### Task 12: Security and CI Release Gates

**Files:**
- Modify/Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deployed-smoke.yml`
- Create: `packages/backend/test/e2e/rls-isolation.e2e-spec.ts`
- Create: `packages/frontend/e2e/smoke.spec.ts`
- Modify: `.github/dependabot.yml`

**Interfaces:**
- Produces: two-tenant RLS tests, auth e2e, Playwright smoke, 60% backend coverage gate, bundle budget, secret scanning, and high-severity dependency scanning.

- [ ] **Step 1: Create two tenants and prove cross-tenant reads/writes return no rows**

```ts
await asTenant(tenantA).get(`/tasks/${tenantBTask.id}`).expect(404);
await asTenant(tenantA).patch(`/tasks/${tenantBTask.id}`).send({ title: 'x' }).expect(404);
```

- [ ] **Step 2: Add Playwright login/create/move/logout smoke**

- [ ] **Step 3: Gate backend coverage at 60% and frontend bundle chunks at agreed byte limits**

- [ ] **Step 4: Run `npm audit --audit-level=high`, Dependabot, and gitleaks in CI**

- [ ] **Step 5: Run the full release gate**

Run: `npm ci && npm run lint && npm run typecheck && npm test -- --runInBand && npm run build`
Expected: all workspaces pass and the Vercel production smoke returns HTTP 200.

### Task 13: Deployment and Monitoring

**Files:**
- Modify: `RAILWAY_DEPLOYMENT.md`
- Modify: `VERCEL_DEPLOYMENT.md`
- Modify: `.env.production.example`

**Interfaces:**
- Produces: reproducible Railway variables, Vercel static deployment, Supabase advisor checks, and public health/CORS probes.

- [ ] **Step 1: Rotate the exposed Supabase database password before Railway redeploy**

Never reuse the password that appeared in tracked deployment documentation.

- [ ] **Step 2: Configure Railway**

```text
DATABASE_URL=<Supabase transaction-pooler URL on port 6543>
DB_SSL=true
DB_MAX_CONNECTIONS=1
CORS_ORIGINS=https://wrike-clone-three.vercel.app
NODE_ENV=production
```

- [ ] **Step 3: Deploy Railway and run migrations**

Run in Railway: `npm run migration:run -w @wrike-clone/backend`
Start: `npm run start:prod -w @wrike-clone/backend`

- [ ] **Step 4: Verify public readiness and credentialed CORS**

```powershell
curl.exe -i https://wrike-clone-production-9894.up.railway.app/api/v1/health
curl.exe -i -X OPTIONS https://wrike-clone-production-9894.up.railway.app/api/v1/auth/login `
  -H "Origin: https://wrike-clone-three.vercel.app" `
  -H "Access-Control-Request-Method: POST"
```

- [ ] **Step 5: Monitor**

Expected: Vercel deployment `READY`, Railway readiness `200`, exact CORS origin with credentials, Supabase security advisor empty, and no new production errors.

---

## Self-Review

- Spec coverage: deployment split, CORS, bcrypt, pool sizing, RLS, dead serverless dependencies, search/indexes, keyset pagination, N+1 prevention, route splitting, query caching, optimistic UI, design system, keyboard UX, parity features, security, tests, CI, and monitoring each map to a task.
- Architecture adjustment: Railway is intentionally retained as the persistent backend, so Socket.IO, schedules, and BullMQ are not treated as serverless defects. Supabase Realtime is still introduced for database change delivery and presence.
- Type consistency: keyset pages use `CursorPage<T>`; request-form task creation resolves a project before writing `task_locations`; Realtime filters by `project_id`.
- Placeholder scan: every unchecked task names concrete files, behavior, a test assertion or implementation contract, and a verification command.
