CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_created_at
  ON tasks (tenant_id, department_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_completed_at
  ON tasks (tenant_id, department_id, completed_at)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_status_due_date
  ON tasks (tenant_id, department_id, status, due_date)
  WHERE deleted_at IS NULL;
