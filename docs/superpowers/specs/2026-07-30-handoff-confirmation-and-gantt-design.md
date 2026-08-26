# Handoff Confirmation and Gantt Design

**Date:** 2026-07-30
**Status:** Approved in conversation
**Application:** OpenWork Hub / Wrike clone

## Purpose

Prevent completed work from being forgotten before it reaches the person who
requested or assigned it, without turning OpenWork into a file-transfer,
storage, or email-delivery system. Complete the missing Gantt capability with
an interactive, permission-aware timeline at both organization and project
level. Make dashboard task totals actionable by showing the tasks behind each
number, including self-assigned work.

This design extends the existing backend blueprint work. It does not replace
or reverse the security, deployment, reporting, request-form, search, and
performance improvements already in progress.

## Confirmed Product Decisions

- A final handoff confirmation is required by default for every task.
- A task creator may disable `Final handoff required` for a purely internal
  task.
- OpenWork asks the person completing the task:
  `Has the finished work been shared with the intended recipient?`
- `Yes, handoff completed` confirms the handoff and completes the task.
- `Not yet` keeps the task incomplete and marks it `Ready for handoff`.
- OpenWork does not upload, store, email, or transmit the deliverable.
- The intended recipient, called the task owner in the application, is the
  person who created the task or most recently assigned/reassigned it.
- Confirmation does not require a second approval from the task owner.
- The dashboard and My Tasks keep incomplete handoffs visible until confirmed.
- Dashboard task totals open the concrete list of tasks represented by the
  number.
- Gantt is available as an organization/department Dashboard Timeline and as a
  Timeline tab within each project.
- Managers and department heads may schedule tasks and manage dependencies in
  their authorized scope. Employees may edit only tasks they already have
  permission to manage.

## Existing-System Findings

- `completed` is currently an ordinary task status. Task detail, forms, Kanban,
  bulk updates, and direct API updates can set it independently.
- `TaskService.update()` only manages `completed_at`; it has no handoff guard.
- Task creation and bulk updates can create or move tasks directly into a
  completed state.
- The database has no handoff recipient, state, confirmer, or confirmation-time
  fields.
- A dormant `GanttChart` component exists but is not mounted by any route or
  tab. It does not persist drag operations, resize bars, support zoom, or
  correctly render dependency types and lag.
- Project task loading is capped, so a large timeline can silently omit work.
- Existing task-list APIs do not return the complete dependency graph needed
  by a Gantt view.
- Dependency creation needs stronger tenant scoping, cycle validation, update
  support, and date validation.
- The production topology is a Vercel frontend, Railway NestJS backend, and
  Supabase Postgres database. The application is not an MCP server and is not
  currently eligible for a ChatGPT App submission.

## Architecture

### Separate work progress from handoff

Task status and handoff state are independent dimensions. A task may be in
progress while its handoff is pending, or it may be ready for handoff while
remaining incomplete. `completed` is only entered after handoff is confirmed
or handoff is explicitly not required.

All completion entry points call one backend completion service. The task
detail page, task form, Kanban board, bulk actions, and API clients cannot each
invent their own completion behavior.

### Handoff state model

Add the following tenant-scoped task fields:

- `handoff_required boolean not null default true`
- `handoff_status text not null default 'pending'`
- `handoff_owner_id uuid null`
- `handoff_ready_at timestamptz null`
- `handoff_confirmed_by uuid null`
- `handoff_confirmed_at timestamptz null`

Allowed handoff states are:

- `pending`: handoff is required but the task has not been presented as ready;
- `ready`: the work is ready but has not been handed off;
- `confirmed`: the person completing the task confirms the handoff;
- `not_required`: the creator disabled final handoff.

Database checks keep state and timestamps consistent. Foreign keys are
tenant-safe and use the same user deletion behavior as existing task actor
references. Tenant-first indexes support owner, assignee, and dashboard
queries for ready handoffs.

The current state lives on the task for efficient lists and filters. Existing
task activity records provide the immutable history:

- handoff requirement enabled or disabled;
- task marked ready for handoff;
- handoff confirmed;
- task reopened and confirmation reset.

### Task owner resolution

At creation, `handoff_owner_id` is the creator. When an authorized user assigns
or reassigns the task, that acting user becomes the handoff owner for the
current assignment. Bulk assignment uses the actor who initiated the bulk
operation. A self-assignment that does not introduce a separate assigner keeps
the creator as owner.

