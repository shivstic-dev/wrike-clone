# Requirements Document: Wrike Full Implementation

## Introduction

This document specifies the complete implementation of all Wrike features into the wrike-clone project. The implementation is organized into 6 feature levels, progressing from atomic task-level features through enterprise-grade capabilities. This represents approximately 100+ distinct features across the full work management platform.

The wrike-clone project is a full-stack work management platform built with:
- **Backend:** NestJS + PostgreSQL (Supabase) + Redis + MinIO (S3) + Meilisearch
- **Frontend:** React + Vite + TypeScript
- **Infrastructure:** Vercel (frontend), Railway (backend), Supabase (database)
- **Architecture:** Multi-tenant with Row-Level Security (RLS)

Current implementation includes basic authentication, workspaces, tenants, tasks, projects, folders, comments, time tracking, approvals, automation, and notifications.

## Glossary

- **System**: The Wrike Clone platform (backend + frontend + database)
- **Backend**: The NestJS REST API server
- **Frontend**: The React single-page application
- **Database**: The PostgreSQL database with RLS policies
- **User**: An authenticated person using the platform
- **Tenant**: An organization/account in the multi-tenant system
- **Workspace**: Top-level container for projects within a tenant
- **Folder**: Hierarchical container for projects and sub-folders
- **Project**: Collection of related tasks
- **Task**: Individual work item with assignees, status, priority
- **Subtask**: Child task nested under a parent task
- **Custom_Field**: User-defined field attached to tasks/projects/folders
- **Automation_Rule**: Conditional if/then workflow automation
- **Blueprint**: Reusable template for projects/tasks
- **Approval_Chain**: Multi-stage approval workflow
- **Proof**: Annotated file review (proofing feature)
- **Request_Form**: Dynamic intake form for task creation
- **Dashboard**: Customizable widget-based analytics view
- **Workload_View**: Resource capacity planning visualization
- **Timesheet**: Aggregated time entry view for users/projects
- **Job_Role**: Skill-based role definition for resource planning
- **SSO**: Single Sign-On authentication via SAML
- **API**: REST API for external integrations
- **Webhook**: Event-driven HTTP callback to external systems
- **Integration**: Third-party service connection (Slack, Teams, etc.)
- **AI_Agent**: Automated intelligent task/workflow assistant
- **BI_Dashboard**: Business Intelligence analytics dashboard

## Requirements

---

## LEVEL 1: ATOMIC FEATURES (~25 features)

### Requirement 1.1: Task Management Core

**User Story:** As a user, I want to create and manage tasks with essential fields, so that I can track individual work items.

#### Acceptance Criteria

1. WHEN a user creates a task, THE System SHALL store the task with title, description, due date, assignee, status, and priority
2. THE System SHALL support up to 200 active tasks for free-tier tenants
3. THE System SHALL support unlimited tasks for paid-tier tenants
4. WHEN a task is updated, THE System SHALL record the change in the activity log
5. THE System SHALL validate that task titles are between 1 and 500 characters
6. WHEN a task is assigned, THE System SHALL notify the assignee

### Requirement 1.2: Subtask Hierarchy

**User Story:** As a user, I want to create subtasks under parent tasks, so that I can break down complex work.

#### Acceptance Criteria

1. WHEN a user creates a subtask, THE System SHALL link it to the parent task via parent_task_id
2. THE System SHALL allow unlimited nesting depth for subtasks
3. WHEN a parent task is deleted, THE System SHALL cascade delete all subtasks
4. THE System SHALL calculate parent task progress based on completed subtasks
5. WHEN all subtasks are completed, THE System SHALL mark the parent task as ready for completion

### Requirement 1.3: Comments and @Mentions

**User Story:** As a user, I want to comment on tasks and mention teammates, so that we can collaborate and communicate.

#### Acceptance Criteria

1. WHEN a user creates a comment, THE System SHALL attach it to the task with author, content, and timestamp
2. WHEN a comment contains @username, THE System SHALL notify the mentioned user
3. THE System SHALL support threaded replies via parent_comment_id
4. WHEN a comment is edited, THE System SHALL set is_edited flag to true
5. THE System SHALL allow users to delete their own comments
6. THE System SHALL support file attachments in comments via attachments array

