-- Role-aware task assignment and audited department role changes.

-- Finish the move from legacy tenant-wide managers to department-scoped
-- managers. Existing managers retain manager access in each department where
-- they are already a member.
UPDATE workspace_members wm
SET role = 'manager', updated_at = NOW()
FROM tenant_memberships tm
WHERE tm.tenant_id = wm.tenant_id
  AND tm.user_id = wm.user_id
  AND tm.role = 'manager'
  AND tm.is_active = true;

UPDATE tenant_memberships
SET role = 'member'
WHERE role = 'manager';

CREATE TABLE task_assignees (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id        UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, user_id)
);

CREATE UNIQUE INDEX idx_task_assignees_one_primary
  ON task_assignees(task_id) WHERE is_primary;
CREATE INDEX idx_task_assignees_tenant ON task_assignees(tenant_id);
CREATE INDEX idx_task_assignees_user ON task_assignees(user_id, assigned_at DESC);
CREATE INDEX idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX idx_task_assignees_assigned_by ON task_assignees(assigned_by_id);

-- Keep every legacy primary assignee. The task creator is the best available
-- historical actor for rows that predate explicit assignment auditing.
INSERT INTO task_assignees (
  tenant_id,
  task_id,
  user_id,
  assigned_by_id,
  is_primary,
  assigned_at
)
SELECT
  tenant_id,
  id,
  assignee_id,
  created_by_id,
  true,
  created_at
FROM tasks
WHERE assignee_id IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

CREATE TABLE role_change_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  department_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  old_role       TEXT NOT NULL CHECK (old_role IN ('employee', 'manager')),
  new_role       TEXT NOT NULL CHECK (new_role IN ('employee', 'manager')),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (old_role <> new_role)
);

CREATE INDEX idx_role_change_log_tenant ON role_change_log(tenant_id);
CREATE INDEX idx_role_change_log_department
  ON role_change_log(department_id, changed_at DESC);
CREATE INDEX idx_role_change_log_user
  ON role_change_log(user_id, changed_at DESC);
CREATE INDEX idx_role_change_log_changed_by ON role_change_log(changed_by_id);

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON task_assignees FOR ALL TO openwork_app
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE role_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_change_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role_change_log FOR ALL TO openwork_app
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON task_assignees, role_change_log TO openwork_app;

-- Knex's bookkeeping tables live in public but are never application data.
-- Hide them from PostgREST roles while retaining access for the migration
-- connection (the Supabase postgres role bypasses RLS).
DO $$
BEGIN
  IF to_regclass('public.knex_migrations') IS NOT NULL THEN
    ALTER TABLE knex_migrations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE knex_migrations FORCE ROW LEVEL SECURITY;
    CREATE POLICY knex_migrations_no_api_access ON knex_migrations
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF to_regclass('public.knex_migrations_lock') IS NOT NULL THEN
    ALTER TABLE knex_migrations_lock ENABLE ROW LEVEL SECURITY;
    ALTER TABLE knex_migrations_lock FORCE ROW LEVEL SECURITY;
    CREATE POLICY knex_migrations_lock_no_api_access ON knex_migrations_lock
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END
$$;