The owner is stored as a snapshot instead of being derived from activity on
every read. Historical activity still records who performed each assignment.
If the owner account becomes unavailable, tenant administrators and the
authorized department head can see and resolve the task.

### Completion state machine

For a task requiring handoff:

1. The user requests completion.
2. The server verifies tenant access and permission to change the task.
3. With outcome `confirmed`, one transaction:
   - sets handoff state to `confirmed`;
   - records confirmer and time;
   - sets task status to `completed` and `completed_at`;
   - records activity;
   - creates the applicable in-app notification.
4. With outcome `not_yet`, one transaction:
   - sets handoff state to `ready`;
   - records `handoff_ready_at`;
   - ensures the task is not completed;
   - records activity;
   - creates one in-app reminder for the assignee and visibility for the owner.

For a task where handoff is not required, completion proceeds normally and
the state remains `not_required`.

Reopening a completed task clears the current confirmation fields, restores
`pending` when handoff is required, and retains previous activity history. A
new completion therefore requires a new confirmation after further work.

The transaction is idempotent. Repeating the same request does not create
duplicate completion events or notifications.

## API Design

### Completion commands

Add a dedicated command:

`POST /api/v1/tasks/:taskId/completion`

Body for tasks requiring handoff:

```json
{
  "outcome": "confirmed"
}
```

or:

```json
{
  "outcome": "not_yet"
}
```

The response returns the updated task, handoff metadata, and the authoritative
completion state.

Add a matching bulk command that accepts an explicit outcome per task. It
validates all selected tasks and reports per-task permission or validation
errors without falsely presenting failed tasks as completed.

Generic task update and create endpoints must not bypass the command:

- creating a task as completed delegates to the same state rules or is
  rejected when confirmation is missing;
- changing status to completed through generic update returns a stable
  `HANDOFF_CONFIRMATION_REQUIRED` error;
- Kanban and forms call the completion command when the destination status is
  completed.

Reopening uses a dedicated service transition, even if the existing status
endpoint remains the public transport, so confirmation reset cannot be
forgotten.

### Task responses and filters

Task responses include:

- `handoffRequired`
- `handoffStatus`
- `handoffOwner`
- `handoffReadyAt`
- `handoffConfirmedBy`
- `handoffConfirmedAt`

Task filtering gains a handoff-state filter. My Tasks and dashboard queries
match all current assignment rows, including self-assignment, and do not rely
on creator identity as a substitute for assignment.

### Timeline reads

Add dedicated timeline reads instead of extending the capped task-list
response:

- `GET /api/v1/timeline` for authorized organization or department scope;
- `GET /api/v1/projects/:projectId/timeline` for a project.

Both accept a visible date range, zoom-independent filters, and a cursor. They
return:

- tasks intersecting the requested range;
- unscheduled tasks separately;
- complete dependencies needed for returned task context;
- project, department, assignee, permission, and status metadata;
- continuation metadata when a large result is windowed;
- critical-path metadata when requested.

The frontend may virtualize and request adjacent ranges, but it never silently
stops at 100 tasks.

### Schedule and dependency commands

A focused schedule command updates task dates and accepts the task's expected
`updated_at` value for conflict detection. It validates:

- actor permission;
- tenant and department scope;
- `start_date <= due_date`;
- supported date precision;
- latest task version.

Dependency create, update, and delete commands support:

- finish-to-start;
- start-to-start;
- finish-to-finish;
- start-to-finish;
- integer lag days.

Each command writes `tenant_id`, rejects self-dependency and cross-tenant
links, and performs cycle detection over the affected dependency graph before
commit.

## User Experience

### Completion dialog

Every interactive attempt to complete a handoff-required task opens an
accessible confirmation dialog:

> Has the finished work been shared with the intended recipient?

Primary action: `Yes, handoff completed`
Secondary action: `Not yet`

The dialog identifies the task owner so the user knows who the intended
recipient is. It does not request a file, link, email address, or proof.

`Yes` closes the dialog only after the server confirms both handoff and task
completion. `Not yet` closes after the server confirms the ready state and
shows where the task can be found.

### Ready-for-handoff visibility

The authenticated dashboard includes a clickable `Ready for handoff` card.
Opening it shows task title, project, assignees, task owner, due date, and how
long it has been waiting.

My Tasks includes a persistent `Ready for handoff` section for work assigned
to the viewer. The task owner sees an `Awaiting handoff` indicator for work
they created or assigned. Task detail shows the current state and activity
history.