### Requirement 1.4: File Attachments and Versioning

**User Story:** As a user, I want to attach files to tasks and maintain version history, so that I can track document evolution.

#### Acceptance Criteria

1. WHEN a user uploads a file, THE System SHALL store it with original name, mime type, size, and checksum
2. THE System SHALL enforce a maximum file size of 500 MB per file
3. WHEN a file with the same name is uploaded, THE System SHALL create a new version
4. THE System SHALL track version numbers incrementally starting from 1
5. THE System SHALL maintain storage quota limits per tenant plan
6. THE System SHALL support retrieval of any historical file version
7. FOR ALL uploaded files, THE System SHALL calculate and store a checksum for integrity verification

### Requirement 1.5: Real-Time Editing

**User Story:** As a user, I want to see changes made by other users in real-time, so that collaborative editing is seamless.

#### Acceptance Criteria

1. WHEN a user edits a task description, THE System SHALL broadcast the change via WebSocket to all connected users viewing that task
2. THE System SHALL use Socket.IO for real-time communication
3. WHEN a conflict occurs, THE System SHALL apply last-write-wins conflict resolution
4. THE System SHALL show active editors on a task to prevent edit conflicts
5. THE System SHALL synchronize changes within 500ms of the edit event

### Requirement 1.6: Filters and Search

**User Story:** As a user, I want to filter and search tasks by various criteria, so that I can find relevant work items quickly.

#### Acceptance Criteria

1. THE System SHALL support filtering tasks by status, priority, assignee, due date, and custom fields
2. THE System SHALL provide full-text search on task title and description using PostgreSQL GIN index
3. WHEN a user saves a filter, THE System SHALL store it as a reusable view (Team+ plans)
4. THE System SHALL return search results within 2 seconds for databases with up to 100,000 tasks
5. THE System SHALL support AND/OR boolean logic in compound filters
6. FOR ALL text search queries, THE System SHALL use the existing to_tsvector index on tasks

### Requirement 1.7: Bulk Actions

**User Story:** As a user, I want to apply actions to multiple tasks simultaneously, so that I can manage work efficiently.

#### Acceptance Criteria

1. THE System SHALL support bulk status updates for up to 100 tasks in a single operation
2. THE System SHALL support bulk assignment, deletion, and priority changes
3. WHEN a bulk action is performed, THE System SHALL log each change in the activity log
4. IF any task in a bulk operation fails validation, THE System SHALL skip that task and continue with others
5. THE System SHALL return a summary of successful and failed operations

### Requirement 1.8: Multiple View Types

**User Story:** As a user, I want to view tasks in different layouts (table, board, chart), so that I can visualize work in the most useful format.

#### Acceptance Criteria

1. THE System SHALL provide a table view showing tasks in a spreadsheet-like grid
2. THE System SHALL provide a Kanban board view with tasks grouped by status
3. THE System SHALL provide a chart view with simple infographics (Team+ plans)
4. WHEN a user drags a task between status columns in board view, THE System SHALL update the task status
5. THE System SHALL persist the user's preferred view per project
6. THE System SHALL render board view updates in real-time for all active users

### Requirement 1.9: Inbox Notifications

**User Story:** As a user, I want a centralized inbox of notifications, so that I don't miss important updates.

#### Acceptance Criteria

1. WHEN a user is @mentioned or assigned a task, THE System SHALL create a notification in their inbox
2. THE System SHALL mark notifications as read/unread
3. THE System SHALL allow users to filter notifications by type and priority
4. THE System SHALL automatically mark notifications as read after 30 days
5. THE System SHALL provide a notification count badge in the UI
6. THE System SHALL support push notifications to mobile devices (when mobile app is active)

### Requirement 1.10: Activity Stream

**User Story:** As a user, I want to see a live log of all workspace changes, so that I can stay informed about project activity.

#### Acceptance Criteria

1. THE System SHALL record all create, update, delete actions in the activity_logs table
2. THE System SHALL display activity filtered by project, folder, or workspace
3. THE System SHALL show actor name, action type, entity, and timestamp for each activity
4. THE System SHALL support pagination with 50 activities per page
5. WHEN an activity is recorded, THE System SHALL store a JSONB diff of changes

