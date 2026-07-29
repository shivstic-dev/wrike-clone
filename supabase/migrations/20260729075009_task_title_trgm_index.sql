CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm
  ON tasks USING GIN (title extensions.gin_trgm_ops);