The reminder is persistent application UI plus an in-app notification when the
task enters the ready state. It does not send email or repeatedly create
notification spam. Existing scheduled email alerts must not treat this
feature as permission to transmit a deliverable.

### Actionable dashboard totals

Task summary cards are interactive. Opening a card displays the exact tasks
represented by its count using the same normalized filter as the count query.
This applies to assigned, due, overdue, completed, and ready-for-handoff
totals. Empty results show an explanatory state instead of a non-actionable
zero.

Dashboard and My Tasks invalidation occurs after creation, assignment,
unassignment, status transition, handoff transition, date change, and
deletion. Self-assigned work must appear immediately and remain visible after
refresh.

## Gantt Experience

### Placement and shared components

The Dashboard receives an organization/department Timeline view. Each project
receives a Timeline tab. Both use the same focused components and data model:

- timeline toolbar and filters;
- virtualized task rows;
- time-grid header;
- task bars and resize handles;
- dependency layer;
- unscheduled-task panel;
- accessible table fallback.

Shared components ensure project and dashboard timelines do not develop
different scheduling rules.

### Timeline controls

Both views provide:

- day, week, and month zoom;
- previous/next range navigation;
- Today action;
- filters for project, department, assignee, and status where applicable;
- task bars based on real start and due dates;
- status/progress treatment and overdue indicators;
- unscheduled tasks in a separate panel rather than fake dates;
- drag to shift a task while preserving duration;
- left and right resize handles;
- dependency creation and removal;
- all four supported dependency anchors and lag-day display;
- optional critical-path highlighting;
- milestones represented by same-day start and due dates.

Hierarchy may visually indent parent and subtask rows where current task data
provides the relationship. Resource leveling and automatic schedule
optimization are not part of this release.

### Editing and persistence

Dragging or resizing updates the interface optimistically. The client sends
the focused schedule command and rolls the bar back if the server rejects the
change. A clear message distinguishes permission, stale-version, invalid-date,
and network failures.

Dependency arrows update only after local graph validation and are finalized
after server confirmation. A rejected dependency returns to its previous
state.

Keyboard users can focus a task row and edit dates through accessible controls
without dragging. Touch-sized handles are provided on narrow screens; the
timeline remains horizontally scrollable instead of compressing dates into
unusable bars.

### Role behavior

- Tenant administrators see and manage the organization scope allowed by
  existing RBAC.
- Department heads manage timeline tasks and dependencies in their department.
- Managers manage the tasks already permitted by department rules.
- Employees can view authorized timeline data and edit only tasks they already
  have permission to manage.

The server returns per-task capabilities for rendering controls, but backend
authorization remains authoritative.

## Error Handling and Concurrency

- A failed handoff save leaves the task incomplete.
- A repeated completion command is idempotent.
- A stale task or schedule write returns `STALE_TASK` and current server data.
- An invalid date range returns `INVALID_DATE_RANGE`.
- A circular dependency returns `DEPENDENCY_CYCLE` without partial writes.
- A missing confirmation returns `HANDOFF_CONFIRMATION_REQUIRED`.
- Unauthorized actions return `FORBIDDEN` without exposing out-of-scope task
  details.
- Schedule and dependency writes use transactions.
- Optimistic UI changes always retain a rollback snapshot.
- Loading failures preserve the selected range and filters and offer retry.
- Partial bulk failures identify unsuccessful tasks and never inflate
  completed counts.

## Security

- Tenant identity comes from authenticated request context.
- Every handoff, schedule, and dependency operation verifies task and related
  records belong to the same tenant.
- Department and task-level permissions run in the service layer.
- Supabase RLS policies cover added columns and any supporting database
  objects.
- Confirmation actor and owner IDs cannot be supplied as trusted client
  identity.
- Timeline reads cannot expose hidden projects, departments, users, or tasks.
- No service-role secret or database credential is exposed to the frontend.
- This feature stores no deliverable content and introduces no public file
  access.

## Migration and Existing Data

The release uses forward-only migrations.

1. Add handoff fields, consistency checks, foreign keys, and tenant-first
   indexes.
2. Backfill existing non-completed tasks as handoff-required and `pending`.
3. Backfill existing completed tasks as `not_required` so historical work is
   not falsely presented as newly confirmed.
