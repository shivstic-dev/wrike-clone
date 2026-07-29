ALTER TABLE task_dependencies
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

DELETE FROM task_dependencies td
WHERE NOT EXISTS (
  SELECT 1 FROM tasks dependent_task WHERE dependent_task.id = td.task_id
)
OR NOT EXISTS (
  SELECT 1 FROM tasks predecessor_task WHERE predecessor_task.id = td.depends_on_task_id
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM task_dependencies td
    JOIN tasks dependent_task ON dependent_task.id = td.task_id
    JOIN tasks predecessor_task ON predecessor_task.id = td.depends_on_task_id
    WHERE predecessor_task.tenant_id IS DISTINCT FROM dependent_task.tenant_id
  ) THEN
    RAISE EXCEPTION 'task_dependencies contains cross-tenant dependency edges';
  END IF;
END;
$$;

UPDATE task_dependencies td
SET tenant_id = t.tenant_id
FROM tasks t
WHERE td.task_id = t.id
  AND td.tenant_id IS DISTINCT FROM t.tenant_id;

UPDATE task_dependencies
SET lag_days = GREATEST(COALESCE(lag_days, 0), 0)
WHERE lag_days IS NULL OR lag_days < 0;

ALTER TABLE task_dependencies
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN lag_days SET DEFAULT 0,
  ALTER COLUMN lag_days SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM task_dependencies
    WHERE dependency_type IS NULL
       OR dependency_type NOT IN (
         'finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'
       )
  ) THEN
    RAISE EXCEPTION 'task_dependencies contains a NULL or unsupported dependency_type';
  END IF;

  ALTER TABLE task_dependencies
    ALTER COLUMN dependency_type SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_dependencies_dependency_type_check'
  ) THEN
    ALTER TABLE task_dependencies
      ADD CONSTRAINT task_dependencies_dependency_type_check
      CHECK (dependency_type IN (
        'finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_dependencies_lag_days_check'
  ) THEN
    ALTER TABLE task_dependencies
      ADD CONSTRAINT task_dependencies_lag_days_check
      CHECK (lag_days >= 0);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_task_dependencies_edge
ON task_dependencies (tenant_id, task_id, depends_on_task_id);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_tenant_task
ON task_dependencies (tenant_id, task_id);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_tenant_predecessor
ON task_dependencies (tenant_id, depends_on_task_id);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_timeline_dates
ON tasks (tenant_id, start_date, due_date, id)
WHERE deleted_at IS NULL;
