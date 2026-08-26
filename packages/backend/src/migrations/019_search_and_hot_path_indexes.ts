import type { Knex } from 'knex';

/**
 * Reconciles Knex's Railway migration history with schema objects that may
 * already exist through Supabase migrations. Every operation is idempotent,
 * and the SQL is embedded so the compiled migration has no runtime assets.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
DECLARE
  extension_schema text;
BEGIN
  SELECT namespace.nspname
    INTO extension_schema
    FROM pg_extension extension
    JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
   WHERE extension.extname = 'pg_trgm';

  IF extension_schema <> 'extensions' THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END;
$$;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS search_vec tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_tasks_search_vec ON tasks USING GIN (search_vec);

CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm
      ON tasks USING GIN (title extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_project_status_due
      ON tasks (tenant_id, project_id, status, due_date)
      WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_assignee_open_due
      ON tasks (tenant_id, assignee_id, due_date)
      WHERE deleted_at IS NULL AND status <> 'completed';

CREATE INDEX IF NOT EXISTS idx_task_comments_tenant_task_created
      ON task_comments (tenant_id, task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_unread
      ON notifications (tenant_id, user_id, created_at DESC)
      WHERE is_read = false;`);
}

/**
 * These objects can predate this Knex entry in environments initially managed
 * by Supabase migrations. A rollback therefore removes only the Knex history
 * record and deliberately preserves the shared production schema.
 */
export async function down(_knex: Knex): Promise<void> {}