4. Set the creator as handoff owner where a valid creator exists.
5. Repair dependency tenant values and constraints where necessary.
6. Add dependency type, lag, and graph-supporting indexes only when absent.
7. Validate date and dependency data before enabling stricter constraints.

The migration does not modify task descriptions, files, attachments,
comments, or existing completed timestamps.

## Testing

### Backend

- create with handoff required and disabled;
- owner resolution on creation, assignment, reassignment, bulk assignment, and
  self-assignment;
- confirmed completion is atomic;
- not-yet outcome produces ready state without completion;
- generic updates, creation-as-completed, Kanban-equivalent requests, and bulk
  operations cannot bypass confirmation;
- reopening resets current confirmation while preserving activity;
- repeated commands are idempotent;
- employee, manager, department-head, and administrator permissions;
- cross-tenant task and dependency isolation;
- date ordering and stale-update rejection;
- every dependency type and lag;
- cycle, self-link, and cross-tenant dependency rejection;
- timeline range intersection, filters, cursors, unscheduled rows, and critical
  path;
- dashboard counts and detail lists use identical filters;
- self-assigned tasks appear in My Tasks.

### Frontend

- confirmation dialog appears from task detail, form, Kanban, and bulk
  completion;
- both outcomes display and invalidate the correct task queries;
- handoff-disabled tasks complete without the dialog;
- dashboard cards open matching task lists;
- ready tasks appear for assignee and owner;
- Gantt route/tab loading, zoom, Today, filters, and unscheduled panel;
- optimistic drag and resize success and rollback;
- dependency creation, removal, graph error, and permission states;
- desktop keyboard and narrow-screen interactions;
- loading, empty, stale-data, and network-error states.

### Production acceptance

1. Create and self-assign a handoff-required task.
2. Confirm it appears in My Tasks and the dashboard task list.
3. Attempt completion with `Not yet`; confirm it remains incomplete and appears
   under Ready for handoff for the assignee and owner.
4. Confirm handoff; verify completed status, confirmer, time, activity, and
   dashboard counts.
5. Reopen and verify a new confirmation is required.
6. Create a handoff-disabled internal task and verify normal completion.
7. Open Dashboard Timeline and Project Timeline with more than one page of
   tasks.
8. Drag, resize, filter, and create each dependency type as an authorized
   manager.
9. Verify an employee cannot edit an unauthorized task.
10. Verify circular dependency and invalid-date rollback behavior.
11. Check Supabase advisors, Railway health/readiness and logs, Vercel
    deployment health, browser console, and API failures.

## Deployment and Monitoring

Release from one clean, reviewed Git commit in compatibility order:

1. Apply and verify Supabase migrations, policies, constraints, indexes, and
   advisors.
2. Deploy Railway backend, run any Knex migration synchronization, and verify
   health, readiness, CORS, authentication, permissions, database connectivity,
   and logs.
3. Deploy the Vercel frontend against the verified Railway API.
4. Run the production acceptance story with the logged-in account.

Additive schema changes deploy before code that reads them. Backend behavior
remains compatible with the old frontend until the new frontend is live.
Rollback may restore the previous frontend and backend while leaving additive
database columns in place. No rollback drops production data.

Monitoring focuses on failed completion commands, authorization failures,
dependency-cycle errors, timeline latency, migration errors, Railway health,
and Vercel deployment status.

## Non-Goals

- Uploading or storing final deliverables for handoff.
- Sending deliverables, links, or emails from OpenWork.
- Recipient approval, signatures, or proof-of-delivery workflows.
- Repeated email reminders.
- Automatic resource leveling or schedule optimization.
- Converting the existing REST application into an MCP server.
- Producing a misleading ChatGPT App submission package. ChatGPT App support
  requires a separately designed MCP surface, tool annotations, structured
  outputs, widgets, and submission metadata.

## Success Criteria

- No handoff-required task can become completed without confirmation.
- A not-yet handoff remains visibly actionable until confirmed.
- Self-assigned tasks appear consistently in My Tasks and dashboard details.
- Every displayed dashboard count can reveal the exact underlying tasks.
- Project and dashboard Gantt views persist authorized date and dependency
  edits and handle more than 100 tasks without silent omission.
- Unauthorized or invalid Gantt operations leave production data unchanged.
- No deliverable content is uploaded, stored, or transmitted by this feature.
- Supabase, Railway, Vercel, automated tests, and browser acceptance checks are
  healthy after release.
