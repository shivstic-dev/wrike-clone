# CEPAA Metabase + Supabase deployment runbook

This runbook adds self-hosted Metabase for board reporting without weakening CEPAA's native role-scoped dashboard. Metabase is available only to Admins and Department Heads. Managers and Employees continue to use the native dashboard.

## Security model

- Metabase stores its own accounts, dashboards, and settings in a separate PostgreSQL application database.
- Supabase exposes only the four curated views in the non-API `analytics` schema.
- A dedicated login inherits from the `cepaa_analytics_reader` group. The group has `SELECT` only, is `NOBYPASSRLS`, and cannot log in itself.
- Every view is pinned through a protected login-to-tenant mapping keyed by PostgreSQL `session_user`; no tenant filter is accepted from a chart or browser.
- The login is forced to `default_transaction_read_only`, a 30-second statement timeout, four connections, and an `analytics`-only search path.
- Provisioning accepts only a dedicated `cepaa_metabase_*` login. Rotation fails closed unless the existing role has the expected mapping, only the analytics group membership, no direct grants, and no owned objects.
- Never use the Supabase `service-role`, database owner, migration user, or CEPAA runtime user in Metabase.
- Use SSL for both the Metabase application database and the Supabase data-source connection.

## 1. Deploy the database migration

Deploy the backend first. Railway's backend start command runs Knex migrations and installs `024_metabase_reporting_layer.ts`, which executes the matching Supabase SQL migration.

Confirm these views exist before provisioning a login:

```sql
select table_name
from information_schema.views
where table_schema = 'analytics'
order by table_name;
```

Expected: `monthly_task_outcomes`, `project_health`, `task_facts`, and `workload_snapshot`.

## 2. Provision the read-only Supabase login

Run the repository script from a trusted administrator machine with `psql`. Use the Supabase direct connection for a long-lived database client; use the session pooler only if IPv4 connectivity requires it.

```bash
export DATABASE_URL='postgresql://migration-admin:REDACTED@db.example.supabase.co:5432/postgres?sslmode=require'
export METABASE_READER_TENANT_ID='00000000-0000-0000-0000-000000000000'
export METABASE_READER_LOGIN='cepaa_metabase_board'
export METABASE_READER_PASSWORD='GENERATE-AT-LEAST-24-RANDOM-CHARACTERS'
./scripts/provision-metabase-reader.sh
```

Do not place these values in Git, Vercel, frontend variables, Compose, or application logs. Save the login and password in the Railway Metabase service's secret store only until the source is configured.

Validate the restrictions while connected as the reader:

```sql
show default_transaction_read_only;
show statement_timeout;
show search_path;
select tenant_id from analytics.reader_tenants;
select count(*) from analytics.task_facts;
create table analytics.should_fail (id integer);
```

The read-only settings and count must succeed. Reading `analytics.reader_tenants` and `create table` must both fail.

The migration revokes PostgreSQL's default `PUBLIC` function execution in the operational `public` schema and grants it to `openwork_app`. If another Supabase client intentionally uses RPC functions, grant only those functions to its intended role; do not restore blanket `PUBLIC` execution.

## 3. Create the Railway services

Create two services in the existing Railway project:

1. A PostgreSQL service dedicated to Metabase application state. Enable Railway backups.
2. A Docker-image service using `metabase/metabase:v0.63.2.x`.

Configure the Metabase service:

| Variable | Value |
| --- | --- |
| `MB_DB_TYPE` | `postgres` |
| `MB_DB_CONNECTION_URI` | Private SSL URI for the dedicated Metabase PostgreSQL service |
| `MB_ENCRYPTION_SECRET_KEY` | At least 32 random characters; store separately from the database backup |
| `MB_SITE_URL` | Public HTTPS Metabase domain |
| `JAVA_TIMEZONE` | `Asia/Kolkata` |

Allocate at least 1 GB RAM to start. Expose port 3000 and use `/api/health` as the health check. Do not connect Metabase's application database to the operational Supabase project.

## 4. Add Supabase as a Metabase data source

In Metabase, open **Admin settings → Databases → Add a database → PostgreSQL**.

- Name: `CEPAA Analytics`
- Host/port/database: Supabase direct connection, or session pooler if IPv4 is required
- Username/password: the dedicated reader from step 2
- Schemas: include `analytics` only
- SSL: enabled and certificate validation enabled where supported
- Automatic scans: schedule outside peak working hours

After saving, verify that only the four analytics views are visible. If `public`, `auth`, or raw operational tables appear, remove the data source immediately and correct its user/schema configuration.

## 5. Configure people and permissions

Create Metabase groups named `CEPAA Admins`, `Department Heads`, and `Board Viewers`.

- Admins may curate models, questions, dashboards, and subscriptions.
- Department Heads may view and explore curated models; do not grant native SQL access.
- Board Viewers receive view-only access to the board collection.
- Managers and Employees should not receive Metabase accounts in this phase.

Free self-hosted Metabase does not provide CEPAA SSO or application-enforced row-level embedding. Keep authentication separate and do not create public links or unsigned embeds.

## 6. Build the reporting collection

Create a locked `CEPAA Board Reporting` collection using the curated views:

- Monthly created, completed, overdue, blocked, and handoff events from `monthly_task_outcomes` (each measure uses its own event month)
- Current workload from `workload_snapshot`
- Completion time, blocked ageing, priority, handoff success, and on-time completion from `task_facts`
- Health score and component drill-down from `project_health`; the view states its rolling 12-month period and uses project-level workload plus handoff activity cycles

Add date, department, project, manager, employee, priority, and status filters. Keep source-table questions inside the locked collection. Configure SMTP before enabling scheduled dashboard delivery.

## 7. Connect CEPAA

Set this backend-only Railway variable and redeploy the API:

```text
METABASE_SITE_URL=https://analytics.your-domain.example
```

The dashboard endpoint returns this URL only after CEPAA verifies that the caller is an Admin or Department Head. No Metabase secret reaches the React bundle.

## 8. Operations

### Backup

- Run daily backups of the Metabase application database and keep at least 14 days.
- Supabase operational backups remain independent.
- Before each Metabase upgrade, take and verify an application-database backup.

### Password rotation

Quarterly, generate a new reader password and rerun `provision-metabase-reader.sh` with the same login. Update the Metabase data source immediately, test a card, then remove the old secret from the operator environment. Record the rotation date without recording the password.

Rotate `MB_ENCRYPTION_SECRET_KEY` only with the official Metabase encryption-key rotation command and a verified backup; replacing the variable directly can make stored data-source credentials unreadable.

### Monitoring

- Alert when `/api/health` fails, the service restarts repeatedly, or Supabase statements approach the 30-second timeout.
- Review Metabase users and groups monthly.
- Upgrade only after reviewing release notes and testing the pinned image against a restored application-database backup.

### Rollback

1. Remove `METABASE_SITE_URL` from the backend and redeploy; CEPAA then hides the launch card while native analytics remains available.
2. Roll the Metabase image back to the last tested pin and restore its application-database backup if its schema was upgraded.
3. To disable all source access immediately, revoke the login membership:

```sql
revoke cepaa_analytics_reader from cepaa_metabase_board;
```

Do not drop the analytics views during an application rollback; the migration's down path is reserved for a controlled database rollback.
