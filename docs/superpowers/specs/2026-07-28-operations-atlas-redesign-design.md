# OpenWork Hub Operations Atlas Redesign

**Status:** Approved in interactive design review
**Date:** 2026-07-28
**Scope:** Full web application redesign, role-aware dashboards, onboarding, and live 30-day analytics

## 1. Purpose

OpenWork Hub is a department-based task monitoring system for four equally important audiences:

- Employees managing assigned work
- Managers coordinating employees and their own work
- Department heads monitoring managers, employees, roles, and department delivery
- Administrators operating the organization, departments, users, and access

The current interface exposes working features but feels like a prototype. It uses a generic slate-and-indigo visual system, weak information hierarchy, large empty regions, table-heavy pages, passive empty states, and no explanation of how departments, folders, projects, tasks, roles, or reports relate.

The redesign must make the system understandable on first use and efficient after repeated use. It must not weaken existing RBAC, task visibility, report scope, or tenant isolation.

## 2. Approved Decisions

- Treat all four roles as equally important.
- Use the **Operations Atlas** visual direction.
- Keep the product name **OpenWork Hub**.
- Redesign the whole app: login, password setup, shell, dashboard, My Work, departments, projects, tasks, reports, and admin.
- Optimize for desktop while keeping every workflow fully usable on mobile.
- Show live current data plus 30-day trends.
- Auto-start a role-aware tour once after first login.
- Keep a permanent Getting Started checklist until completed or dismissed.
- Allow tour replay from Help.
- Store onboarding state server-side so it follows the user across devices.
- Use real production data only. Never render fake metrics or decorative charts.

## 3. Goals

1. A new user can explain the hierarchy and find their main workflow after the first guided session.
2. Each role receives a useful dashboard built from its permitted data.
3. Important work is visible without scanning long tables.
4. Every empty, loading, partial-error, and forbidden state gives a clear next action.
5. Navigation, labels, status treatments, filters, and actions remain consistent across pages.
6. Graphs remain understandable with keyboard navigation, screen readers, reduced motion, and narrow screens.
7. Existing production functionality remains available throughout the redesign.

## 4. Non-Goals

- Replacing JWT authentication or existing RBAC
- Activating dormant Gantt, automation, portfolio, timesheet, or webhook features
- Building a general business-intelligence product
- Adding user-customizable dashboard builders
- Generating analytics from fabricated seed values
- Turning the repository into a ChatGPT App or MCP server
- Generating `chatgpt-app-submission.json`; the repository exposes no MCP tools

## 5. Visual Identity

### 5.1 Subject and job

The visual subject is an operational field briefing for department work. The primary page job is to answer:

> What needs attention now, what is moving, and where should I go next?

The interface should feel calm, trustworthy, and human without becoming playful or corporate-cold.

### 5.2 Color tokens

| Token | Hex | Use |
|---|---:|---|
| Canopy | `#123C3A` | Navigation, primary actions, tour surfaces |
| Current | `#25766F` | Healthy progress, links, active data |
| Field Note | `#F2CB67` | Guidance, onboarding, selected learning state |
| Signal Coral | `#F27B55` | Overdue work, risk, destructive emphasis |
| Mist | `#DCE9E6` | Page framing, chart support, quiet surfaces |
| Paper | `#F8FAF8` | Main canvas |
| Ink | `#183432` | Primary text |

Status and priority colors must use one centralized semantic mapping. Existing custom status colors remain authoritative where configured.

### 5.3 Typography

- **Archivo:** page titles, major decisions, metric values
- **Source Sans 3:** navigation, body copy, forms, tables
- **IBM Plex Mono:** dates, percentages, chart labels, audit values

Fonts should ship locally through package assets rather than depend on a remote font request.

### 5.4 Shape, density, and motion

- Use 8–12 px radii for controls and working panels.
- Avoid excessive pill shapes; reserve pills for statuses, filters, and short state labels.
- Use compact working density with 8 px spacing increments.
- Animate one orchestrated dashboard reveal and guided-tour movement.
- Respect `prefers-reduced-motion`.
- Never animate live metric values in a way that delays reading.

### 5.5 Signature element

The memorable element is the **Department Pulse rail**: one horizontal operational summary that combines health, active work, completed work, and attention count. It replaces a generic row of unrelated statistic cards.

### 5.6 Uniqueness review

