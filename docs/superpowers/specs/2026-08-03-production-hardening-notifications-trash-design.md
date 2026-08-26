# Production Hardening, Notifications, and Recoverable Task Deletion

Date: 2026-08-03
Status: Approved design
Target: OpenWork Hub deployment for a 20-person team

## 1. Purpose

Prepare the current application for dependable daily use by a 20-person team without applying the supplied upgrade blueprint verbatim. The implementation will preserve the repository's current multi-assignee, tenant-isolation, department-access, notification, and migration architecture while closing identified production risks.

The rollout covers:

- database migration connection safety;
- inactive-user and session security;
- action-required email notifications through Brevo SMTP;
- recoverable task deletion with a 30-day Trash window;
- a permission-scoped activity feed;
- targeted, measured performance improvements;
- verification and deployment controls.

## 2. Existing System Constraints

The design is based on the current repository rather than the stale assumptions in the external blueprint.

- `task_assignees` is the canonical multi-assignee table recreated by migration 014 and is used by current task queries and writes. It must not be removed.
- Existing migrations run through 022 and include two historical migrations numbered 008. A blueprint-provided replacement migration must not be inserted into that history.
- Tenant isolation is already enforced through the tenant context interceptor and PostgreSQL row-level security. New reads and writes must continue through tenant-scoped database access unless a reviewed system-level operation explicitly requires the root connection.
- Department access is represented by `department_heads`, `tasks.department_id`, and `DepartmentAccessService`. No global `dept_admin` permission bonus will be introduced.
- The frontend environment variable is `VITE_API_URL`.
- The application already has Nodemailer SMTP support, in-app notifications, an email service, scheduled deadline/priority alerts, activity writes, lazy routes, caching, and query tuning. New work extends these facilities rather than replacing them.

## 3. Rejected Approaches

### 3.1 Apply the external blueprint verbatim

Rejected because it would remove a live multi-assignee table, introduce migration numbering and index conflicts, and implement an RBAC model that does not match the application.

### 3.2 Ship only SMTP configuration

Rejected as the overall rollout strategy. It is fast, but leaves known authentication, migration, and deletion-recovery risks in a system intended to become the team's primary work tool.

### 3.3 Add a queueing platform before launch

Rejected for the 20-person launch. The current synchronous event abstraction and scheduled worker are sufficient if outbound email is isolated from user-facing writes and failures are persisted for retry. Redis/BullMQ remains a later scaling option, not a launch dependency.

## 4. Recommended Staged Architecture

### Phase 1: Production Release Blockers

#### 4.1 Migration and runtime database URLs

The runtime application will continue to use `DATABASE_URL`, normally the pooled Supabase connection suitable for the Railway process. Migrations will use `MIGRATE_DATABASE_URL`, the direct database connection.

The migration command must not silently prefer the pooled URL when a direct migration URL is configured. Railway startup will validate both variables and run migrations using the direct connection before starting the API. Local development may retain discrete `DB_*` variables as an explicit fallback.

Failure behavior:

- production startup stops before launching the API if required database configuration is absent;
- migration errors stop deployment;
- secrets and complete connection strings are never written to logs;
- the existing schema is not modified by ad hoc SQL outside versioned migrations.

#### 4.2 Authentication and session invalidation

Login must reject users whose global user record is inactive or soft-deleted. Refresh must validate all of the following before rotating a token:

- the session exists and is unexpired;
- the tenant membership is active;
- the global user is active and not deleted;
- the membership, session, and user identifiers agree.

When an administrator disables a tenant membership, all sessions for that membership are invalidated in the same transaction. Existing short-lived access tokens may remain valid only until their normal expiration; all subsequent refresh attempts fail. Global user deactivation, if exposed through administration, invalidates every session for that user.

Auth failures continue to use non-enumerating error messages where appropriate.

#### 4.3 Startup validation and operational checks

Production startup validates critical configuration without printing secret values:

- JWT secret and production auth settings;
- `DATABASE_URL` and `MIGRATE_DATABASE_URL`;
- public application URL and CORS origins;
- SMTP completeness when email is enabled;
- public-registration policy.

Health checks distinguish process health from database readiness. Railway deployment documentation will include a preflight checklist, migration outcome check, API readiness check, and rollback procedure.

### Phase 2: Brevo Action-Required Notifications

