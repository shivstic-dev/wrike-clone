# Scoped Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a paginated activity feed that respects tenant, department, entity visibility, and user permissions.

**Architecture:** A dedicated activity module reads the existing `activity_logs` table and applies entity-aware access predicates before pagination. Admins can read all tenant activity; non-admin task events use the existing task scope, workspace/project events require current workspace access, and unsupported entity types fall back to the actor's own events.

**Tech Stack:** NestJS 11, Knex 3, PostgreSQL/Supabase RLS, React 19, TanStack Query 5, Jest, Vitest

## Global Constraints

- Run after the release-blockers and Trash plans; use migration number 025.
- All reads require the current tenant context and explicit `tenant_id` filtering in addition to RLS.
- Never return raw `metadata` or secrets to the client.
- Use camelCase API fields and newest-first cursor-safe ordering by `created_at DESC, id DESC`.
- Do not broaden task, department, workspace, project, or folder visibility.
- Preserve existing activity writers; this plan adds reads and normalizes only returned data.

---

### Task 1: Add the activity-feed query index and contracts

**Files:**
- Create: `packages/backend/src/migrations/025_activity_feed_index.ts`
- Create: `packages/backend/test/unit/activity-feed-migration.spec.ts`
- Modify: `packages/shared/src/types/api.ts`
- Modify: `packages/shared/src/validation/index.ts`

**Interfaces:**
- Produces: index `idx_activity_tenant_created_id` on `(tenant_id, created_at DESC, id DESC)`
- Produces: `activityFeedQuerySchema`
- Produces: `ActivityFeedQuery = z.infer<typeof activityFeedQuerySchema>`
- Produces: `ActivityFeedItem` and `ActivityFeedResponse`

- [ ] **Step 1: Write the failing migration test**

```ts
it('adds the tenant activity pagination index without replacing existing indexes', () => {
  const source = readFileSync(join(process.cwd(), 'src/migrations/025_activity_feed_index.ts'), 'utf8');
  expect(source).toContain('idx_activity_tenant_created_id');
  expect(source).toContain('tenant_id, created_at DESC, id DESC');
  expect(source).not.toContain('DROP INDEX idx_activity_tenant');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/activity-feed-migration.spec.ts`

Expected: FAIL because migration 025 does not exist.

- [ ] **Step 3: Implement the additive index**

```ts
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_activity_tenant_created_id
    ON activity_logs (tenant_id, created_at DESC, id DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_activity_tenant_created_id');
}
```

- [ ] **Step 4: Add exact shared contracts**

```ts
export interface ActivityFeedItem {
  id: string;
  actor: { id: string; displayName: string; avatarUrl: string | null };
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  action: string;
  changes: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityFeedResponse {
  data: ActivityFeedItem[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}
```

Add a query schema with `page` default 1, `perPage` default 25/max 100, optional UUID `actorId`, optional strings `action` and `entityType` capped at 64 characters, and optional ISO `dateFrom`/`dateTo` with `dateFrom <= dateTo` refinement.

Export `type ActivityFeedQuery = z.infer<typeof activityFeedQuerySchema>` beside the other inferred validation types so the controller and service share one exact filter type.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/activity-feed-migration.spec.ts test/unit/migration-history-alignment.spec.ts`

Expected: PASS.

```bash
git add packages/backend/src/migrations/025_activity_feed_index.ts packages/backend/test/unit/activity-feed-migration.spec.ts packages/shared/src/types/api.ts packages/shared/src/validation/index.ts
git commit -m "feat: add activity feed contracts and index"
```

### Task 2: Implement entity-aware activity visibility

**Files:**
- Create: `packages/backend/src/activity/activity.service.ts`
- Create: `packages/backend/test/unit/activity.service.spec.ts`

**Interfaces:**
- Produces: `ActivityService.findAll(filter: ActivityFeedQuery): Promise<ActivityFeedResponse>`
- Consumes: `DepartmentAccessService.isTenantAdmin()` and current tenant context

- [ ] **Step 1: Write failing visibility tests**

Cover these exact query outcomes:

- every query includes `activity_logs.tenant_id = ctx.tenantId`;
- admin query has no additional visibility predicate;
- non-admin task activity requires a currently visible, non-deleted task through primary/additional assignee, department-head, or manager scope;
- non-admin workspace/folder/project activity requires current workspace membership or global project visibility;
- unsupported entity types require `activity_logs.actor_id = ctx.userId`;
- filters apply before count and pagination;
- response excludes `metadata` and returns parsed `changes`.

Use a test row containing `metadata: { secret: 'must-not-leak' }` and assert the returned item has no `metadata` property.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/activity.service.spec.ts`

