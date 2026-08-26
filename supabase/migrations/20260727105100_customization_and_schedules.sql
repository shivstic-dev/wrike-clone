-- Applied customization and work-schedule tables.

-- =============================================================================
-- 1. Customization Tables (migration 008)
-- =============================================================================

-- ── workspace_statuses — custom workflow statuses per workspace ──
CREATE TABLE IF NOT EXISTS workspace_statuses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(128) NOT NULL,
  color         VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  category      VARCHAR(32) NOT NULL DEFAULT 'custom',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ws_workspace ON workspace_statuses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_tenant ON workspace_statuses(tenant_id);
ALTER TABLE workspace_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_statuses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON workspace_statuses;
CREATE POLICY tenant_isolation ON workspace_statuses FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ── project_templates — blueprint templates ──
CREATE TABLE IF NOT EXISTS project_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              VARCHAR(256) NOT NULL,
  description       TEXT,
  source_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_template     JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pt_tenant ON project_templates(tenant_id);
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON project_templates;
CREATE POLICY tenant_isolation ON project_templates FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ── request_forms — dynamic intake forms ──
CREATE TABLE IF NOT EXISTS request_forms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(256) NOT NULL,
  description   TEXT,
  folder_id     UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  form_fields   JSONB NOT NULL DEFAULT '[]',
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rf_tenant ON request_forms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rf_folder ON request_forms(folder_id);
ALTER TABLE request_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_forms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON request_forms;
CREATE POLICY tenant_isolation ON request_forms FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- =============================================================================
-- 2. Work Schedule Tables (migration 009)
-- =============================================================================

-- ── working_hours — per-user default working hours ──
CREATE TABLE IF NOT EXISTS working_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time  VARCHAR(5) NOT NULL DEFAULT '09:00',
  end_time    VARCHAR(5) NOT NULL DEFAULT '17:00',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, day_of_week)
);

ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON working_hours;
CREATE POLICY tenant_isolation ON working_hours FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ── time_off — vacation / sick day requests ──
CREATE TABLE IF NOT EXISTS time_off (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('vacation', 'sick', 'personal')),
  reason      TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_to_user ON time_off(user_id);
CREATE INDEX IF NOT EXISTS idx_to_tenant ON time_off(tenant_id);
ALTER TABLE time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON time_off;
CREATE POLICY tenant_isolation ON time_off FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ── tenant_holidays — company-wide holidays ──
CREATE TABLE IF NOT EXISTS tenant_holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  name        VARCHAR(256) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_th_tenant ON tenant_holidays(tenant_id);
ALTER TABLE tenant_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_holidays FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_holidays;
CREATE POLICY tenant_isolation ON tenant_holidays FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- =============================================================================
-- 3. Updated_at triggers for new tables
-- =============================================================================

DO $$
DECLARE
  new_tables TEXT[] := ARRAY[
    'workspace_statuses', 'project_templates', 'request_forms',
    'working_hours', 'time_off', 'tenant_holidays'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = format('trg_%s_updated_at', t)
        AND tgrelid = to_regclass(t)
        AND NOT tgisinternal
    ) THEN
      EXECUTE format('
        CREATE TRIGGER trg_%I_updated_at
          BEFORE UPDATE ON %I
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      ', t, t);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 4. Confirm completion
-- =============================================================================

SELECT 'Migration complete: 6 new tables created' AS result;
