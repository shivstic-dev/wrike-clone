CREATE INDEX IF NOT EXISTS idx_tasks_handoff_owner
  ON tasks (handoff_owner_id);

CREATE INDEX IF NOT EXISTS idx_tasks_handoff_confirmed_by
  ON tasks (handoff_confirmed_by);
