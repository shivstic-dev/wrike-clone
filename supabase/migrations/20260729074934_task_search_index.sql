CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS search_vec tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_tasks_search_vec ON tasks USING GIN (search_vec);
