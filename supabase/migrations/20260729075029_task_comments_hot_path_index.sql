CREATE INDEX IF NOT EXISTS idx_task_comments_tenant_task_created
  ON task_comments (tenant_id, task_id, created_at DESC);
