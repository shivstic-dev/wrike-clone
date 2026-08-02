-- Supabase Migration: Handoff Confirmation
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS handoff_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handoff_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS handoff_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handoff_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handoff_confirmed_at TIMESTAMPTZ;

WITH completed_tasks AS (
  SELECT id
  FROM tasks
  WHERE status = 'completed'
)
UPDATE tasks
SET handoff_required = false,
    handoff_status = 'not_required',
    handoff_owner_id = created_by_id
FROM completed_tasks
WHERE tasks.id = completed_tasks.id;

UPDATE tasks
SET handoff_owner_id = created_by_id
WHERE handoff_owner_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_handoff_status_check'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_handoff_status_check
      CHECK (handoff_status IN ('pending', 'ready', 'confirmed', 'not_required'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_handoff_confirmation_check'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_handoff_confirmation_check
      CHECK (
        handoff_status <> 'confirmed'
        OR (handoff_confirmed_by IS NOT NULL AND handoff_confirmed_at IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_handoff_ready
ON tasks (tenant_id, handoff_owner_id, handoff_ready_at DESC)
WHERE deleted_at IS NULL AND handoff_status = 'ready';
