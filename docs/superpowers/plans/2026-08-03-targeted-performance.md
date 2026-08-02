# Targeted Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce avoidable search requests, route latency, and task-list payload size while improving loading feedback without speculative infrastructure.

**Architecture:** Client-side debounce and TanStack Query prefetch improve perceived speed, while a typed task-list DTO trims fields unused by list views. Existing lazy routes, cache settings, compression, and virtualized-library dependency remain intact; list virtualization is added only if profiling crosses the documented threshold.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, TypeScript 5.7, NestJS 11, Knex 3, Vitest, Jest

## Global Constraints

- Run after release blockers; it can run independently of notifications, Trash, and activity after shared-file conflicts are reconciled.
- Use the existing `VITE_API_URL`; do not introduce `VITE_API_BASE_URL`.
- Preserve current React Query defaults, lazy routes, manual chunks, compression, memory cache, and database indexes.
- Do not add Redis, a new search engine, or new dependencies.
- Do not add list virtualization unless the documented profiling threshold is met.
- Keep task-detail responses complete; trim only list endpoints.

---

### Task 1: Debounce global search and mount the existing search bar

**Files:**
- Create: `packages/frontend/src/hooks/useDebouncedValue.ts`
- Create: `packages/frontend/src/hooks/useDebouncedValue.spec.tsx`
- Modify: `packages/frontend/src/components/Search/SearchBar.tsx`
- Create: `packages/frontend/src/components/Search/SearchBar.spec.tsx`
- Modify: `packages/frontend/src/layouts/AppShell.tsx`
- Modify: `packages/frontend/src/layouts/AppShell.spec.tsx`

**Interfaces:**
- Produces: `useDebouncedValue<T>(value: T, delayMs: number): T`
- Produces: global search requests only after 300 ms of input stability

- [ ] **Step 1: Write the failing debounce hook test**

```tsx
it('publishes the latest value only after the delay', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(
    ({ value }) => useDebouncedValue(value, 300),
    { initialProps: { value: 'a' } },
  );
  rerender({ value: 'ab' });
  expect(result.current).toBe('a');
  act(() => vi.advanceTimersByTime(299));
  expect(result.current).toBe('a');
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe('ab');
});
```

- [ ] **Step 2: Write the failing search request test**

Type `report` quickly, advance 299 ms, and assert no API call. Advance one additional millisecond and assert exactly one `/search?q=report&perPage=8` call. Then change to `reports`, advance 300 ms, and assert one additional call.

- [ ] **Step 3: Run and verify failure**

Run: `npm test -w @wrike-clone/frontend -- src/hooks/useDebouncedValue.spec.tsx src/components/Search/SearchBar.spec.tsx`

Expected: FAIL because the hook does not exist and SearchBar queries the live value.

- [ ] **Step 4: Implement debounce**

```ts
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);
  return debounced;
}
```

In `SearchBar`, keep the immediate input state for rendering and use `const debouncedQuery = useDebouncedValue(query.trim(), 300)` for the query key, query function, and enabled condition.

- [ ] **Step 5: Mount SearchBar in the desktop top bar**

Replace the desktop-only link that says “Search tasks” with `<SearchBar />`. Keep mobile navigation to `/search` through an accessible search button so the dropdown does not crowd the mobile header.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -w @wrike-clone/frontend -- src/hooks/useDebouncedValue.spec.tsx src/components/Search/SearchBar.spec.tsx src/layouts/AppShell.spec.tsx`

Expected: PASS.

```bash
git add packages/frontend/src/hooks/useDebouncedValue.ts packages/frontend/src/hooks/useDebouncedValue.spec.tsx packages/frontend/src/components/Search/SearchBar.tsx packages/frontend/src/components/Search/SearchBar.spec.tsx packages/frontend/src/layouts/AppShell.tsx packages/frontend/src/layouts/AppShell.spec.tsx
git commit -m "perf: debounce global task search"
```

### Task 2: Prefetch task details on intentional navigation

**Files:**
- Modify: `packages/frontend/src/api/tasks.ts`
- Modify: `packages/frontend/src/api/tasks.spec.ts`
- Modify: `packages/frontend/src/components/Kanban/TaskCard.tsx`
- Modify: `packages/frontend/src/components/Table/TaskTable.tsx`
- Modify: `packages/frontend/src/pages/SearchPage.tsx`
- Create: `packages/frontend/src/components/Kanban/TaskCard.spec.tsx`

**Interfaces:**
- Produces: `fetchTask(id: string): Promise<Task>`
- Produces: `prefetchTask(queryClient: QueryClient, id: string): Promise<void>` with 30-second freshness

- [ ] **Step 1: Write failing helper tests**

```ts
it('prefetches the canonical detail query', async () => {
  await prefetchTask(queryClient, 'task-1');
  expect(queryClient.getQueryData(taskKeys.detail('task-1'))).toEqual(task);
  expect(apiClient.get).toHaveBeenCalledWith('/tasks/task-1');
});
```

- [ ] **Step 2: Write failing interaction tests**

Render a task card and trigger `pointerEnter` then `focus` on its task link. Assert `prefetchTask` is called once for that task; rapid repeated events must reuse the fresh query and not issue duplicate HTTP calls.

- [ ] **Step 3: Run and verify failure**

Run: `npm test -w @wrike-clone/frontend -- src/api/tasks.spec.ts src/components/Kanban/TaskCard.spec.tsx`

Expected: FAIL because the shared fetch/prefetch functions do not exist.

- [ ] **Step 4: Extract canonical fetch and prefetch**

```ts
export async function fetchTask(id: string): Promise<Task> {
  const response = await apiClient.get(`/tasks/${id}`);
  return (response.data?.data || response.data) as Task;
}

