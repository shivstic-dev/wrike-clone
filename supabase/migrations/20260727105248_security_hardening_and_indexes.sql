-- Allow the managed migration connection to assume the applied restricted role for
-- application transactions.
GRANT openwork_app TO postgres;

-- Public-schema tables are reachable through Supabase's Data API. RLS with
-- policies scoped to the backend-only role prevents anon/authenticated access.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
  FOR ALL TO openwork_app
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());

CREATE POLICY tenant_isolation ON tenant_memberships
  FOR ALL TO openwork_app
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY users_select_tenant ON users
  FOR SELECT TO openwork_app
  USING (
    EXISTS (
      SELECT 1
      FROM tenant_memberships membership
      WHERE membership.user_id = users.id
        AND membership.tenant_id = current_tenant_id()
    )
  );

CREATE POLICY users_insert_authorized ON users
  FOR INSERT TO openwork_app
  WITH CHECK (true);

CREATE POLICY users_update_tenant ON users
  FOR UPDATE TO openwork_app
  USING (
    EXISTS (
      SELECT 1
      FROM tenant_memberships membership
      WHERE membership.user_id = users.id
        AND membership.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM tenant_memberships membership
      WHERE membership.user_id = users.id
        AND membership.tenant_id = current_tenant_id()
    )
  );

CREATE POLICY users_delete_tenant ON users
  FOR DELETE TO openwork_app
  USING (
    EXISTS (
      SELECT 1
      FROM tenant_memberships membership
      WHERE membership.user_id = users.id
        AND membership.tenant_id = current_tenant_id()
    )
  );

CREATE POLICY tenant_isolation ON sessions
  FOR ALL TO openwork_app
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.current_tenant_id() SET search_path = '';

CREATE INDEX IF NOT EXISTS idx_approval_requests_chain
  ON approval_requests(chain_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by
  ON approval_requests(requested_by_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_approver
  ON approval_steps(approver_id);
CREATE INDEX IF NOT EXISTS idx_approval_votes_approver
  ON approval_votes(approver_id);
CREATE INDEX IF NOT EXISTS idx_approval_votes_step
  ON approval_votes(step_id);
CREATE INDEX IF NOT EXISTS idx_file_annotations_author
  ON file_annotations(author_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_uploaded_by
  ON file_versions(uploaded_by_id);
CREATE INDEX IF NOT EXISTS idx_files_current_version
  ON files(current_version_id);
CREATE INDEX IF NOT EXISTS idx_project_templates_source
  ON project_templates(source_project_id);
CREATE INDEX IF NOT EXISTS idx_request_forms_created_by
  ON request_forms(created_by_id);
CREATE INDEX IF NOT EXISTS idx_sessions_membership
  ON sessions(membership_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant
  ON sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_author
  ON task_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_parent
  ON task_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by
  ON tasks(created_by_id);
CREATE INDEX IF NOT EXISTS idx_working_hours_user
  ON working_hours(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_tenant
  ON workspace_members(tenant_id);
