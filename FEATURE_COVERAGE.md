# Feature coverage

Status checked against the supplied Wrike research report on 2026-07-27.
“Supported” means the repository has a usable end-to-end implementation.
“Beta” means an API, schema, or basic UI exists but the complete production
workflow still needs work.

## Supported core

| Capability                         | Status                | Notes                                                                                                                                    |
| ---------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant authentication              | Supported             | Local email/password login, rotating hashed refresh tokens, forced password changes, logout, and disabled-by-default registration        |
| Tenant isolation                   | Supported             | All 32 public tables use forced RLS; authenticated requests use one transaction-scoped connection and the non-bypass `openwork_app` role |
| Workspaces, folders, projects      | Supported             | Tenant-scoped CRUD and hierarchy                                                                                                         |
| Tasks and subtasks                 | Supported             | CRUD, assignment, priority, dates, status, filters, bulk updates, parent tasks, and dependencies                                         |
| Table and Kanban views             | Supported             | Browser UI backed by the task API                                                                                                        |
| Calendar and basic Gantt           | Supported             | Task date visualization; not external calendar sync or critical-path planning                                                            |
| Task comments                      | Supported             | Tenant-scoped list/create endpoints and UI                                                                                               |
| Search                             | Supported             | PostgreSQL full-text search across tasks and projects                                                                                    |
| Time logs and timesheets           | Supported             | Basic entry and reporting flows                                                                                                          |
| Work schedules, time off, holidays | Supported             | Basic API and administration UI                                                                                                          |
| Private file storage               | Supported API         | Supabase Storage upload/delete and short-lived signed downloads; a full files browser is not included                                    |
| Roles and permissions              | Supported             | Fixed application roles and permission checks; not enterprise custom roles                                                               |
| Department task dashboard          | Supported             | Workspace-backed departments, scoped Head/Manager/Employee access, global visibility gate, four-status lifecycle, and audit events        |
| Deadline and priority alerts       | Supported             | Configurable scheduler, SMTP delivery, in-app events, retry, and database-backed deduplication                                             |
| Department reports                 | Supported             | Server-authorized filters and downloadable PDF/XLSX with status, overdue, completion-time, and per-user metrics                           |
| Public request forms               | Supported with limits | Basic intake flow with global throttling; CAPTCHA and advanced abuse controls are not included                                           |

## Beta or API-only

| Capability                          | Status                | Remaining production work                                                                     |
| ----------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Custom fields, item types, statuses | Beta                  | Apply definitions consistently in every task create/edit/view flow                            |
| Blueprints/templates                | Beta                  | Broader UI coverage and acceptance tests                                                      |
| Approvals                           | API-only              | End-user approval UI, reminders, and escalation                                               |
| Notifications                       | Beta                  | Department task alerts are durable; a full notification preferences UI and digest controls remain |
| Email                               | Beta                  | Department alerts are wired; bounce handling and verified sender DNS remain deployment concerns |
| Webhooks                            | Service only          | Event producers, durable outbox, retry policy, idempotency, and delivery logs                 |
| Automation                          | Configuration only    | Condition evaluation and actions are not production-functional                                |
| File versions/annotations           | API-only              | Add-version flow, proofing viewer, and annotation UI                                          |
| Reports, dashboards, portfolio      | Mixed                 | Department reports are server-generated; generic portfolio analytics remain dormant           |
| Activity log                        | Schema/API foundation | Complete mutation event capture and UI are not wired                                          |
| Copilot                             | Optional prototype    | Requires provider configuration, usage limits, evaluation, and cost controls                  |

## Not implemented

- Real-time collaborative editing, presence, and WebSocket updates
- `@mention` parsing and mention-triggered notifications
- Recurring-task scheduler, recycle bin/restore, milestones, and saved views
- Google/Outlook calendar sync and email-to-task
- Slack, Teams, Zapier, cloud-drive, Adobe, or other third-party integrations
- SSO/SAML, SCIM, MFA, IP policies, enterprise audit/access reports, and
  configurable custom roles
- Resource booking, advanced workload optimization, budgeting, invoicing,
  critical path, BI/data warehouse, and enterprise analytics
- CSV/MS Project import/export and a user-facing migration tool
- Native mobile/desktop applications, browser extensions, and whiteboards

## Distribution rule

Market the supported core only. Keep beta capabilities visibly labeled and do
not claim feature parity with Wrike. Promote a beta capability only after it has
an end-to-end acceptance test and operational monitoring.