#### 4.4 Provider and configuration

Brevo is used through the existing Nodemailer SMTP transport. No provider-specific SDK is required.

Expected production variables:

- `SMTP_HOST=smtp-relay.brevo.com`;
- `SMTP_PORT=587`;
- `SMTP_USER=<Brevo SMTP login>`;
- `SMTP_PASS=<Brevo SMTP key>`;
- `SMTP_SECURE=false` for STARTTLS on port 587;
- `EMAIL_FROM=<verified sender address>`;
- `APP_PUBLIC_URL=<frontend URL>`.

Credentials are configured only in Railway's secret environment. They are represented by placeholders in documentation and are never committed.

Because DNS access is unavailable, launch uses Brevo sender-address verification. Domain authentication remains a later deliverability improvement when DNS control becomes available.

#### 4.5 Notification policy

Email is limited to action-required events:

- a user is newly assigned to a task;
- a relevant comment or explicit mention requires the user's attention;
- an approval request is assigned to a reviewer;
- an assigned task approaches its configured deadline or becomes overdue.

The following do not generate email by default:

- ordinary status or priority edits;
- edits made by the eventual recipient;
- duplicate assignment events;
- repeated scheduler runs for the same alert threshold;
- activity-feed-only informational events.

Every supported email also has an in-app notification. In-app notification creation is authoritative and must not depend on successful email delivery.

#### 4.6 Recipients and multi-assignee behavior

Recipients are resolved from the canonical `task_assignees` relation, with the legacy primary `tasks.assignee_id` included only through a deduplicated compatibility path. The actor is excluded. Inactive/deleted users and inactive tenant memberships are excluded.

Comment emails go only to explicitly mentioned users and assigned users who are not the author. Approval emails go to pending reviewers. Deadline emails go to current assignees.

#### 4.7 Reliability model

User-facing task and comment writes must not wait for SMTP or fail because SMTP is unavailable. The business transaction atomically creates the in-app notification and an email outbox record. A scheduled processor performs delivery only after that transaction commits. This transactional-outbox boundary prevents both premature sends and the loss of an email job during a process crash.

Each delivery record contains tenant, recipient, event type, entity, deduplication key, attempt count, next-attempt time, terminal status, timestamps, and a sanitized failure category. It does not store SMTP credentials. Message bodies may be regenerated from entity data rather than persisted when practical.

Retries use bounded exponential backoff. Permanent address/provider failures stop retrying; transient network and rate-limit failures retry. The processor claims work atomically to prevent duplicate sends when multiple Railway instances run.

A focused `email_deliveries` outbox table will be added through the next unique migration number. Existing `notification_log` rows retain their current scheduler-rule deduplication purpose and are not overloaded with provider-delivery state.

### Phase 3: Recoverable Task Deletion

#### 4.8 Soft-delete behavior

Deleting a task sets `deleted_at` and `deleted_by` in one transaction and records an activity entry. It does not delete `task_assignees`, comments, dependencies, locations, or other restorable task relationships.

Normal task APIs continue to exclude deleted tasks. Notification schedulers and searches also exclude them.

#### 4.9 Trash permissions

- Tenant administrators can list, inspect, and restore any deleted task in the tenant.
- Regular users can list and restore only tasks they personally deleted, subject to current visibility rules.
- Permanent purge is tenant-admin-only.
- A task cannot be purged before it has been deleted for 30 days.

Department access remains applicable to non-admin Trash reads and restores. A user cannot gain access to a task merely by deleting or restoring it.

#### 4.10 Trash API and UI

The backend exposes dedicated Trash operations rather than overloading ordinary task listing:

- paginated Trash listing;
- deleted-task detail;
- restore;
- eligible permanent purge.

Transport DTOs follow the application's camelCase API convention even when database columns use snake_case.

The frontend adds a lazy-loaded Trash page with deletion date, deleting user, project/location context, restore controls, and admin-only purge controls. Destructive operations require explicit confirmation. Restores invalidate relevant task, dashboard, search, and Trash queries.

#### 4.11 Restore and purge rules

Restore clears deletion metadata and verifies that referenced tenant entities still exist. If an optional project/folder location no longer exists, the task is restored without an invalid location and the response reports that adjustment.

Purge performs an explicit, transactionally ordered delete of dependent rows according to foreign-key behavior. The purge target is resolved by tenant and task ID before deletion. Purge activity is recorded with minimal immutable metadata that does not retain confidential task content.

