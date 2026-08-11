# Metabase reporting layer design

## Goal

Add an optional, free, self-hosted Metabase layer for CEPAA management reporting without weakening the role-scoped native dashboard or exposing operational tables, Supabase keys, or cross-tenant data.

## Chosen architecture

Metabase runs as a separate service. Its own users, dashboards, saved questions, schedules, and settings live in a separate PostgreSQL application database. CEPAA's operational Supabase database is added as a data source through a dedicated LOGIN role that inherits only from a `cepaa_analytics_reader` NOLOGIN group.

The reader can access only curated views in the non-exposed `analytics` schema. Every view resolves its tenant from a protected login-to-tenant mapping keyed by the immutable PostgreSQL `session_user`; an unmapped login sees no rows. The login role is configured with `default_transaction_read_only=on`, a 30-second statement timeout, and an analytics-only search path. It receives no privileges on the mapping table, `public`, `auth`, storage, sequences, or functions.

Because secure SSO and row-level embedding are paid Metabase features, Phase 2 does not iframe or silently authenticate users. CEPAA provides an authenticated launch card only to tenant Admins and Department Heads. Metabase uses separate management accounts and group permissions. Managers and employees continue to use the native role-scoped analytics view.

## Reporting model

The migration creates four security-barrier views:

- `analytics.task_facts`: one row per visible task with department, project, dates, status, priority, planned hours, assignee names, handoff fields, and calculated completion/overdue/blocked measures;
- `analytics.monthly_task_outcomes`: month, department, and project aggregates for created, completed, on-time, overdue-outcome, blocked, and handoff measures;
- `analytics.workload_snapshot`: current active tasks, overdue tasks, blocked tasks, and estimated hours by department and assignee;
- `analytics.project_health`: explainable project components and the same rolling-12-month, project-scoped 35/25/20/10/10 weighted score used by the native dashboard.

The views include stable IDs for filters and drill-downs but omit email, descriptions, comments, files, authentication data, and other unnecessary personal or sensitive fields.

## Access flow

`GET /api/v1/dashboard/metabase` resolves the server-side dashboard scope. It returns the configured HTTPS Metabase URL only when the current user is an Admin or Department Head. It returns 404 when Metabase is not configured and 403 for employees and managers. The frontend requests this endpoint only for eligible analytics responses and renders an external-link card; the URL is never accepted from the browser.

## Deployment

The repository adds a pinned Metabase container to Docker Compose with a health check and a dedicated Postgres application database. Production instructions create a separate Railway service from the official pinned image, provision a persistent Metabase application database, configure encryption and HTTPS, then add the Supabase source with SSL required.

The repository intentionally does not store database passwords. A parameterized provisioning script validates tenant UUID and login name, creates or rotates the reader login, and prints no password. Operators supply secrets through environment variables and `psql` variables.

## Failure behavior

- Missing `METABASE_SITE_URL`: native analytics remains fully functional; eligible users see no launch card.
- Invalid or non-HTTPS production URL: the backend refuses to expose it.
- Missing reader mapping: reporting views return zero rows.
- Attempted writes: PostgreSQL rejects them because the login is read-only and has only SELECT on views.
- Metabase unavailable: native CEPAA analytics and exports are unaffected.

## Verification

Static migration tests verify tenant predicates, privilege revocation, safe view columns, group-role properties, and parity between Supabase SQL and the Knex runtime wrapper. API tests cover Admin/Head allow, Manager/Employee deny, missing configuration, and HTTPS enforcement. Frontend tests cover eligible launch rendering and absence for ineligible roles. Docker Compose validation, full tests, lint, typecheck, production build, and whitespace checks gate release.
