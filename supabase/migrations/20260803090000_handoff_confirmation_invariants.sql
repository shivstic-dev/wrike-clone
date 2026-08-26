UPDATE tasks
SET handoff_status = 'ready',
    handoff_ready_at = COALESCE(handoff_ready_at, NOW()),
    handoff_confirmed_by = NULL,
    handoff_confirmed_at = NULL,
    status = CASE WHEN status = 'completed' THEN 'in_progress' ELSE status END,
    completed_at = CASE WHEN status = 'completed' THEN NULL ELSE completed_at END
WHERE handoff_status = 'confirmed'
  AND (handoff_confirmed_by IS NULL OR handoff_confirmed_at IS NULL);

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