### Phase 4: Activity Feed and Targeted Performance Work

#### 4.12 Activity feed

Activity reads are tenant-scoped and visibility-filtered. Tenant administrators can inspect all tenant activity; other users see only activity for entities they can currently access.

The first release provides paginated, newest-first activity with filters for actor, action, entity type, and date. It does not expose secrets or raw internal metadata. The UI resolves human-readable actor and entity labels and handles deleted entities safely.

#### 4.13 Performance scope

Only evidence-backed optimizations are included:

- debounce global server-backed search;
- prefetch likely task-detail navigation targets on intentional hover/focus;
- use selective skeletons where route loading currently presents a blank transition;
- define a task-list response shape before removing fields from list queries;
- profile long task lists before deciding whether virtualization is warranted.

Existing lazy routes, manual chunks, React Query settings, optimistic task updates, compression, cache, and database indexes are retained. Duplicate indexes and speculative infrastructure are not added.

## 5. Data and Security Rules

- All tenant data access uses tenant-scoped queries and existing RLS context.
- Root database access is limited to reviewed background/system operations that cannot run under a request context; every root query includes explicit tenant constraints.
- New migrations are additive, idempotent where practical, and use the next unique migration number.
- No migration drops `task_assignees`.
- Sensitive configuration and provider responses are redacted from logs.
- Email HTML continues to escape user-generated content and permits only safe HTTP(S) links.
- Notification recipient resolution always checks global user and tenant-membership state.
- Purge authorization and retention checks are enforced server-side, not only in the UI.

## 6. Testing Strategy

### Unit and integration coverage

- login and refresh rejection for inactive/deleted users;
- session invalidation when membership is removed;
- migration URL selection and startup validation;
- recipient resolution across primary and additional assignees;
- actor exclusion and duplicate suppression;
- SMTP success, transient failure, permanent failure, and retry exhaustion;
- scheduler atomic claims under concurrent execution;
- soft delete preserving all restorable relationships;
- Trash list, restore, and purge permissions for admin and regular users;
- 30-day purge boundary;
- tenant and department isolation for Trash and activity endpoints;
- camelCase response contracts and frontend cache invalidation.

### Release verification

- repository typecheck, unit tests, and production build;
- migration execution against an isolated PostgreSQL database;
- production dependency install and Railway start-command validation;
- authenticated smoke tests for login, task CRUD, delete/restore, notifications, and activity;
- one Brevo test message to an approved recipient;
- failed-SMTP smoke test proving task updates still succeed and delivery is retryable;
- post-deployment health/readiness and migration-history checks.

## 7. Rollout and Rollback

Each phase is implemented and verified independently. Phase 1 deploys before feature work. Phase 2 is guarded by SMTP configuration and an email-enabled switch so email delivery can be disabled without disabling in-app notifications. Phase 3 introduces additive schema before UI exposure. Phase 4 ships only after baseline performance measurements.

Rollback principles:

- application rollback never reverses a safe additive migration during an incident;
- email can be disabled through configuration while preserving queued records for later retry;
- Trash UI can be hidden while soft-deleted data remains recoverable;
- no phase relies on destructive schema rollback for normal recovery.

## 8. Operational Acceptance Criteria

The deployment is ready for team use when:

- Railway builds and starts from a clean production install;
- migrations use the direct Supabase connection and complete before API startup;
- inactive users and removed memberships cannot obtain refreshed sessions;
- task assignments, relevant comments/mentions, approvals, and deadline alerts create in-app notifications and queued email delivery;
- Brevo delivery failure cannot roll back a user task operation;
- duplicate scheduler execution does not duplicate email;
- deleted tasks retain assignees and can be restored under the approved permission policy;
- permanent purge is impossible before 30 days and unavailable to non-admins;
- tenant and department isolation tests pass;
- production build, tests, smoke checks, and rollback documentation pass review.

## 9. Deferred Work

- Redis/BullMQ unless measured delivery volume or multi-instance throughput requires it;
- virtualization until task-list profiling demonstrates a need;
- globally privileged `dept_admin` behavior;
- daily or weekly email digests;
- provider-specific email SDK adoption;
- automatic purging without a separate operational review;
- domain-authenticated Resend or Brevo sending until DNS access is available.