export function prefetchTask(queryClient: QueryClient, id: string): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => fetchTask(id),
    staleTime: 30_000,
  });
}
```

Make `useTask()` call `fetchTask(id)`.

- [ ] **Step 5: Attach intentional prefetch triggers**

On task links in `TaskCard`, `TaskTable`, and task-type `SearchPage` results, call prefetch on `onPointerEnter` and `onFocus`. Do not prefetch project results or every row on mount.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -w @wrike-clone/frontend -- src/api/tasks.spec.ts src/components/Kanban/TaskCard.spec.tsx`

Expected: PASS.

```bash
git add packages/frontend/src/api/tasks.ts packages/frontend/src/api/tasks.spec.ts packages/frontend/src/components/Kanban/TaskCard.tsx packages/frontend/src/components/Kanban/TaskCard.spec.tsx packages/frontend/src/components/Table/TaskTable.tsx packages/frontend/src/pages/SearchPage.tsx
git commit -m "perf: prefetch task details on intent"
```

### Task 3: Introduce and enforce a task-list DTO

**Files:**
- Modify: `packages/shared/src/types/api.ts`
- Modify: `packages/backend/src/task/task.service.ts`
- Modify: `packages/backend/test/unit/task.service.spec.ts`
- Modify: `packages/frontend/src/api/tasks.ts`
- Modify: `packages/frontend/src/api/tasks.spec.ts`

**Interfaces:**
- Produces: `TaskListItem` for list endpoints
- Preserves: `GET /tasks/:id` returns complete `Task`

- [ ] **Step 1: Define the exact list contract**

```ts
export type TaskListItem = Pick<Task,
  | 'id' | 'tenantId' | 'projectId' | 'departmentId' | 'parentTaskId'
  | 'assigneeId' | 'title' | 'status' | 'priority' | 'visibility'
  | 'estimatedHours' | 'startDate' | 'dueDate' | 'completedAt'
  | 'handoffRequired' | 'handoffStatus' | 'handoffOwnerId'
  | 'sortOrder' | 'createdAt' | 'updatedAt'
> & {
  assignees: TaskAssignee[];
  projectName: string | null;
  folderName: string | null;
  departmentName: string | null;
};
```

This intentionally excludes description, custom fields, actual hours, deletion metadata, and audit-only creator fields from list payloads.

- [ ] **Step 2: Write failing backend projection tests**

Assert `findAll()` list rows do not contain `description`, `custom_fields`, `actual_hours`, or `deleted_at`, while `findById()` still returns those fields. Assert required list fields and assignees remain present.

- [ ] **Step 3: Run and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/task.service.spec.ts`

Expected: FAIL because `TASK_SELECT_COLUMNS` includes detail-only columns.

- [ ] **Step 4: Split list and detail projections**

Rename the existing projection to `TASK_DETAIL_SELECT_COLUMNS`. Add `TASK_LIST_SELECT_COLUMNS` matching `TaskListItem` and use it only in `findAll()`/`findMyTasks()`. Keep `findById()` on the detail projection. Preserve all joins and aliases consumed by current list views.

- [ ] **Step 5: Update frontend list typing**

Change `useTasks`, `useMyTasks`, grouped task interfaces, `TaskTable`, `TaskCard`, and Kanban inputs to accept `TaskListItem` where they consume list data. Components requiring full detail continue accepting `Task`.

- [ ] **Step 6: Run backend/frontend tests and commit**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/task.service.spec.ts`

