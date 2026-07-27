-- Application queries switch to this applied non-owner, non-bypass role so RLS is
-- enforced even though migrations use Supabase's administrative connection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openwork_app') THEN
    CREATE ROLE openwork_app
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
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
