-- Explicitly opt request forms into unauthenticated viewing and submission.
-- Existing forms are private by default; administrators can publish selected forms.
ALTER TABLE IF EXISTS request_forms
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
