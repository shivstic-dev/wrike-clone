CREATE INDEX IF NOT EXISTS idx_task_assignees_assigned_by
  ON task_assignees(assigned_by_id);

DO $$
BEGIN
  IF to_regclass('public.knex_migrations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'knex_migrations'
         AND policyname = 'knex_migrations_no_api_access'
     ) THEN
    CREATE POLICY knex_migrations_no_api_access ON knex_migrations
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF to_regclass('public.knex_migrations_lock') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'knex_migrations_lock'
         AND policyname = 'knex_migrations_lock_no_api_access'
     ) THEN
    CREATE POLICY knex_migrations_lock_no_api_access ON knex_migrations_lock
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END
$$;
