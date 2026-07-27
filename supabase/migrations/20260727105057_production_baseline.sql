-- =============================================================================
-- Work Management Platform — applied production database baseline
-- Multi-tenant PostgreSQL schema with Row-Level Security.
-- Every table carries tenant_id; RLS policies enforce tenant isolation at the
-- database level so a bug in application code can never leak data across orgs.
-- =============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUMS ───────────────────────────────────────────────────────────────────

CREATE TYPE tenant_role AS ENUM ('admin', 'manager', 'member', 'guest', 'collaborator');
CREATE TYPE task_status AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('none', 'low', 'medium', 'high', 'urgent');
CREATE TYPE project_status AS ENUM ('active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE dependency_type AS ENUM ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'changes_requested');
CREATE TYPE plan_tier AS ENUM ('free', 'starter', 'professional', 'enterprise');
CREATE TYPE field_type AS ENUM ('text', 'number', 'date', 'boolean', 'select', 'multi_select', 'user', 'formula');
CREATE TYPE action_type AS ENUM ('update_field', 'assign_user', 'change_status', 'send_notification', 'create_task', 'webhook', 'llm_action');
CREATE TYPE event_type AS ENUM (
  'task:created', 'task:updated', 'task:status:changed', 'task:assigned',
  'task:comment:added', 'project:status:changed', 'approval:completed', 'file:uploaded'
);

-- ── HELPER FUNCTION: update updated_at ─────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── TENANTS ─────────────────────────────────────────────────────────────────

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(128) NOT NULL,
  slug          VARCHAR(64) NOT NULL UNIQUE,
  domain        VARCHAR(256),
  plan_tier     plan_tier NOT NULL DEFAULT 'free',
  logo_url      TEXT,
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_tenants_slug ON tenants(slug) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_tenants_domain ON tenants(domain) WHERE domain IS NOT NULL AND deleted_at IS NULL;

-- ── USERS (global, cross-tenant) ────────────────────────────────────────────

CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                 VARCHAR(255) NOT NULL,
  display_name          VARCHAR(255) NOT NULL,
  password_hash         VARCHAR(256),
  avatar_url            TEXT,
  locale                VARCHAR(10) NOT NULL DEFAULT 'en',
  timezone              VARCHAR(64) NOT NULL DEFAULT 'UTC',
  is_active             BOOLEAN NOT NULL DEFAULT true,
  last_login_at         TIMESTAMPTZ,
  must_change_password  BOOLEAN NOT NULL DEFAULT false,
  password_changed_at   TIMESTAMPTZ,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- ── TENANT MEMBERSHIPS (join table with role) ───────────────────────────────

CREATE TABLE tenant_memberships (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       tenant_role NOT NULL DEFAULT 'member',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_memberships_tenant ON tenant_memberships(tenant_id);
CREATE INDEX idx_memberships_user ON tenant_memberships(user_id);

-- ── WORKSPACES ──────────────────────────────────────────────────────────────

CREATE TABLE workspaces (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(128) NOT NULL,
  description  TEXT,
  icon         VARCHAR(64),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX idx_workspaces_tenant ON workspaces(tenant_id);

-- ── WORKSPACE MEMBERS (department membership, Phase 1) ──────────────────────

CREATE TABLE workspace_members (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('dept_admin', 'member')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_wm_user ON workspace_members(user_id);
CREATE INDEX idx_wm_workspace ON workspace_members(workspace_id);

-- ── FOLDERS (self-referential hierarchy: Spaces -> Folders -> Projects) ────

CREATE TABLE folders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_folder_id  UUID REFERENCES folders(id) ON DELETE SET NULL,
  name              VARCHAR(128) NOT NULL,
  description       TEXT,
  icon              VARCHAR(64),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_archived       BOOLEAN NOT NULL DEFAULT false,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_folders_tenant ON folders(tenant_id);
CREATE INDEX idx_folders_workspace ON folders(workspace_id);
CREATE INDEX idx_folders_parent ON folders(parent_folder_id);

-- ── PROJECTS ────────────────────────────────────────────────────────────────

CREATE TABLE projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  folder_id     UUID NOT NULL REFERENCES folders(id) ON DELETE RESTRICT,
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name          VARCHAR(128) NOT NULL,
  description   TEXT,
  status        project_status NOT NULL DEFAULT 'active',
  start_date    TIMESTAMPTZ,
  due_date      TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  priority      task_priority NOT NULL DEFAULT 'none',
  budget        DECIMAL(12,2),
  actual_cost   DECIMAL(12,2),
  visibility    VARCHAR(20) NOT NULL DEFAULT 'department'
                CHECK (visibility IN ('organization', 'department')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_projects_folder ON projects(folder_id);
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_status ON projects(status);

-- ── TASKS (core work item) ──────────────────────────────────────────────────

CREATE TABLE tasks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_task_id    UUID REFERENCES tasks(id) ON DELETE SET NULL,
  assignee_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title             VARCHAR(500) NOT NULL,
  description       TEXT,
  status            task_status NOT NULL DEFAULT 'todo',
  priority          task_priority NOT NULL DEFAULT 'none',
  estimated_hours   DECIMAL(8,2),
  actual_hours      DECIMAL(8,2),
  start_date        TIMESTAMPTZ,
  due_date          TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  visibility        VARCHAR(20) NOT NULL DEFAULT 'department'
                    CHECK (visibility IN ('organization', 'department')),
  custom_fields     JSONB NOT NULL DEFAULT '{}',
  is_recurring      BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule   VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_visibility ON tasks(visibility);

-- Full-text search index on task title & description
CREATE INDEX idx_tasks_fts ON tasks USING GIN(
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);

-- ── TASK FOLDER LINKS (cross-tagging) ───────────────────────────────────────

CREATE TABLE task_folder_links (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id   UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  is_home   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (task_id, folder_id)
);

CREATE INDEX idx_tfl_folder ON task_folder_links(folder_id);
CREATE INDEX idx_tfl_tenant ON task_folder_links(tenant_id);

-- ── TASK DEPENDENCIES ───────────────────────────────────────────────────────

CREATE TABLE task_dependencies (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id            UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type    dependency_type NOT NULL DEFAULT 'finish_to_start',
  lag_days           INTEGER NOT NULL DEFAULT 0,
  UNIQUE(task_id, depends_on_task_id)
);

CREATE INDEX idx_deps_task ON task_dependencies(task_id);
CREATE INDEX idx_deps_depends_on ON task_dependencies(depends_on_task_id);
CREATE INDEX idx_deps_tenant ON task_dependencies(tenant_id);

-- ── TASK ASSIGNEES ──────────────────────────────────────────────────────────

CREATE TABLE task_assignees (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role        VARCHAR(64),
  UNIQUE(task_id, user_id)
);

CREATE INDEX idx_ta_task ON task_assignees(task_id);
CREATE INDEX idx_ta_user ON task_assignees(user_id);
CREATE INDEX idx_ta_tenant ON task_assignees(tenant_id);

-- ── COMMENTS ────────────────────────────────────────────────────────────────

CREATE TABLE task_comments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id           UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  content           TEXT NOT NULL,
  is_edited         BOOLEAN NOT NULL DEFAULT false,
  parent_comment_id UUID REFERENCES task_comments(id) ON DELETE SET NULL,
  attachments       TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_comments_task ON task_comments(task_id);
CREATE INDEX idx_comments_tenant ON task_comments(tenant_id);

-- ── ACTIVITY LOG ────────────────────────────────────────────────────────────

CREATE TABLE activity_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entity_type VARCHAR(64) NOT NULL,
  entity_id   UUID NOT NULL,
  action      VARCHAR(64) NOT NULL,
  changes     JSONB NOT NULL DEFAULT '{}',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_tenant ON activity_logs(tenant_id);
CREATE INDEX idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_actor ON activity_logs(actor_id);
CREATE INDEX idx_activity_created ON activity_logs(created_at DESC);

-- ── TIME ENTRIES ────────────────────────────────────────────────────────────

CREATE TABLE time_entries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id          UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description      TEXT,
  logged_date      DATE NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  is_billable      BOOLEAN NOT NULL DEFAULT true,
  hourly_rate      DECIMAL(10,2),
  is_locked        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX idx_time_tenant ON time_entries(tenant_id);
CREATE INDEX idx_time_task ON time_entries(task_id);
CREATE INDEX idx_time_user ON time_entries(user_id);
CREATE INDEX idx_time_date ON time_entries(logged_date);

-- ── CUSTOM FIELD DEFINITIONS (per-tenant) ───────────────────────────────────

CREATE TABLE custom_field_definitions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(128) NOT NULL,
  key          VARCHAR(64) NOT NULL,
  field_type   field_type NOT NULL,
  options      JSONB,
  is_required  BOOLEAN NOT NULL DEFAULT false,
  default_value JSONB,
  formula      TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, key)
);

CREATE INDEX idx_cfd_tenant ON custom_field_definitions(tenant_id);

-- ── ITEM TYPES (custom task types per tenant) ───────────────────────────────

CREATE TABLE item_types (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       VARCHAR(128) NOT NULL,
  icon       VARCHAR(64) NOT NULL DEFAULT 'task',
  color      VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_item_types_tenant ON item_types(tenant_id);

-- ── APPROVALS ───────────────────────────────────────────────────────────────

CREATE TABLE approval_chains (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ac_tenant ON approval_chains(tenant_id);

CREATE TABLE approval_steps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chain_id        UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  approver_id     UUID REFERENCES users(id),
  approver_role   VARCHAR(64),
  required_count  INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_ap_chain ON approval_steps(chain_id);
CREATE INDEX idx_ap_tenant ON approval_steps(tenant_id);

CREATE TABLE approval_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  chain_id        UUID NOT NULL REFERENCES approval_chains(id),
  current_step    INTEGER NOT NULL DEFAULT 0,
  status          approval_status NOT NULL DEFAULT 'pending',
  requested_by_id UUID NOT NULL REFERENCES users(id),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_ar_tenant ON approval_requests(tenant_id);
CREATE INDEX idx_ar_task ON approval_requests(task_id);

CREATE TABLE approval_votes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id  UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_id     UUID NOT NULL REFERENCES approval_steps(id),
  approver_id UUID NOT NULL REFERENCES users(id),
  status      approval_status NOT NULL,
  comment     TEXT,
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_av_request ON approval_votes(request_id);
CREATE INDEX idx_av_tenant ON approval_votes(tenant_id);

-- ── FILES (versioned asset management) ──────────────────────────────────────

CREATE TABLE files (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id     UUID REFERENCES tasks(id) ON DELETE SET NULL,
  current_version_id UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_files_tenant ON files(tenant_id);
CREATE INDEX idx_files_task ON files(task_id);

CREATE TABLE file_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id         UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  original_name   VARCHAR(512) NOT NULL,
  mime_type       VARCHAR(128) NOT NULL,
  size_bytes      BIGINT NOT NULL,
  storage_path    TEXT NOT NULL,
  thumbnail_path  TEXT,
  category        VARCHAR(32) NOT NULL DEFAULT 'other',
  uploaded_by_id  UUID NOT NULL REFERENCES users(id),
  version_number  INTEGER NOT NULL DEFAULT 1,
  checksum        VARCHAR(64) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fv_file ON file_versions(file_id);
CREATE INDEX idx_fv_tenant ON file_versions(tenant_id);

-- FK: files.current_version_id -> file_versions.id (needs table to exist)
ALTER TABLE files ADD CONSTRAINT fk_current_version
  FOREIGN KEY (current_version_id) REFERENCES file_versions(id) ON DELETE SET NULL;

CREATE TABLE file_annotations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_version_id UUID NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES users(id),
  page_number     INTEGER,
  timestamp_ms    INTEGER,
  x               REAL NOT NULL,
  y               REAL NOT NULL,
  width           REAL NOT NULL,
  height          REAL NOT NULL,
  content         TEXT NOT NULL,
  color           VARCHAR(7) NOT NULL DEFAULT '#ff0000',
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_fa_version ON file_annotations(file_version_id);
CREATE INDEX idx_fa_tenant ON file_annotations(tenant_id);

-- ── AUTOMATION ──────────────────────────────────────────────────────────────

CREATE TABLE automation_rules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(128) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  trigger_event event_type NOT NULL,
  conditions    JSONB NOT NULL DEFAULT '[]',
  actions       JSONB NOT NULL DEFAULT '[]',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ar_tenant_trigger ON automation_rules(tenant_id, trigger_event);

-- ── NOTIFICATIONS ───────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(64) NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT,
  data       JSONB NOT NULL DEFAULT '{}',
  is_read    BOOLEAN NOT NULL DEFAULT false,
  priority   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notif_tenant ON notifications(tenant_id);

-- ── WEBHOOKS ────────────────────────────────────────────────────────────────

CREATE TABLE webhooks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  secret            VARCHAR(256),
  events            event_type[] NOT NULL DEFAULT '{}',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  failure_count     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_tenant ON webhooks(tenant_id);

-- ── SESSIONS (for refresh token tracking) ───────────────────────────────────

CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id   UUID REFERENCES tenant_memberships(id) ON DELETE CASCADE,
  refresh_token   VARCHAR(512) NOT NULL,
  user_agent      TEXT,
  ip_address      INET,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_folder_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

-- Generic RLS policy: rows visible only if tenant_id matches the session setting.
-- Application sets `app.current_tenant_id` at login; all subsequent queries
-- are filtered by this policy automatically.

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Create the same policy for each tenant-scoped table using dynamic SQL
DO $$
DECLARE
  tables_with_tenant TEXT[] := ARRAY[
    'workspaces', 'workspace_members', 'folders', 'projects', 'tasks',
    'task_folder_links', 'task_dependencies', 'task_assignees',
    'task_comments', 'activity_logs', 'time_entries',
    'custom_field_definitions', 'item_types', 'approval_chains', 'approval_steps',
    'approval_requests', 'approval_votes', 'notifications', 'webhooks', 
    'files', 'file_versions', 'file_annotations', 'automation_rules'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_with_tenant LOOP
    EXECUTE format('
      CREATE POLICY tenant_isolation ON %I FOR ALL
        USING (tenant_id = current_tenant_id())
        WITH CHECK (tenant_id = current_tenant_id())
    ', t);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Ensure policies apply even when the application role owns the tables.
DO $$
DECLARE
  tables_with_tenant TEXT[] := ARRAY[
    'workspaces', 'workspace_members', 'folders', 'projects', 'tasks',
    'task_folder_links', 'task_dependencies', 'task_assignees',
    'task_comments', 'activity_logs', 'time_entries',
    'custom_field_definitions', 'item_types', 'approval_chains', 'approval_steps',
    'approval_requests', 'approval_votes', 'notifications', 'webhooks',
    'files', 'file_versions', 'file_annotations', 'automation_rules'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_with_tenant LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ── TRIGGERS: auto-update updated_at ────────────────────────────────────────

DO $$
DECLARE
  tables_with_updated_at TEXT[] := ARRAY[
    'tenants', 'users', 'workspaces', 'folders', 'projects', 'tasks',
    'task_comments', 'time_entries', 'custom_field_definitions', 'item_types',
    'approval_chains', 'automation_rules', 'webhooks', 'files'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_with_updated_at LOOP
    EXECUTE format('
      CREATE TRIGGER trg_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    ', t, t);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Legacy multi-assignee rows were consolidated into tasks.assignee_id by the
-- current application model.
DROP TABLE IF EXISTS task_assignees;
