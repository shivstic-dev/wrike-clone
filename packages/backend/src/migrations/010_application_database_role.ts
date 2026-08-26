import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openwork_app') THEN
        CREATE ROLE openwork_app
          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
    END;
    $$;

    GRANT USAGE ON SCHEMA public TO openwork_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO openwork_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO openwork_app;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO openwork_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO openwork_app;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM openwork_app;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM openwork_app;
    REVOKE USAGE ON SCHEMA public FROM openwork_app;
    DROP ROLE IF EXISTS openwork_app;
  `);
}