The design avoids common generated-dashboard defaults:

- No purple gradient hero
- No cream-and-terracotta editorial theme
- No black-and-neon interface
- No decorative glassmorphism
- No grid of identical KPI cards as the main idea

Field Note yellow is the deliberate aesthetic risk. It behaves like a physical annotation marker and appears only for guidance, onboarding, and selected learning states.

## 6. Application Shell and Information Architecture

### 6.1 Stable navigation

Navigation vocabulary stays consistent for every role. Unauthorized items are omitted.

```text
Overview
  Dashboard
  My Work

Workspace
  Departments
  Reports

Manage
  Administration

Help
  System map
  Replay guided tour
  Getting started
```

### 6.2 Desktop layout

```text
┌──────────────────┬────────────────────────────────────────────────────┐
│ OpenWork Hub     │ Search                 Help  Create task  Account │
│                  ├────────────────────────────────────────────────────┤
│ Dashboard        │ Department briefing                               │
│ My Work          │ Department Pulse rail                             │
│                  │                                                    │
│ Departments      │ 30-day movement      Attention queue              │
│ Reports          │                                                    │
│                  │ Team capacity        Getting started              │
│ Administration   │                                                    │
│                  │ Role-specific work sections                        │
│ Active dept      │                                                    │
└──────────────────┴────────────────────────────────────────────────────┘
```

### 6.3 Mobile layout

- Sidebar becomes a sheet.
- Search becomes a dedicated screen or expandable field.
- Dashboard modules stack in priority order.
- Guided-tour popovers become bottom sheets.
- Data tables provide card/list alternatives where horizontal scrolling would hide primary actions.
- Create Task stays reachable as a labeled top action; it must not become an unexplained floating icon.

## 7. Role-Aware Dashboards

All dashboards share the shell, Department Pulse visual language, freshness timestamp, error behavior, and chart components. Content is server-scoped by role.

### 7.1 Employee

- My active tasks
- Due today, overdue, and upcoming counts
- Personal 30-day created/completed trend
- Status and priority distribution
- Due-soon work list
- Personal onboarding checklist
- No Create Task action

### 7.2 Manager

- Own active work
- Employee task load and capacity
- Unassigned work
- Overdue, blocked, and no-owner attention queue
- Team 30-day completion trend
- Employee grouping with drill-down
- Create Task action limited to self and permitted employees

### 7.3 Department head

- Own, manager, and employee work shown as separate lanes
- Department Pulse and 30-day trend
- Manager and employee capacity
- Risk and unassigned queue
- Role-management summary and recent role changes
- Combined and individual report shortcuts

### 7.4 Administrator

- Organization Pulse
- Department comparison
- Departments missing a head or setup step
- User and invitation status
- Cross-department risk summary
- Access and role-change activity
- Links to organization setup workflows

### 7.5 Metric rules

- "Overdue" means due date is before current date and task is not complete.
- "Completed in 30 days" uses completion timestamp, not update timestamp.
- "Created in 30 days" uses task creation timestamp.
- "On track" excludes overdue and blocked work.
- Capacity is a workload indicator based on open assigned tasks, not a claim about available working hours unless capacity settings exist.
- Every chart displays its period, scope, and last-generated timestamp.
- Aggregated values must match the drill-down rows available to the viewer.

## 8. Page System

### 8.1 Login and password setup

- Branded two-panel desktop layout and single-panel mobile layout
- Plain explanation of organization access
- Specific field and API error messages
- Password-change flow uses the same visual system
- Keyboard-first form behavior and visible focus

### 8.2 My Work

- Default urgency order: overdue, due soon, then no due date
- Today, Upcoming, and All Work segments
- List and board views
- Search and filters that preserve URL state
- Empty state explains that assigned work appears here
- Employees never see unavailable create controls

### 8.3 Department

- Overview, Work, People, and Projects tabs
- Folder tree and projects presented as one workspace
- General folder explained as the default home for direct-created tasks
- Empty departments provide a role-appropriate action
- Project cards show progress, due-soon count, and owner information

### 8.4 Task detail

- Clear title, status, priority, dates, location, and assignee summary
- Role-aware editable controls
- Activity and comments grouped into a readable timeline
- Mobile uses a single-column edit flow
- Success and error feedback names the action that happened

### 8.5 Reports