### Requirement 1.11: Recycle Bin

**User Story:** As a user, I want deleted items to be recoverable, so that accidental deletions don't result in data loss.

#### Acceptance Criteria

1. WHEN a user deletes a task, folder, or project, THE System SHALL soft-delete by setting deleted_at timestamp
2. THE System SHALL allow administrators to restore soft-deleted items within 30 days
3. WHEN 30 days have elapsed, THE System SHALL permanently delete the item
4. THE System SHALL cascade soft-deletes to child items (e.g., deleting a project soft-deletes its tasks)
5. THE System SHALL exclude soft-deleted items from all queries by default

### Requirement 1.12: Mobile and Desktop Apps

**User Story:** As a user, I want native applications for iOS, Android, Windows, and Mac, so that I can work from any device.

#### Acceptance Criteria

1. THE System SHALL provide a responsive web interface that works on mobile browsers
2. THE System SHALL expose REST APIs that support native mobile app development
3. THE System SHALL support offline-first mobile app functionality with sync when online
4. THE System SHALL provide push notifications for mobile apps via FCM/APNS
5. THE System SHALL maintain authentication sessions across desktop and mobile

### Requirement 1.13: Email Integration

**User Story:** As a user, I want to create and update tasks via email, so that I can work within my email workflow.

#### Acceptance Criteria

1. WHEN a user sends email to a project-specific address, THE System SHALL create a task with the email subject as title
2. THE System SHALL parse the email body as the task description
3. THE System SHALL attach email attachments to the created task
4. WHEN a user replies to a task notification email, THE System SHALL add the reply as a comment
5. THE System SHALL validate sender email matches a tenant user before creating tasks

### Requirement 1.14: Cloud Storage Integrations

**User Story:** As a user, I want to attach files from Google Drive, Dropbox, Box, and OneDrive, so that I can link existing files without duplicating storage.

#### Acceptance Criteria

1. THE System SHALL support OAuth2 authentication for Google Drive, Dropbox, Box, and OneDrive
2. WHEN a user attaches a cloud file, THE System SHALL store a reference link instead of downloading the file
3. THE System SHALL not count cloud-attached files against tenant storage quota
4. THE System SHALL display cloud file thumbnails and metadata
5. THE System SHALL validate user has access to the cloud file before attaching

### Requirement 1.15: Two-Factor Authentication

**User Story:** As a security-conscious user, I want to enable 2FA on my account, so that unauthorized access is prevented.

#### Acceptance Criteria

1. THE System SHALL support TOTP-based 2FA (compatible with Google Authenticator, Authy)
2. WHEN a user enables 2FA, THE System SHALL generate and display a QR code and backup codes
3. WHEN a user logs in with 2FA enabled, THE System SHALL require a valid TOTP code after password verification
4. IF a user enters an incorrect TOTP code 5 times, THE System SHALL lock the account for 15 minutes
5. THE System SHALL allow 2FA to be available on Pinnacle+ plans only

### Requirement 1.16: User Roles and Permissions

**User Story:** As an administrator, I want to assign roles to users, so that I can control access to resources.

#### Acceptance Criteria

1. THE System SHALL support roles: admin, manager, member, guest, collaborator, viewer
2. THE System SHALL enforce permissions based on DEFAULT_ROLE_PERMISSIONS from the shared package
3. WHEN a user role is admin, THE System SHALL grant wildcard (*) permission
4. THE System SHALL validate all API requests against user permissions via RolesGuard
5. THE System SHALL allow custom roles only on Pinnacle+ plans

### Requirement 1.17: Custom Fields

**User Story:** As a user, I want to add custom fields to tasks, so that I can track domain-specific information.

#### Acceptance Criteria

1. THE System SHALL support custom field types: text, number, date, boolean, select, multi_select, user, formula
2. WHEN a custom field is created, THE System SHALL store it in custom_field_definitions table
3. THE System SHALL store custom field values in tasks.custom_fields JSONB column
4. THE System SHALL validate field values against field type and options
5. THE System SHALL allow custom fields only on Team+ plans
6. WHEN a formula field is used, THE System SHALL evaluate the formula on read using stored field values

