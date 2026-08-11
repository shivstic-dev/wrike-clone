#!/usr/bin/env bash
set -euo pipefail

require_variable() {
  local variable_name="$1"
  if [ -z "${!variable_name:-}" ]; then
    echo "[ERROR] ${variable_name} is required" >&2
    exit 1
  fi
}

require_variable DATABASE_URL
require_variable METABASE_READER_TENANT_ID
require_variable METABASE_READER_LOGIN
require_variable METABASE_READER_PASSWORD

if [[ ! "$METABASE_READER_TENANT_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "[ERROR] METABASE_READER_TENANT_ID must be a UUID" >&2
  exit 1
fi
if [[ ! "$METABASE_READER_LOGIN" =~ ^cepaa_metabase_[a-z0-9_]{3,45}$ ]]; then
  echo "[ERROR] METABASE_READER_LOGIN must start with cepaa_metabase_" >&2
  exit 1
fi
if [ "$METABASE_READER_LOGIN" = 'cepaa_analytics_reader' ]; then
  echo "[ERROR] METABASE_READER_LOGIN must not replace the reader group role" >&2
  exit 1
fi
if [ "${#METABASE_READER_PASSWORD}" -lt 24 ]; then
  echo "[ERROR] METABASE_READER_PASSWORD must contain at least 24 characters" >&2
  exit 1
fi
if [ "${#METABASE_READER_PASSWORD}" -gt 128 ] ||
  [[ ! "$METABASE_READER_PASSWORD" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "[ERROR] METABASE_READER_PASSWORD must be 24-128 URL-safe characters" >&2
  exit 1
fi

umask 077
reader_sql_file="$(mktemp "${TMPDIR:-/tmp}/cepaa-metabase-reader.XXXXXX.sql")"
trap 'rm -f -- "$reader_sql_file"' EXIT

cat >"$reader_sql_file" <<SQL
BEGIN;

SELECT NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = '${METABASE_READER_LOGIN}'
) AS reader_is_new \gset

\if :reader_is_new
CREATE ROLE "${METABASE_READER_LOGIN}" WITH
  LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  PASSWORD '${METABASE_READER_PASSWORD}' CONNECTION LIMIT 4;
\else
SELECT (
  EXISTS (
    SELECT 1 FROM analytics.reader_tenants
    WHERE login_name = '${METABASE_READER_LOGIN}'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE member.rolname = '${METABASE_READER_LOGIN}'
      AND granted.rolname = 'cepaa_analytics_reader'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE member.rolname = '${METABASE_READER_LOGIN}'
      AND granted.rolname <> 'cepaa_analytics_reader'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_class object
    JOIN pg_roles owner ON owner.oid = object.relowner
    WHERE owner.rolname = '${METABASE_READER_LOGIN}'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_proc routine
    JOIN pg_roles owner ON owner.oid = routine.proowner
    WHERE owner.rolname = '${METABASE_READER_LOGIN}'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_shdepend dependency
    JOIN pg_roles reader ON reader.oid = dependency.refobjid
    WHERE reader.rolname = '${METABASE_READER_LOGIN}'
      AND dependency.deptype IN ('o', 'a')
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE grantee = '${METABASE_READER_LOGIN}'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE grantee = '${METABASE_READER_LOGIN}'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE grantee = '${METABASE_READER_LOGIN}'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.usage_privileges
    WHERE grantee = '${METABASE_READER_LOGIN}'
  )
) AS reader_is_safe \gset
\if :reader_is_safe
ALTER ROLE "${METABASE_READER_LOGIN}" WITH
  LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  PASSWORD '${METABASE_READER_PASSWORD}' CONNECTION LIMIT 4;
\else
\echo '[ERROR] Existing role was not previously provisioned as a dedicated CEPAA reader'
\quit 3
\endif
\endif

GRANT cepaa_analytics_reader TO "${METABASE_READER_LOGIN}";
INSERT INTO analytics.reader_tenants (login_name, tenant_id, updated_at)
VALUES ('${METABASE_READER_LOGIN}', '${METABASE_READER_TENANT_ID}'::uuid, NOW())
ON CONFLICT (login_name) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id, updated_at = NOW();
ALTER ROLE "${METABASE_READER_LOGIN}" SET default_transaction_read_only = on;
ALTER ROLE "${METABASE_READER_LOGIN}" SET statement_timeout = '30s';
ALTER ROLE "${METABASE_READER_LOGIN}" SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE "${METABASE_READER_LOGIN}" SET search_path = analytics, pg_catalog;
ALTER ROLE "${METABASE_READER_LOGIN}" SET timezone = 'UTC';

COMMIT;
SQL

psql "$DATABASE_URL" \
  -X \
  -v ON_ERROR_STOP=1 \
  -f "$reader_sql_file"

echo "[OK] Metabase analytics reader provisioned for the selected tenant"