Run: `npm test -w @wrike-clone/frontend -- src/api/tasks.spec.ts src/components/Kanban/KanbanBoard.spec.tsx`

Expected: PASS.

```bash
git add packages/shared/src/types/api.ts packages/backend/src/task/task.service.ts packages/backend/test/unit/task.service.spec.ts packages/frontend/src/api/tasks.ts packages/frontend/src/api/tasks.spec.ts packages/frontend/src/components/Table/TaskTable.tsx packages/frontend/src/components/Kanban/TaskCard.tsx packages/frontend/src/components/Kanban/KanbanColumn.tsx packages/frontend/src/components/Kanban/KanbanBoard.tsx
git commit -m "perf: trim task list response payloads"
```

### Task 4: Replace blank loading transitions with scoped skeletons

**Files:**
- Create: `packages/frontend/src/components/common/RouteSkeleton.tsx`
- Create: `packages/frontend/src/components/common/RouteSkeleton.spec.tsx`
- Modify: `packages/frontend/src/App.tsx`
- Modify: `packages/frontend/src/components/Table/TaskTable.tsx`
- Create: `packages/frontend/src/components/Table/TaskTable.spec.tsx`

**Interfaces:**
- Produces: `RouteSkeleton` with stable page-header and content geometry
- Produces: task table loading state with header plus eight skeleton rows

- [ ] **Step 1: Write failing skeleton tests**

```tsx
it('renders stable route geometry without an indefinite spinner', () => {
  render(<RouteSkeleton />);
  expect(screen.getByLabelText('Loading page')).toBeInTheDocument();
  expect(screen.getAllByTestId('route-skeleton-row')).toHaveLength(6);
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

it('renders eight task rows while loading', () => {
  render(<TaskTable tasks={[]} isLoading />);
  expect(screen.getAllByTestId('task-row-skeleton')).toHaveLength(8);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w @wrike-clone/frontend -- src/components/common/RouteSkeleton.spec.tsx src/components/Table/TaskTable.spec.tsx`

Expected: FAIL because scoped skeletons do not exist.

- [ ] **Step 3: Implement skeleton components**

Compose the existing `Skeleton` primitive. Use `aria-label="Loading page"`, avoid live-region announcements for every row, and keep dimensions close to final content to reduce layout shift. Replace `RouteLoadingFallback` spinner with `RouteSkeleton` and the TaskTable spinner with table skeleton rows.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -w @wrike-clone/frontend -- src/components/common/RouteSkeleton.spec.tsx src/components/Table/TaskTable.spec.tsx`

Expected: PASS.

```bash
git add packages/frontend/src/components/common/RouteSkeleton.tsx packages/frontend/src/components/common/RouteSkeleton.spec.tsx packages/frontend/src/App.tsx packages/frontend/src/components/Table/TaskTable.tsx packages/frontend/src/components/Table/TaskTable.spec.tsx
git commit -m "perf: add stable route and table skeletons"
```

### Task 5: Record performance baselines and gate virtualization

**Files:**
- Create: `docs/performance/task-list-baseline.md`
- Modify: `packages/frontend/src/components/Table/TaskTable.tsx`

**Interfaces:**
- Produces: repeatable profiling protocol and an explicit virtualization decision threshold

- [ ] **Step 1: Remove the unused virtualizer import**

Delete `useVirtualizer` from `TaskTable.tsx` while retaining `@tanstack/react-virtual` as an installed dependency for a future measured need.

- [ ] **Step 2: Write the profiling protocol**

Document these exact datasets and measurements:

- 25, 100, 250, and 500 visible task rows;
- Chrome Performance recording for first render, sort, filter, and row selection;
- median of five runs on the same machine;
- React Profiler commit duration;
- task-list response compressed/uncompressed bytes;
- number of search requests for a five-character rapid input.

Set the virtualization gate: implement it only if the median interaction commit exceeds 100 ms at 250 visible rows or a single render creates a greater-than-200 ms main-thread task. Record the measured decision in the document.

- [ ] **Step 3: Run final performance-plan verification**

Run: `npm test -w @wrike-clone/frontend -- src/hooks/useDebouncedValue.spec.tsx src/components/Search/SearchBar.spec.tsx src/api/tasks.spec.ts src/components/common/RouteSkeleton.spec.tsx src/components/Table/TaskTable.spec.tsx`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all commands exit 0. Confirm the production build reports no new dependency chunk solely for this plan.

- [ ] **Step 4: Commit**

```bash
git add docs/performance/task-list-baseline.md packages/frontend/src/components/Table/TaskTable.tsx
git commit -m "docs: record task list performance baseline"
```