### Requirement 1.18: Custom Statuses and Workflows

**User Story:** As a team lead, I want to define custom status names, so that workflows match our team process.

#### Acceptance Criteria

1. THE System SHALL allow tenants to define custom status names and colors (Team+ plans)
2. THE System SHALL store custom statuses per workspace
3. THE System SHALL validate status transitions based on configured workflow rules
4. THE System SHALL provide default statuses (backlog, todo, in_progress, in_review, done, cancelled) for free plans
5. WHEN a task status changes, THE System SHALL trigger automation rules listening to task:status:changed event

### Requirement 1.19: Recurring Tasks

**User Story:** As a user, I want tasks to recur automatically, so that repetitive work doesn't require manual recreation.

#### Acceptance Criteria

1. THE System SHALL support recurrence rules using iCalendar RRULE format
2. WHEN a recurring task is due, THE System SHALL create a new task instance with the same properties
3. THE System SHALL support daily, weekly, monthly, and custom recurrence patterns
4. THE System SHALL allow users to skip or modify individual recurrence instances
5. THE System SHALL use Blueprint templates for recurring task creation (Business+ plans)

### Requirement 1.20: Checklists and Markdown

**User Story:** As a user, I want to format task descriptions with markdown, so that I can create structured content.

#### Acceptance Criteria

1. THE System SHALL support markdown rendering in task and comment descriptions
2. THE System SHALL support: headers, lists, code blocks, links, images, and tables
3. THE System SHALL sanitize markdown to prevent XSS attacks
4. THE System SHALL render checklists as interactive checkboxes
5. WHEN a checklist item is checked, THE System SHALL persist the state in the description field

### Requirement 1.21: API and Webhooks

**User Story:** As a developer, I want REST API access and webhooks, so that I can integrate with external systems.

#### Acceptance Criteria

1. THE System SHALL expose a REST API at /api/v1 with full CRUD operations
2. THE System SHALL enforce rate limiting of 400 requests per minute per API key
3. THE System SHALL support webhook subscriptions for events: task:created, task:updated, task:status:changed, task:assigned, task:comment:added, project:status:changed, approval:completed, file:uploaded
4. WHEN an event occurs, THE System SHALL POST webhook payload to registered URLs
5. THE System SHALL retry webhook delivery up to 3 times with exponential backoff
6. THE System SHALL disable webhooks after 10 consecutive failures
7. THE System SHALL support HMAC signature verification for webhook security

### Requirement 1.22: Approval Flows

**User Story:** As a user, I want multi-stage approval processes, so that work can be formally reviewed before completion.

#### Acceptance Criteria

1. THE System SHALL support approval chains with multiple sequential steps
2. WHEN an approval is requested, THE System SHALL create an approval_request linked to the task
3. THE System SHALL notify approvers when their approval step is active
4. WHEN all required approvals in a step are received, THE System SHALL advance to the next step
5. IF any approver rejects, THE System SHALL mark the approval as rejected
6. THE System SHALL allow approval flows only on Business+ plans

### Requirement 1.23: Proofing and Markup

**User Story:** As a designer, I want to annotate images and PDFs, so that feedback is visually precise.

#### Acceptance Criteria

