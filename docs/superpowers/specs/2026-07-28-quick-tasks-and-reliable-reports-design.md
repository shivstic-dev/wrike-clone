# Quick Tasks and Reliable Reports Design

**Date:** 2026-07-28
**Status:** Approved in conversation
**Application:** OpenWork Hub / Wrike clone

## Purpose

Make task creation fast without requiring users to understand the folder and
project hierarchy first, while preserving the existing department RBAC model
and project-based task architecture. Correct reports so the default audience
matches the viewer's role and the screen and exported files contain the same
current task data.

## Confirmed Product Decisions

- Each department owns its own automatic `General` folder.
- Tasks may move only between folders and projects in the same department.
- A permanent `+ Create task` action is available throughout the authenticated
  application to users who may create tasks.
- Report defaults are role-aware:
  - employee: assigned personal tasks;
  - manager: self, employees, and unassigned department tasks;
  - department head: every task in the department;
  - tenant admin: every task in the organization.
- The implementation uses one automatic system project per folder rather than
  allowing tasks without projects or linking every quick task to one
  department-wide project.

## Existing-System Findings

- `tasks.project_id` is required, so direct task creation cannot safely omit a
  project without a broad schema and query rewrite.
- A `task_folder_links` table exists, but current task creation does not write a
  home-folder link and no movement API manages it.
- The production database currently contains current task data, but the admin
  report defaults to `self`. A task created by the admin and assigned to
  another user is therefore excluded from both the screen and export.
- PDF and XLSX byte generation already exists. The primary report defect is the
  audience/default filter, followed by the absence of a visible task-row table
  that would make the active scope obvious.

## Architecture

### System folders and projects

The first quick task in a department provisions a visible root folder named
`General` and a hidden system project named `General Tasks` inside that folder.
The provisioning operation is idempotent and transaction-safe.

Every folder may have at most one hidden system project. A system project is
created on demand when a task is placed into a folder without choosing a normal
project. Normal projects remain visible and behave as they do today.

The data model must distinguish system-created records from user-created
records with explicit flags rather than relying on names:

- `folders.is_system_general boolean not null default false`
- `projects.is_system boolean not null default false`

Database uniqueness rules must enforce:

- at most one system-General folder per tenant and department;
- at most one system project per tenant and folder.

System records cannot be renamed, archived, or deleted through normal folder
and project mutations while they contain active tasks. The hidden system
project is excluded from normal project lists and selectors. The visible
General folder remains selectable so users can find quick tasks.

### Canonical task location

A task continues to require `project_id`. Its department continues to be
derived from the selected project's folder and stored in `department_id`.

Every newly created task also receives exactly one home entry in
`task_folder_links` with `is_home = true`. The home folder is the selected
project's folder. Existing tasks without a home link are backfilled from
`projects.folder_id`.

The service treats the project and home-folder link as one location:

- no folder or project selected: department General folder and its system
  project;
- folder selected without a project: that folder and its system project;
- normal project selected: that project and its containing folder.

Task reads return location metadata sufficient for the UI:

- `folderId`
- `folderName`
- `projectId`
- `projectName`
- `isSystemProject`

### Task movement

Moving a task is a dedicated service operation, not a generic update-field
side effect.

Supported destinations:

- folder only: use or create that folder's system project;
- normal project: use that project and its containing folder.

Before writing, the service verifies:

- the actor is an admin, department head, or manager for the task department;
- the destination folder/project belongs to the same tenant;
- the destination belongs to the task's current department;
- the destination is active and visible to the actor.

One transaction updates `tasks.project_id`, replaces the home
`task_folder_links` row, preserves `tasks.department_id`, and writes an activity
entry containing the old and new folder/project identifiers. Assignees,
comments, dependencies, dates, status, priority, time entries, and task ID are
unchanged. A failed move leaves the original location intact.

## API Design

### Quick task creation

Extend task creation so `projectId` is optional when `departmentId` is
provided. The accepted location combinations are:

- `departmentId` only;
- `departmentId` and `folderId`;
- `projectId` only;
- `departmentId`, `folderId`, and a compatible `projectId`.

Ambiguous or mismatched combinations return a validation error. The server,
not the browser, provisions system records and resolves the canonical project
and home folder.

`POST /api/v1/tasks` remains the creation endpoint and returns the task with
assignees and resolved location metadata.

### Location choices

Add a read endpoint that returns only valid destinations for the acting user:

`GET /api/v1/departments/:departmentId/task-locations`

It returns folders and their visible normal projects. System projects are not
returned as selectable projects because choosing a folder alone represents
the system-project destination.

### Move endpoint

Add:

`PATCH /api/v1/tasks/:taskId/location`

Body:

```json
{
  "folderId": "uuid",
  "projectId": "00000000-0000-4000-8000-000000000001"
}
```

The response is the updated task with resolved location metadata.

## User Experience

### Global Quick task action

The authenticated top bar contains a permanent `+ Create task` button for:

- tenant admins;
- department heads;
- managers.

Employees do not see the action because the approved RBAC model does not allow
employees to create tasks.

The compact form contains:

- title, required;
- department, required and preselected from the current page when available;
- assignees;
- due date;
- folder, defaulting to General;
- project, optional;
- a `More details` disclosure for description, priority, start date, estimated
  hours, and visibility when the actor may set it.

Changing department clears incompatible folder, project, and assignee
selections. Manager assignee choices remain limited to the manager and
employees in that department. Department heads and admins receive their
existing broader assignment choices.

