-- Curated, tenant-pinned reporting surface for self-hosted Metabase.
-- A separate LOGIN role inherits this NOLOGIN group during provisioning.

CREATE SCHEMA IF NOT EXISTS analytics;
REVOKE ALL ON SCHEMA analytics FROM PUBLIC;

CREATE TABLE IF NOT EXISTS analytics.reader_tenants (
  login_name text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
REVOKE ALL ON analytics.reader_tenants FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cepaa_analytics_reader') THEN
    CREATE ROLE cepaa_analytics_reader
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;
ALTER ROLE cepaa_analytics_reader
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

CREATE OR REPLACE VIEW analytics.task_facts
WITH (security_barrier = true)
AS
SELECT
  t.tenant_id,
  t.id AS task_id,
  t.department_id,
  w.name AS department_name,
  t.project_id,
  p.name AS project_name,
  t.title AS task_title,
  t.status::text AS status,
  t.priority::text AS priority,
  t.estimated_hours,
  t.created_at,
  t.updated_at,
  t.start_date,
  t.due_date,
  t.completed_at,
  t.handoff_required,
  t.handoff_status,
  t.handoff_ready_at,
  t.handoff_confirmed_at,
  assigned.assignee_ids,
  assigned.assignee_names,
  assigned.assignee_count,
  (t.completed_at IS NOT NULL AND t.due_date IS NOT NULL AND t.completed_at <= t.due_date)
    AS completed_on_time,
  (t.status <> 'completed' AND t.due_date IS NOT NULL AND t.due_date < NOW())
    AS currently_overdue,
  (t.due_date IS NOT NULL AND t.due_date < NOW()
    AND (t.completed_at IS NULL OR t.completed_at > t.due_date)) AS overdue_outcome,
  CASE WHEN t.status = 'blocked'
    THEN GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(blocked.blocked_since, t.updated_at))) / 86400)
    )::integer
    ELSE NULL
  END AS blocked_age_days,
  blocked.blocked_since,
  CASE WHEN t.handoff_ready_at IS NOT NULL AND t.handoff_confirmed_at IS NOT NULL
    THEN t.handoff_confirmed_at <= t.handoff_ready_at + INTERVAL '48 hours'
    ELSE NULL
  END AS handoff_within_48_hours
FROM tasks t
JOIN workspaces w ON w.id = t.department_id AND w.tenant_id = t.tenant_id
JOIN projects p ON p.id = t.project_id AND p.tenant_id = t.tenant_id
LEFT JOIN LATERAL (
  SELECT
    ARRAY_AGG(person.user_id ORDER BY person.display_name, person.user_id) AS assignee_ids,
    STRING_AGG(person.display_name, ', ' ORDER BY person.display_name, person.user_id)
      AS assignee_names,
    COUNT(*)::integer AS assignee_count
  FROM (
    SELECT ta.user_id, u.display_name
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id AND u.deleted_at IS NULL
    WHERE ta.tenant_id = t.tenant_id AND ta.task_id = t.id
    UNION
    SELECT u.id, u.display_name
    FROM users u
    WHERE u.id = t.assignee_id AND u.deleted_at IS NULL
  ) person
) assigned ON TRUE
LEFT JOIN LATERAL (
  SELECT MAX(log.created_at) AS blocked_since
  FROM activity_logs log
  WHERE log.tenant_id = t.tenant_id
    AND log.entity_type = 'task'
    AND log.entity_id = t.id
    AND log.action = 'task:status:changed'
    AND log.changes -> 'status' ->> 'new' = 'blocked'
) blocked ON TRUE
WHERE t.tenant_id = (
    SELECT reader.tenant_id
    FROM analytics.reader_tenants reader
    WHERE reader.login_name = session_user
  )
  AND t.deleted_at IS NULL
  AND w.deleted_at IS NULL
  AND p.deleted_at IS NULL;