1. THE System SHALL support annotations on file_versions of type image/* and application/pdf
2. WHEN a user creates an annotation, THE System SHALL store x, y, width, height coordinates
3. THE System SHALL support annotation types: rectangle, text, arrow, comment
4. THE System SHALL allow users to mark annotations as resolved
5. THE System SHALL render annotations as an overlay on the file viewer
6. THE System SHALL allow proofing only on Business+ plans

### Requirement 1.24: Time Tracking

**User Story:** As a user, I want to log time spent on tasks, so that we can track effort and billing.

#### Acceptance Criteria

1. THE System SHALL allow users to create time entries with logged_date, duration_minutes, and description
2. THE System SHALL enforce duration_minutes between 1 and 1440 (24 hours)
3. THE System SHALL support billable/non-billable flag and hourly rate per entry
4. THE System SHALL allow time entries to be locked for finalized billing periods
5. THE System SHALL calculate total logged hours per task and per user
6. THE System SHALL allow time tracking only on Business+ plans

### Requirement 1.25: Work Schedules

**User Story:** As a manager, I want to define work schedules and holidays, so that planning accounts for availability.

#### Acceptance Criteria

1. THE System SHALL allow admins to define tenant-wide holiday calendars
2. THE System SHALL allow users to set personal vacation/unavailability dates
3. THE System SHALL exclude non-working days from task duration calculations
4. THE System SHALL display unavailable days in calendar and Gantt views
5. THE System SHALL allow work schedules only on Business+ plans

---

## LEVEL 2: TASK-LEVEL FEATURES (~15 features)

### Requirement 2.1: Task Dependencies

**User Story:** As a project manager, I want to link tasks with dependencies, so that task sequences are enforced.

#### Acceptance Criteria

1. THE System SHALL support dependency types: finish_to_start, start_to_start, finish_to_finish, start_to_finish
2. WHEN a dependency is created, THE System SHALL store task_id, depends_on_task_id, and dependency_type
3. THE System SHALL support lag_days to represent delays between dependent tasks
4. THE System SHALL prevent circular dependencies by validating the dependency graph
5. WHEN a predecessor task due date changes, THE System SHALL automatically reschedule dependent tasks
6. THE System SHALL allow dependencies only on Team+ plans

### Requirement 2.2: Milestones

**User Story:** As a user, I want to mark significant events as milestones, so that key dates are highlighted.

#### Acceptance Criteria

1. THE System SHALL allow tasks to be flagged as milestones
2. THE System SHALL enforce zero-duration for milestone tasks
3. THE System SHALL display milestones prominently in Gantt charts with diamond icon
4. THE System SHALL allow filtering and reporting by milestone status
5. WHEN a milestone is at risk (dependencies delayed), THE System SHALL highlight it

### Requirement 2.3: Interactive Gantt Chart

**User Story:** As a project manager, I want an interactive timeline view with drag-and-drop scheduling, so that I can visualize and adjust plans.

#### Acceptance Criteria

1. THE System SHALL render tasks on a timeline with start_date and due_date
2. WHEN a user drags a task bar, THE System SHALL update task dates
3. THE System SHALL display dependency arrows between linked tasks
4. THE System SHALL show critical path highlighting (longest dependency chain)
5. WHEN a dependency causes a date conflict, THE System SHALL show a warning
6. THE System SHALL allow Gantt view only on Team+ plans
7. THE System SHALL render Gantt charts using a JavaScript library (e.g., Frappe Gantt, DHTMLX Gantt)

### Requirement 2.4: Calendar Views

**User Story:** As a user, I want to see tasks in year/quarter/month calendar views, so that I can understand time distribution.

#### Acceptance Criteria

1. THE System SHALL display tasks on a calendar grid by due_date
2. THE System SHALL support month, quarter, and year zoom levels
3. WHEN a user drags a task to a new date on calendar, THE System SHALL update the due_date
4. THE System SHALL show task count badges on dates with multiple tasks
5. THE System SHALL allow calendar view only on Team+ plans

### Requirement 2.5: Smart Task Calendar

**User Story:** As a user, I want an aggregated calendar across all my projects, so that I see all deadlines in one view.

#### Acceptance Criteria

1. THE System SHALL aggregate tasks from all projects the user has access to
2. THE System SHALL allow filtering by project, folder, or assignee
3. THE System SHALL synchronize with external calendars via iCalendar feed
4. THE System SHALL allow smart calendar only on Team+ plans
5. WHEN a task is overdue, THE System SHALL highlight it in red on the calendar

### Requirement 2.6: Files View

**User Story:** As a user, I want to see all project files in one list, so that I can quickly access attachments.

#### Acceptance Criteria

1. THE System SHALL aggregate all file_versions attached to tasks in a project
2. THE System SHALL display file name, type, size, uploaded date, and uploader
3. THE System SHALL allow sorting by name, date, size, or type
4. THE System SHALL provide download and preview actions
5. THE System SHALL allow files view only on Team+ plans

### Requirement 2.7: Blueprints (Task Templates)

**User Story:** As a user, I want to save projects as reusable templates, so that I can quickly start new projects with predefined structure.