Expected: FAIL because the activity service does not exist.

- [ ] **Step 3: Build the base query**

```ts
let query = this.db('activity_logs')
  .join('users as actor', 'actor.id', 'activity_logs.actor_id')
  .where('activity_logs.tenant_id', ctx.tenantId);
```

For non-admins, add one grouped predicate with branches:

```ts
query = query.andWhere((visible) => {
  visible
    .where((taskEvent) => taskEvent
      .where('activity_logs.entity_type', 'task')
      .whereExists(buildVisibleTaskExists(ctx)))
    .orWhere((workspaceEvent) => workspaceEvent
      .whereIn('activity_logs.entity_type', ['workspace', 'folder', 'project'])
      .whereExists(buildVisibleContainerExists(ctx)))
    .orWhere((ownEvent) => ownEvent
      .whereNotIn('activity_logs.entity_type', ['task', 'workspace', 'folder', 'project'])
      .andWhere('activity_logs.actor_id', ctx.userId));
});
```

Implement `buildVisibleTaskExists` and `buildVisibleContainerExists` as private query-builder callbacks with explicit tenant predicates. Do not fetch rows and filter in memory.

- [ ] **Step 4: Map safe response fields**

Select actor display fields and derive entity labels with left joins to tasks, workspaces, folders, and projects. Return `null` when an entity has been purged. Parse JSON strings defensively to `{}`; return no `metadata` field.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/activity.service.spec.ts`

Expected: PASS.

```bash
git add packages/backend/src/activity/activity.service.ts packages/backend/test/unit/activity.service.spec.ts
git commit -m "feat: enforce activity feed visibility"
```

### Task 3: Expose the activity endpoint

**Files:**
- Create: `packages/backend/src/activity/activity.controller.ts`
- Create: `packages/backend/src/activity/activity.module.ts`
- Create: `packages/backend/test/unit/activity.controller.spec.ts`
- Modify: `packages/backend/src/app.module.ts`

**Interfaces:**
- Produces: `GET /activity?page=1&perPage=25&actorId=&action=&entityType=&dateFrom=&dateTo=`

- [ ] **Step 1: Write the failing controller test**

```ts
it('parses filters and requires task read permission', async () => {
  await controller.findAll({ page: '2', perPage: '10', entityType: 'task' });
  expect(activityService.findAll).toHaveBeenCalledWith(expect.objectContaining({
    page: 2,
    perPage: 10,
    entityType: 'task',
  }));
});