CREATE OR REPLACE VIEW analytics.monthly_task_outcomes
WITH (security_barrier = true)
AS
WITH facts AS (
  SELECT *
  FROM analytics.task_facts
  WHERE tenant_id = (
    SELECT reader.tenant_id
    FROM analytics.reader_tenants reader
    WHERE reader.login_name = session_user
  )
), created AS (
  SELECT tenant_id, DATE_TRUNC('month', created_at)::date AS month,
    department_id, department_name, project_id, project_name,
    COUNT(*)::integer AS created_count
  FROM facts
  GROUP BY tenant_id, month, department_id, department_name, project_id, project_name
), completed AS (
  SELECT tenant_id, DATE_TRUNC('month', completed_at)::date AS month,
    department_id, department_name, project_id, project_name,
    COUNT(*)::integer AS completed_count,
    COUNT(*) FILTER (WHERE completed_on_time)::integer AS on_time_count,
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600)
      FILTER (WHERE completed_at >= created_at), 1) AS average_completion_hours
  FROM facts
  WHERE completed_at IS NOT NULL
  GROUP BY tenant_id, month, department_id, department_name, project_id, project_name
), overdue AS (
  SELECT tenant_id, DATE_TRUNC('month', due_date)::date AS month,
    department_id, department_name, project_id, project_name,
    COUNT(*)::integer AS overdue_outcome_count
  FROM facts
  WHERE due_date IS NOT NULL AND overdue_outcome
  GROUP BY tenant_id, month, department_id, department_name, project_id, project_name
), blocked AS (
  SELECT facts.tenant_id, DATE_TRUNC('month', log.created_at)::date AS month,
    facts.department_id, facts.department_name, facts.project_id, facts.project_name,
    COUNT(*)::integer AS blocked_count
  FROM facts
  JOIN activity_logs log
    ON log.tenant_id = facts.tenant_id
    AND log.entity_type = 'task'
    AND log.entity_id = facts.task_id
    AND log.action = 'task:status:changed'
    AND log.changes -> 'status' ->> 'new' = 'blocked'
  GROUP BY facts.tenant_id, month, facts.department_id, facts.department_name,
    facts.project_id, facts.project_name
), all_ready_events AS (
  SELECT facts.tenant_id, facts.department_id, facts.department_name,
    facts.project_id, facts.project_name, facts.task_id,
    log.created_at AS ready_at,
    LEAD(log.created_at) OVER (
      PARTITION BY facts.tenant_id, facts.task_id ORDER BY log.created_at
    ) AS next_ready_at
  FROM facts
  JOIN activity_logs log
    ON log.tenant_id = facts.tenant_id
    AND log.entity_type = 'task'
    AND log.entity_id = facts.task_id
    AND log.action = 'task:handoff:ready'
), handoffs AS (
  SELECT tenant_id, DATE_TRUNC('month', ready_at)::date AS month,
    department_id, department_name, project_id, project_name,
    COUNT(*)::integer AS handoff_ready_count,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM activity_logs confirmed
      WHERE confirmed.tenant_id = all_ready_events.tenant_id
        AND confirmed.entity_type = 'task'
        AND confirmed.entity_id = all_ready_events.task_id
        AND confirmed.action = 'task:handoff:confirmed'
        AND confirmed.created_at > all_ready_events.ready_at
        AND confirmed.created_at <= all_ready_events.ready_at + INTERVAL '48 hours'
        AND (
          all_ready_events.next_ready_at IS NULL
          OR confirmed.created_at < all_ready_events.next_ready_at
        )
    ))::integer AS handoff_success_count
  FROM all_ready_events
  GROUP BY tenant_id, month, department_id, department_name, project_id, project_name
), keys AS (
  SELECT tenant_id, month, department_id, department_name, project_id, project_name FROM created
  UNION SELECT tenant_id, month, department_id, department_name, project_id, project_name FROM completed
  UNION SELECT tenant_id, month, department_id, department_name, project_id, project_name FROM overdue
  UNION SELECT tenant_id, month, department_id, department_name, project_id, project_name FROM blocked
  UNION SELECT tenant_id, month, department_id, department_name, project_id, project_name FROM handoffs
)
SELECT keys.*,
  COALESCE(created.created_count, 0)::integer AS created_count,
  COALESCE(completed.completed_count, 0)::integer AS completed_count,
  COALESCE(completed.on_time_count, 0)::integer AS on_time_count,
  COALESCE(overdue.overdue_outcome_count, 0)::integer AS overdue_outcome_count,
  COALESCE(blocked.blocked_count, 0)::integer AS blocked_count,
  COALESCE(handoffs.handoff_success_count, 0)::integer AS handoff_success_count,
  COALESCE(handoffs.handoff_ready_count, 0)::integer AS handoff_ready_count,
  completed.average_completion_hours
