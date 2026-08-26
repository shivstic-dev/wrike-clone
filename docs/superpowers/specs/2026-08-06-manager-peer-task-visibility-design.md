# Manager Peer Task Visibility Design

## Goal

Managers in the same CEPAA department can view one another's tasks everywhere tasks are presented. The initial users are Atul and Shivam. This is a read-access change only: managers must not gain permission to edit, assign, delete, complete, or otherwise mutate another manager's tasks.

## Scope

The behavior applies to all task-reading surfaces backed by department access rules, including task lists and details, dashboard data, search/filter results, calendar and timeline views, and reports. Access remains limited by tenant and department. A manager in one department cannot see tasks from another department unless separately authorized there.

## Authorization Model

The shared task read scope will treat both `employee` and `manager` workspace members as visible task assignees when the requesting user is a manager of that same department. It will continue to include:

- the requesting manager's own assignments;
- employee assignments in the department;
- unassigned department tasks; and
- assignments recorded through either the primary `tasks.assignee_id` field or `task_assignees`.

It will newly include other managers' assignments in that department. Department heads and tenant admins will not be added to the ordinary manager audience merely because they belong to the department. Their existing higher-level access remains unchanged.

All write authorization continues through department permission checks. Because mutation flows first load a readable task, the manager mutation guard will explicitly reject tasks assigned to another manager; otherwise the broader read scope would accidentally broaden write access. No role-management rule, assignment rule, or database RLS policy is broadened.

## Components

### Shared task query scope

Update `applyTaskAccessScope` in `packages/backend/src/common/visibility.scope.ts`. Its manager branch will select assignees whose effective workspace role is either `employee` or `manager`, while retaining tenant and department correlations. This scope is already consumed by task list/detail reads and timeline queries.

### Reports

Update `buildManagerAudience` in `packages/backend/src/reports/report-audience.ts` so a manager's combined and individual report audience includes non-head managers in the same department as well as employees. Tenant admins and department heads remain excluded from the manager audience.

### Write boundary

Strengthen `DepartmentAccessService.assertCanManageTask` so every mutation supplies a task ID. Managers may mutate self-assigned, employee-assigned, and unassigned tasks, but a task with another manager as a primary or additional assignee is read-only. Admin and department-head behavior remains unchanged, and status-only mutations use the same peer-manager guard.

### Dashboard and remaining read surfaces

Verify each CEPAA read endpoint uses either `applyTaskAccessScope` or the report audience. Any task-reading query that bypasses both must be brought under the same shared read scope so totals and rows agree. No frontend-only filtering will be used as an authorization boundary.

## Data Flow

1. An authenticated manager requests task data for CEPAA.
2. The backend resolves tenant identity and CEPAA department membership.
3. The shared read scope admits tasks assigned to employees or managers in CEPAA, plus unassigned tasks.
4. Existing endpoint filters such as project, status, dates, and assignee are applied within that authorized set.
5. Mutation endpoints continue to execute their existing write authorization independently.

## Error and Security Behavior

- Cross-tenant and cross-department tasks remain absent or return the existing not-found/forbidden behavior.
- A manager attempting to mutate another manager's task continues to receive the existing authorization failure.
- Invalid department or assignee filters cannot expand the authorized audience.
- Read-count queries and row queries must apply identical authorization so pagination totals cannot leak hidden tasks.

## Testing

Implementation will follow test-driven development:

1. Add a failing shared-scope test proving a CEPAA manager query includes both employee and manager assignees but excludes department heads/admins and preserves tenant/department correlation.
2. Add a failing report-audience test proving manager peers are included while heads/admins remain excluded.
3. Add or extend service tests to ensure task rows and count queries share the same scope where needed.
4. Preserve or add a write-authorization regression proving one manager cannot mutate another manager's task.
5. Run the focused backend tests, backend typecheck/build, and the full relevant test suite before completion.

## Acceptance Criteria

- Atul can view Shivam's CEPAA tasks on every supported task-reading surface.
- Shivam can view Atul's CEPAA tasks on every supported task-reading surface.
- Both managers continue to see CEPAA employee and unassigned tasks.
- Neither manager can view another department's tasks without membership there.
- Neither manager can edit or otherwise mutate the other manager's tasks.
- Dashboard/report totals match the visible task rows.
- Existing department-head, admin, and employee behavior remains unchanged.
