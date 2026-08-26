-- Private bucket applied to the connected Supabase project and used exclusively
-- by the authorized backend. Objects are
-- namespaced by tenant id and are returned through short-lived signed URLs.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'work-management-files',
  'work-management-files',
  false,
  104857600,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;
