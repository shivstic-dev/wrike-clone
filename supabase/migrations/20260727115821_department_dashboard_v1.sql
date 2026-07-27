-- Department Task Monitoring Dashboard v1.
-- Workspaces are the canonical department entity.

-- Normalize workspace-scoped roles. Department heads are stored separately so
-- one user can lead Department A and remain an employee in Department B.
CREATE TABLE department_heads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  department_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, user_id)
);

CREATE INDEX idx_department_heads_tenant ON department_heads(tenant_id);
CREATE INDEX idx_department_heads_user ON department_heads(user_id);
CREATE INDEX idx_department_heads_department ON department_heads(department_id);

-- Preserve legacy department administrators as department heads.
INSERT INTO department_heads (tenant_id, department_id, user_id)
SELECT tenant_id, workspace_id, user_id
FROM workspace_members
WHERE role = 'dept_admin'
ON CONFLICT (department_id, user_id) DO NOTHING;

ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
UPDATE workspace_members
SET role = CASE
  WHEN role = 'dept_admin' THEN 'employee'
  WHEN role = 'member' THEN 'employee'
  ELSE role
END;
ALTER TABLE workspace_members
  ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('employee', 'manager'));
ALTER TABLE workspace_members ALTER COLUMN role SET DEFAULT 'employee';

-- Normalize the four task statuses required by the department dashboard.
ALTER TABLE tasks ALTER COLUMN status DROP DEFAULT;
CREATE TYPE task_status_department_v1 AS ENUM ('todo', 'in_progress', 'completed', 'blocked');
ALTER TABLE tasks
  ALTER COLUMN status TYPE task_status_department_v1
  USING (
    CASE status::text
      WHEN 'done' THEN 'completed'
      WHEN 'cancelled' THEN 'blocked'
      WHEN 'backlog' THEN 'todo'
      WHEN 'in_review' THEN 'in_progress'
      ELSE status::text
    END
  )::task_status_department_v1;
DROP TYPE task_status;
ALTER TYPE task_status_department_v1 RENAME TO task_status;
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'todo'::task_status;

-- Normalize priorities to Low / Medium / High / Critical.
ALTER TABLE tasks ALTER COLUMN priority DROP DEFAULT;
ALTER TABLE projects ALTER COLUMN priority DROP DEFAULT;
CREATE TYPE task_priority_department_v1 AS ENUM ('low', 'medium', 'high', 'critical');
ALTER TABLE tasks
  ALTER COLUMN priority TYPE task_priority_department_v1
  USING (
    CASE priority::text
      WHEN 'none' THEN 'low'
      WHEN 'urgent' THEN 'critical'
      ELSE priority::text
    END
  )::task_priority_department_v1;
ALTER TABLE projects
  ALTER COLUMN priority TYPE task_priority_department_v1
  USING (
    CASE priority::text
      WHEN 'none' THEN 'low'
      WHEN 'urgent' THEN 'critical'
      ELSE priority::text
    END
  )::task_priority_department_v1;
DROP TYPE task_priority;
ALTER TYPE task_priority_department_v1 RENAME TO task_priority;
ALTER TABLE tasks ALTER COLUMN priority SET DEFAULT 'low'::task_priority;
ALTER TABLE projects ALTER COLUMN priority SET DEFAULT 'low'::task_priority;

-- Use the specification's visibility vocabulary.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_visibility_check;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_visibility_check;
UPDATE tasks SET visibility = 'global' WHERE visibility = 'organization';
UPDATE projects SET visibility = 'global' WHERE visibility = 'organization';
ALTER TABLE tasks
  ADD CONSTRAINT tasks_visibility_check CHECK (visibility IN ('department', 'global'));
ALTER TABLE projects
  ADD CONSTRAINT projects_visibility_check CHECK (visibility IN ('department', 'global'));

-- Store the department directly on each task. The project/folder relationship
-- remains for project organization, but authorization no longer depends on a
-- fragile three-table join.
ALTER TABLE tasks ADD COLUMN department_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;
UPDATE tasks t
SET department_id = f.workspace_id
FROM projects p
JOIN folders f ON f.id = p.folder_id
WHERE t.project_id = p.id;
ALTER TABLE tasks ALTER COLUMN department_id SET NOT NULL;

CREATE INDEX idx_tasks_department ON tasks(department_id);
CREATE INDEX idx_tasks_department_status ON tasks(department_id, status);
CREATE INDEX idx_tasks_department_priority ON tasks(department_id, priority);
CREATE INDEX idx_tasks_department_assignee ON tasks(department_id, assignee_id);
CREATE INDEX idx_tasks_department_due_date ON tasks(department_id, due_date);

-- Deduplicates deadline, priority, and digest notifications across scheduler
-- runs. dedupe_key includes the tenant, recipient, task/event, and rule.
CREATE TABLE notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_type   VARCHAR(64) NOT NULL,
  dedupe_key  VARCHAR(255) NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, dedupe_key)
);

CREATE INDEX idx_notification_log_task ON notification_log(task_id);
CREATE INDEX idx_notification_log_user ON notification_log(user_id, sent_at DESC);
CREATE INDEX idx_notification_log_tenant ON notification_log(tenant_id);

-- Seed the four default custom statuses for every existing department.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_statuses_unique_name
  ON workspace_statuses(workspace_id, name);
INSERT INTO workspace_statuses (tenant_id, workspace_id, name, color, category, sort_order)
SELECT w.tenant_id, w.id, status.name, status.color, status.category, status.sort_order
FROM workspaces w
CROSS JOIN (
  VALUES
    ('To Do', '#64748b', 'not_started', 0),
    ('In Progress', '#3b82f6', 'active', 1),
    ('Completed', '#22c55e', 'completed', 2),
    ('Blocked', '#ef4444', 'blocked', 3)
) AS status(name, color, category, sort_order)
ON CONFLICT (workspace_id, name) DO NOTHING;

-- Match the existing tenant-level defense-in-depth policy pattern.
ALTER TABLE department_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON department_heads FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_log FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON department_heads, notification_log TO openwork_app;
