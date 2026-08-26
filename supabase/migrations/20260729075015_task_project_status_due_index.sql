CREATE INDEX IF NOT EXISTS idx_tasks_tenant_project_status_due
  ON tasks (tenant_id, project_id, status, due_date)
  WHERE deleted_at IS NULL;
