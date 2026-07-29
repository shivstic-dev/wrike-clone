CREATE INDEX IF NOT EXISTS idx_tasks_tenant_assignee_open_due
  ON tasks (tenant_id, assignee_id, due_date)
  WHERE deleted_at IS NULL AND status <> 'completed';