FROM keys
LEFT JOIN created USING (tenant_id, month, department_id, department_name, project_id, project_name)
LEFT JOIN completed USING (tenant_id, month, department_id, department_name, project_id, project_name)
LEFT JOIN overdue USING (tenant_id, month, department_id, department_name, project_id, project_name)
LEFT JOIN blocked USING (tenant_id, month, department_id, department_name, project_id, project_name)
LEFT JOIN handoffs USING (tenant_id, month, department_id, department_name, project_id, project_name);

CREATE OR REPLACE VIEW analytics.workload_snapshot
WITH (security_barrier = true)
AS
SELECT
  t.tenant_id,
  t.department_id,
  w.name AS department_name,
  person.user_id,
  u.display_name AS member_name,
  CASE
    WHEN wm.role = 'manager' OR tm.role::text = 'manager' THEN 'manager'
    ELSE 'employee'
  END AS member_role,
  COUNT(*) FILTER (WHERE t.status <> 'completed')::integer AS active_tasks,
  COUNT(*) FILTER (
    WHERE t.status <> 'completed' AND t.due_date IS NOT NULL AND t.due_date < NOW()
  )::integer AS overdue_tasks,
  COUNT(*) FILTER (WHERE t.status = 'blocked')::integer AS blocked_tasks,
  COALESCE(SUM(t.estimated_hours) FILTER (WHERE t.status <> 'completed'), 0)::numeric(12,2)
    AS estimated_hours
FROM tasks t
JOIN workspaces w ON w.id = t.department_id AND w.tenant_id = t.tenant_id
JOIN LATERAL (
  SELECT ta.user_id FROM task_assignees ta
  WHERE ta.tenant_id = t.tenant_id AND ta.task_id = t.id
  UNION
  SELECT t.assignee_id WHERE t.assignee_id IS NOT NULL
) person ON TRUE
JOIN users u ON u.id = person.user_id AND u.deleted_at IS NULL
JOIN tenant_memberships tm
  ON tm.tenant_id = t.tenant_id AND tm.user_id = person.user_id AND tm.is_active = true
LEFT JOIN workspace_members wm
  ON wm.tenant_id = t.tenant_id AND wm.workspace_id = t.department_id
  AND wm.user_id = person.user_id
WHERE t.tenant_id = (
    SELECT reader.tenant_id
    FROM analytics.reader_tenants reader
    WHERE reader.login_name = session_user
  )
  AND t.deleted_at IS NULL
GROUP BY t.tenant_id, t.department_id, w.name, person.user_id, u.display_name,
  wm.role, tm.role;