After success, a confirmation identifies the resolved folder/project and
includes an `Open task` action. All task, dashboard, folder, project, and report
queries affected by the new task are invalidated.

### Folder browsing

Folder rows on the department page become selectable. Selecting a folder shows:

- tasks whose home link points at that folder;
- visible normal projects inside the folder.

System projects never appear as project cards. Tasks stored through a system
project remain visible in the folder task list, Dashboard, My Tasks, search,
calendar where applicable, and reports.

### Editing task location

The task detail edit experience adds a `Location` section with department
shown as fixed context and folder/project destination controls. Authorized
users may move within the same department. Employees cannot see movement
controls and retain their existing assigned-task status permissions.

## Reports

### Role-aware server defaults

Role-aware behavior is enforced by the backend even when the caller omits
`scope`; it is not only a frontend initial-state convenience.

- Employee default: `self`, assigned tasks only.
- Manager default: `combined`, including tasks assigned to the manager,
  employees in the department, and unassigned tasks in that department.
  Tasks owned only by another manager or the department head are excluded.
- Department head default: `combined`, all active tasks in the department,
  including unassigned tasks.
- Tenant admin default: `combined`, all active tasks in the selected department
  or all active organization tasks when no department is selected, including
  unassigned tasks.

Explicit `self`, `individual`, and `combined` choices remain available only
where permitted. Individual reports contain tasks assigned to the selected
permitted person. Existing tenant and department authorization checks remain
server-side.

### Filters and onscreen data

The report controls include:

- department;
- clearly labelled `Created from` and `Created to`;
- status;
- priority;
- report scope;
- report person for individual scope;
- assignee.

The summary continues to show total, completed, overdue, completion rate, and
average completion time. A task table beneath the summary shows the exact
matching rows:

- department;
- task title;
- assignees;
- status;
- priority;
- due date.

When no rows match, the page explains that the active filters returned no
tasks and disables PDF/XLSX export. It does not present a successful empty
download.

### Export consistency

Both screen metrics and exports call the same report-building service with the
same normalized filter and audience resolution. PDF and XLSX use the exact
`DepartmentReport.tasks` collection returned to the screen.

XLSX retains Summary, Per user, and Tasks worksheets. PDF retains summary,
per-user, and task sections. Exports include the resolved role/scope and active
filter labels so recipients can understand what the file contains.

Creating, assigning, updating, deleting, or moving tasks invalidates frontend
report queries. Export errors expose a safe actionable message rather than only
`Report export failed`.

## Error Handling and Concurrency

- System provisioning uses database uniqueness constraints plus conflict-safe
  reads so simultaneous quick-task requests converge on the same folder and
  project.
- Provisioning, task creation, task assignment rows, and the home-folder link
  are committed in one transaction.
- Movement and its audit entry are committed in one transaction.
- Invalid cross-department destinations return `403`.
- Missing or archived destinations return `404`.
- A folder/project mismatch returns `400`.
- A report request with an audience outside the actor's permitted scope returns
  `403`.
- Report loading and export failures keep the current filters and provide a
  retry path.

## Security

- Tenant identifiers always come from authenticated request context, never from
  trusted client input alone.
- Department RBAC checks run before provisioning, creation, or movement.
- Managers cannot use Quick task or movement to assign another manager or a
  department head.
- Home-folder links and system records remain tenant-scoped and covered by RLS.
- The implementation adds no public privileged functions and does not expose
  service-role credentials to the frontend.

## Migration and Existing Data

The release includes a forward-only migration that:

1. Adds system flags and partial unique indexes.
2. Adds any supporting index needed for one-home-folder lookup.
3. Backfills one home link for every active task that lacks one, using the
   task's current project's folder.
4. Leaves user-created folders and projects unchanged.

General folders and system projects are provisioned lazily. The migration does
not create empty General records for every department.

## Testing

### Backend unit and integration coverage

- provisioning is idempotent;
- concurrent conflict recovery selects the existing system record;
- each accepted task location combination resolves correctly;
- mismatched and cross-department destinations fail;
- moving to a folder uses its system project;
- moving to a normal project updates the home folder;
- a failed move preserves the original task location;
- employee, manager, department-head, and admin report defaults are correct;
- manager combined scope excludes other managers but includes unassigned work;
- department-head and admin combined scopes include unassigned work;
- individual and explicit self filters remain correct;
- report screen data and PDF/XLSX source rows are identical;
- XLSX and PDF remain valid files.

### Frontend coverage

- global action visibility follows role;
- current department is preselected;
- department changes clear incompatible values;
- folder-only submission omits project and uses server resolution;
- successful creation refreshes tasks and reports;
- location editing submits only a permitted same-department destination;
- role-aware report defaults and explicit filters serialize correctly;
- zero-result reports disable export and show filter context.

### Production verification

Verify the complete story on the production deployment:

1. Create a Quick task with only title, department, and assignee.
2. Confirm General and the hidden system project are resolved once.
3. Confirm the task appears in the General folder, dashboard, and assignee's My
   Tasks.
4. Move it to another folder and confirm its ID, assignees, comments, and
   status are preserved.
5. Confirm role-default reports include the expected current task.
6. Apply filters and confirm the onscreen rows match XLSX and PDF contents.
7. Confirm no new Railway, Vercel, or database errors.

## Rollout

Apply and verify the database migration before deploying backend code that
uses the new flags and indexes. Deploy the backend next, verify legacy
project-based task creation, then deploy the frontend. Existing project task
creation remains supported throughout the rollout.
