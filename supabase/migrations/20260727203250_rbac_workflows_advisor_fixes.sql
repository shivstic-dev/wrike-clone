CREATE INDEX IF NOT EXISTS idx_task_assignees_assigned_by
  ON task_assignees(assigned_by_id);