CREATE OR REPLACE VIEW analytics.project_health
WITH (security_barrier = true)
AS
WITH bounds AS (
  SELECT
    DATE_TRUNC('month', NOW()) - INTERVAL '11 months' AS period_from,
    DATE_TRUNC('month', NOW()) + INTERVAL '1 month' AS period_to
), facts AS (
  SELECT task_facts.*
  FROM analytics.task_facts task_facts
  WHERE tenant_id = (
    SELECT reader.tenant_id
    FROM analytics.reader_tenants reader
    WHERE reader.login_name = session_user
  )
), all_ready_events AS (
  SELECT
    facts.tenant_id,
    facts.project_id,
    log.entity_id AS task_id,
    log.created_at AS ready_at,
    LEAD(log.created_at) OVER (
      PARTITION BY log.entity_id ORDER BY log.created_at
    ) AS next_ready_at
  FROM facts
  JOIN activity_logs log
    ON log.tenant_id = facts.tenant_id
    AND log.entity_type = 'task'
    AND log.entity_id = facts.task_id
    AND log.action = 'task:handoff:ready'
), handoff_counts AS (
  SELECT ready.project_id,
    COUNT(*)::integer AS ready_count,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM activity_logs confirmed
      WHERE confirmed.entity_type = 'task'
        AND confirmed.tenant_id = ready.tenant_id
        AND confirmed.entity_id = ready.task_id
        AND confirmed.action = 'task:handoff:confirmed'
        AND confirmed.created_at > ready.ready_at
        AND confirmed.created_at <= ready.ready_at + INTERVAL '48 hours'
        AND (ready.next_ready_at IS NULL OR confirmed.created_at < ready.next_ready_at)
    ))::integer AS success_count
  FROM all_ready_events ready
  CROSS JOIN bounds
  WHERE ready.ready_at >= bounds.period_from AND ready.ready_at < bounds.period_to
  GROUP BY ready.project_id
), workload_by_person AS (
  SELECT facts.project_id, assignee.user_id, COUNT(*)::integer AS active_tasks
  FROM facts
  CROSS JOIN LATERAL UNNEST(COALESCE(facts.assignee_ids, ARRAY[]::uuid[])) assignee(user_id)
  WHERE facts.status <> 'completed'
  GROUP BY facts.project_id, assignee.user_id
), workload AS (
  SELECT project_id,
    CASE WHEN COUNT(*) < 2 OR MAX(active_tasks) = 0 THEN 100
      ELSE ROUND(100.0 * MIN(active_tasks) / MAX(active_tasks))
    END::integer AS workload_balance_score
  FROM workload_by_person
  GROUP BY project_id
), project_measures AS (
  SELECT
    facts.tenant_id,
    facts.department_id,
    facts.department_name,
    facts.project_id,
    facts.project_name,
    bounds.period_from::date,
    (bounds.period_to - INTERVAL '1 millisecond')::date AS period_to,
    COUNT(*)::integer AS task_count,
    COALESCE(
      ROUND(100.0 * COUNT(*) FILTER (
        WHERE completed_on_time
          AND completed_at >= bounds.period_from AND completed_at < bounds.period_to
      ) / NULLIF(COUNT(*) FILTER (
        WHERE completed_at IS NOT NULL AND due_date IS NOT NULL
          AND completed_at >= bounds.period_from AND completed_at < bounds.period_to
      ), 0)),
      100
    )::integer AS on_time_score,
    COALESCE(
      ROUND(100.0 * (1 - COUNT(*) FILTER (WHERE currently_overdue)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE status <> 'completed'), 0))),
      100
    )::integer AS overdue_control_score,
    GREATEST(
      0,
      ROUND(100 - 100.0 * COALESCE(AVG(blocked_age_days) FILTER (WHERE status = 'blocked'), 0) / 30)
    )::integer AS blocked_ageing_score,
    COALESCE(
      ROUND(100.0 * COALESCE(handoff_counts.success_count, 0)
        / NULLIF(handoff_counts.ready_count, 0)),
      100
    )::integer AS handoff_success_score,
    COALESCE(workload.workload_balance_score, 100)::integer AS workload_balance_score
  FROM facts
  CROSS JOIN bounds
  LEFT JOIN handoff_counts ON handoff_counts.project_id = facts.project_id
  LEFT JOIN workload ON workload.project_id = facts.project_id
  GROUP BY facts.tenant_id, facts.department_id, facts.department_name,
    facts.project_id, facts.project_name, bounds.period_from, bounds.period_to,
    handoff_counts.success_count, handoff_counts.ready_count,
    workload.workload_balance_score
)
SELECT
  measures.*,
  ROUND(
    measures.on_time_score * 0.35
    + measures.overdue_control_score * 0.25
    + measures.blocked_ageing_score * 0.20
    + measures.workload_balance_score * 0.10
    + measures.handoff_success_score * 0.10
  )::integer AS health_score,
  CASE
    WHEN ROUND(
      measures.on_time_score * 0.35
      + measures.overdue_control_score * 0.25
      + measures.blocked_ageing_score * 0.20
      + measures.workload_balance_score * 0.10
      + measures.handoff_success_score * 0.10
    ) >= 80 THEN 'green'
    WHEN ROUND(
      measures.on_time_score * 0.35
      + measures.overdue_control_score * 0.25
      + measures.blocked_ageing_score * 0.20
      + measures.workload_balance_score * 0.10
      + measures.handoff_success_score * 0.10
    ) >= 60 THEN 'amber'
    ELSE 'red'
  END AS health_band
FROM project_measures measures
WHERE measures.tenant_id = (
  SELECT reader.tenant_id
  FROM analytics.reader_tenants reader
  WHERE reader.login_name = session_user
);

REVOKE ALL ON ALL TABLES IN SCHEMA analytics FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO openwork_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO openwork_app;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA analytics FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA analytics FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA analytics FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA analytics FROM authenticated;
  END IF;
END;
$$;
GRANT USAGE ON SCHEMA analytics TO cepaa_analytics_reader;
GRANT SELECT ON
  analytics.task_facts,
  analytics.monthly_task_outcomes,
  analytics.workload_snapshot,
  analytics.project_health
TO cepaa_analytics_reader;