- Scope summary always visible
- 30-day trend, status distribution, on-track rate, assignee summary, and current task rows
- Export PDF/XLSX from the same active filters and scope
- Empty reports explain which filters produced no rows
- Export buttons remain disabled when the exact current report has no rows

### 8.6 Administration

- Setup Health summary instead of a wall of forms
- Separate People, Departments, Roles, and Audit areas
- Guided add-user and department setup flows
- Confirmation for role changes
- Audit activity explains actor, target, old role, new role, and time

## 9. Onboarding and Help

### 9.1 First-login sequence

The tour starts after authentication and required password change:

1. Welcome and explain the user's current role and department.
2. Highlight Dashboard and explain Department Pulse.
3. Highlight Create Task only when role permits it.
4. Explain Departments and the General folder.
5. Explain My Work and Reports.

The user may skip, resume, or complete the tour. The interface must never trap the user behind onboarding.

### 9.2 Getting Started checklist

Checklist items correspond to real behavior:

- Visit dashboard
- Open a department
- View My Work
- Create first task, only for permitted roles
- Open a report
- Visit Administration setup, only for administrators

The checklist remains on Dashboard until completed or explicitly dismissed.

### 9.3 System map

Help includes a permanent infographic:

```text
Organization
  └─ Department
       ├─ People and scoped roles
       ├─ General folder
       └─ Folder / Project
            └─ Task
                 ├─ Assignees
                 ├─ Status and priority
                 ├─ Due dates
                 └─ Comments and activity
```

Role notes explain who can create, assign, change roles, and export each scope.

### 9.4 Persistence

Add a tenant-scoped `user_onboarding_progress` table:

- `tenant_id`
- `user_id`
- `tour_version`
- `tour_status`: `not_started`, `in_progress`, `completed`, `dismissed`
- `current_step`
- `completed_steps` JSONB
- `checklist_dismissed_at`
- `created_at`
- `updated_at`

The unique key is `(tenant_id, user_id)`. RLS and service queries must follow existing tenant-isolation patterns.

Endpoints:

- `GET /api/v1/users/me/onboarding`
- `PATCH /api/v1/users/me/onboarding`

Tour versions allow a short new-feature tour after major navigation changes without replaying the original onboarding.

## 10. Analytics Architecture

### 10.1 Backend

Add a dashboard overview endpoint:

`GET /api/v1/dashboard/overview?departmentId=<id>&days=30`

Response includes:

- Viewer role and effective scope
- Generated timestamp and requested window
- Current totals
- Previous-window comparisons
- Daily created and completed counts
- Status and priority distribution
- Capacity by permitted assignee
- Attention items
- Admin-only department comparison where allowed

`days` is restricted to supported values. Version 1 uses 30 days in the interface.

The endpoint must reuse `DepartmentAccessService` and existing task/report visibility rules. It must aggregate only rows the viewer may access. Admin organization views remain tenant-scoped.

### 10.2 Frontend

Use TanStack Query with a dashboard query-key factory. Keep dashboard overview, grouped tasks, and onboarding as separate queries so one failure does not blank the whole page.

Use Recharts for responsive SVG charts. Each graphical component must also expose:

- Plain-language summary
- Exact labels and values
- Accessible fallback table or list
- Empty and partial-data state

### 10.3 Data flow

```text
Authenticated user
  ├─ Auth/session supplies tenant role
  ├─ Workspaces supply department role
  ├─ Dashboard overview API applies server-side scope
  ├─ Grouped/My Tasks API supplies drill-down rows
  └─ Onboarding API supplies role-aware progress

Dashboard view adapter
  ├─ Selects employee/manager/head/admin composition
  ├─ Formats shared metric and chart models
  └─ Never expands server-provided scope
```

## 11. Frontend Component Boundaries

```text
AppShell
  ├─ PrimaryNavigation
  ├─ GlobalSearch
  ├─ CreateTaskAction
  ├─ HelpDrawer
  └─ AccountMenu

RoleDashboard
  ├─ DashboardBriefing
  ├─ DepartmentPulse
  ├─ WorkMovementChart
  ├─ AttentionQueue
  ├─ CapacityPanel
  ├─ GettingStarted
  └─ RoleWorkSections

OnboardingProvider
  ├─ WelcomeDialog
  ├─ GuidedTour
  ├─ TourPopover / MobileTourSheet
  └─ OnboardingProgressClient
```