it('rejects an inverted date range', async () => {
  expect(() => controller.findAll({
    dateFrom: '2026-08-03T00:00:00.000Z',
    dateTo: '2026-08-01T00:00:00.000Z',
  })).toThrow();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/activity.controller.spec.ts`

Expected: FAIL because the controller/module do not exist.

- [ ] **Step 3: Implement controller and module**

```ts
@Controller('activity')
@UseGuards(AuthGuard, RolesGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @Permissions('task:read')
  findAll(@Query() query: unknown) {
    return this.activity.findAll(activityFeedQuerySchema.parse(query || {}));
  }
}
```

Import `RbacModule`, provide service/controller, and add `ActivityModule` to `AppModule`.

- [ ] **Step 4: Run backend activity tests and commit**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/activity.service.spec.ts test/unit/activity.controller.spec.ts`

Expected: PASS.

```bash
git add packages/backend/src/activity/activity.controller.ts packages/backend/src/activity/activity.module.ts packages/backend/test/unit/activity.controller.spec.ts packages/backend/src/app.module.ts
git commit -m "feat: expose scoped activity endpoint"
```

### Task 4: Add activity data hooks and page

**Files:**
- Create: `packages/frontend/src/api/activity.ts`
- Create: `packages/frontend/src/api/activity.spec.ts`
- Create: `packages/frontend/src/pages/ActivityPage.tsx`
- Create: `packages/frontend/src/pages/ActivityPage.spec.tsx`

**Interfaces:**
- Produces: `activityKeys` and `useActivityFeed(filters)`
- Produces: filterable activity page component

- [ ] **Step 1: Write failing API tests**

```ts
it('serializes activity filters', async () => {
  await fetchActivity({
    page: 2,
    perPage: 25,
    actorId: '11111111-1111-4111-8111-111111111111',
    entityType: 'task',
    action: 'task:restored',
  });
  expect(apiClient.get).toHaveBeenCalledWith(
    '/activity?page=2&perPage=25&actorId=11111111-1111-4111-8111-111111111111&entityType=task&action=task%3Arestored',
  );
});
```

- [ ] **Step 2: Write failing page tests**

Test loading skeletons, error retry, empty state, actor/action/entity/date filters, pagination, deleted entity labels, and human-readable action copy.

```tsx
expect(screen.getByText('Asha restored Prepare report')).toBeInTheDocument();
expect(screen.queryByText('must-not-leak')).not.toBeInTheDocument();
```

- [ ] **Step 3: Run and verify failure**

Run: `npm test -w @wrike-clone/frontend -- src/api/activity.spec.ts src/pages/ActivityPage.spec.tsx`

Expected: FAIL because the API module and page do not exist.

- [ ] **Step 4: Implement API and page**

Use query key `['activity', 'list', filters]`. The page uses existing `PageHeader`, `Panel`, `Skeleton`, `StatePanel`, and `Button` primitives. Format known actions through an exhaustive map with a safe fallback replacing `:` with spaces; never render raw JSON objects.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -w @wrike-clone/frontend -- src/api/activity.spec.ts src/pages/ActivityPage.spec.tsx`

Expected: PASS.

```bash
git add packages/frontend/src/api/activity.ts packages/frontend/src/api/activity.spec.ts packages/frontend/src/pages/ActivityPage.tsx packages/frontend/src/pages/ActivityPage.spec.tsx
git commit -m "feat: add scoped activity feed page"
```

### Task 5: Add lazy route, navigation, and full verification

**Files:**
- Modify: `packages/frontend/src/App.tsx`
- Modify: `packages/frontend/src/design/navigation.ts`
- Modify: `packages/frontend/src/layouts/AppShell.tsx`
- Modify: `packages/frontend/src/layouts/AppShell.spec.tsx`

**Interfaces:**
- Produces: protected lazy `/activity` route and shared navigation item

- [ ] **Step 1: Write the failing navigation assertion**

```ts
expect(navigationForRole('employee')).toEqual(expect.arrayContaining([
  expect.objectContaining({ label: 'Activity', path: '/activity', icon: 'activity' }),
]));
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w @wrike-clone/frontend -- src/layouts/AppShell.spec.tsx`

Expected: FAIL because the route and navigation item do not exist.

- [ ] **Step 3: Add route and icon**

Add `ActivityPage` through `lazy()`, register `/activity`, extend the navigation icon union and `iconPaths` with `activity`, and add Activity to the `manage` section for all authenticated roles.

- [ ] **Step 4: Run full verification**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/activity.service.spec.ts test/unit/activity.controller.spec.ts test/unit/activity-feed-migration.spec.ts`

Run: `npm test -w @wrike-clone/frontend -- src/api/activity.spec.ts src/pages/ActivityPage.spec.tsx src/layouts/AppShell.spec.tsx`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/App.tsx packages/frontend/src/design/navigation.ts packages/frontend/src/layouts/AppShell.tsx packages/frontend/src/layouts/AppShell.spec.tsx
git commit -m "feat: add activity feed navigation"
```
