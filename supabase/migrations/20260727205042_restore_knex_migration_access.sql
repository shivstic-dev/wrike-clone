-- Knex must read and update its bookkeeping tables before the application
-- transaction interceptor exists. Keep these internal tables available to the
-- database migration connection.
DROP POLICY IF EXISTS knex_migrations_no_api_access ON knex_migrations;
DROP POLICY IF EXISTS knex_migrations_lock_no_api_access ON knex_migrations_lock;
ALTER TABLE knex_migrations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE knex_migrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE knex_migrations_lock NO FORCE ROW LEVEL SECURITY;
ALTER TABLE knex_migrations_lock DISABLE ROW LEVEL SECURITY;