Shared primitives include Button, IconButton, Field, Select, Card, StatusBadge, EmptyState, ErrorState, Skeleton, Drawer, Dialog, Tabs, Tooltip, DataTable, and ChartFrame.

Each component owns one behavior and receives typed data rather than reading unrelated global state.

## 12. Loading, Empty, Error, and Forbidden States

### Loading

- Preserve page geometry with skeletons.
- Keep navigation and available cached content interactive.
- Show freshness when stale cached metrics remain visible.

### Empty

- State what is absent.
- Explain why it may be absent.
- Show one permitted next action.
- Never show task-creation guidance to employees.

### Partial error

- A failed trend query shows a local Retry state.
- Current task rows and navigation remain usable.
- Export errors keep filters intact.
- Tour failure never blocks the underlying page.

### Forbidden

- Hide unavailable navigation and actions.
- If a stale direct URL becomes forbidden, show a clear access explanation and route back to a permitted page.
- Do not reveal names, counts, or scopes from unauthorized departments.

## 13. Accessibility

- Meet WCAG 2.2 AA contrast and interaction requirements.
- Preserve logical heading order and landmark structure.
- Provide visible focus for every interactive element.
- Support keyboard navigation in sidebar, dialogs, menus, tabs, charts, and tour.
- Trap and restore focus in dialogs and mobile sheets.
- Announce task creation, saves, errors, and tour step changes.
- Never encode status using color alone.
- Supply chart summaries and data tables.
- Respect zoom, text resizing, high contrast, and reduced motion.

## 14. Performance and Production Constraints

- Lazy-load role dashboard modules, reports, and admin pages.
- Load chart code only on pages that use charts.
- Use locally bundled fonts with limited weights.
- Keep dashboard API aggregation indexed by tenant, department, created date, completed date, status, due date, and assignee joins.
- Avoid per-member query loops.
- Preserve React Query cache invalidation after task writes.
- Do not add external paid services.
- Keep Vercel frontend, Railway backend, and Supabase Postgres deployment model.

## 15. Test Strategy

### Backend

- Dashboard scope tests for employee, manager, department head, and admin
- Cross-tenant and cross-department denial tests
- Current and previous 30-day aggregation boundary tests
- Overdue, completed, blocked, unassigned, and multi-assignee metric tests
- Onboarding persistence and tenant-isolation tests

### Frontend

- Role composition tests for all four dashboards
- Metric and chart adapter tests
- Loading, empty, partial-error, retry, and forbidden states
- Guided-tour target, skip, resume, replay, and version tests
- Checklist completion and dismissal tests
- Keyboard and focus-management tests
- Mobile navigation and tour-sheet tests
- Task mutation invalidation keeps dashboard/report data current

### Browser verification

- First-login journey for each role
- Create Task tour step for permitted roles only
- Department and General-folder explanation
- Report filters, charts, and exact export state
- Desktop and mobile layouts
- Reduced-motion behavior
- Production login, CORS, API health, and deployment smoke

## 16. Acceptance Criteria

- Every role sees a useful dashboard with no unauthorized controls or data.
- Dashboard live totals agree with permitted task rows.
- 30-day chart values agree with backend aggregates.
- Employee dashboard contains no Create Task action or creation tour step.
- Manager capacity excludes other managers and department heads unless policy explicitly permits them.
- Department-head dashboard separates manager and employee work.
- Admin dashboard compares only departments in the current tenant.
- First eligible login starts the correct tour once.
- Tour progress survives sign-out and another device.
- Help can replay the tour and open the system map.
- Empty departments explain General-folder behavior and next action.
- Reports render charts from current report data and export the exact active scope.
- All primary workflows work with keyboard and at mobile width.
- Full tests, typecheck, lint, production builds, and deployment health pass before release.

## 17. Implementation Decomposition

Implementation should proceed in bounded phases while targeting one coordinated visual result:

1. Design tokens, fonts, primitives, and application shell
2. Authentication and password-flow redesign
3. Dashboard analytics endpoint and backend tests
4. Shared dashboard components and four role compositions
5. Onboarding persistence, tour, checklist, and Help system map
6. My Work, department, project, task, reports, and admin page migration
7. Accessibility, responsive, browser, and visual verification
8. Independent review, main-branch merge, and production smoke

No phase may weaken existing RBAC or ship fake dashboard values.
