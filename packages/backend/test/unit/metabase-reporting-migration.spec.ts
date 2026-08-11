import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../../../..');
const sqlPath = resolve(
  root,
  'supabase/migrations/20260811123000_metabase_reporting_layer.sql',
);
const wrapperPath = resolve(
  root,
  'packages/backend/src/migrations/024_metabase_reporting_layer.ts',
);

describe('Metabase reporting migration', () => {
  it('installs only tenant-pinned curated views for a non-login reader role', () => {
    expect(existsSync(sqlPath)).toBe(true);
    expect(existsSync(wrapperPath)).toBe(true);
    if (!existsSync(sqlPath) || !existsSync(wrapperPath)) return;

    const sql = readFileSync(sqlPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();
    expect(sql).toContain('create schema if not exists analytics');
    expect(sql).toContain('create role cepaa_analytics_reader nologin');
    expect(sql).toContain('nobypassrls');
    expect(sql).toContain('alter role cepaa_analytics_reader nologin');
    expect(sql).toContain('create table if not exists analytics.reader_tenants');
    expect(sql).toContain('login_name = session_user');
    expect(sql.match(/login_name = session_user/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).not.toContain("current_setting('app.metabase_tenant_id'");
    expect(sql).toContain('create or replace view analytics.task_facts');
    expect(sql).toContain('create or replace view analytics.monthly_task_outcomes');
    expect(sql).toContain('create or replace view analytics.workload_snapshot');
    expect(sql).toContain('create or replace view analytics.project_health');
    expect(sql).toContain('as created_count');
    expect(sql).toContain("date_trunc('month', completed_at)");
    expect(sql).toContain("date_trunc('month', due_date)");
    expect(sql).toContain("date_trunc('month', now()) - interval '11 months'");
    expect(sql).toContain("log.action = 'task:handoff:ready'");
    expect(sql).toContain("log.action = 'task:status:changed'");
    expect(sql.match(/task:handoff:confirmed/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain('cross join lateral unnest');
    expect(sql).toContain('security_barrier = true');
    expect(sql).toContain('revoke all on schema analytics from public');
    expect(sql).toContain("rolname = 'anon'");
    expect(sql).toContain("rolname = 'authenticated'");
    expect(sql).toContain('grant select on analytics.task_facts');
    expect(sql).not.toContain('grant select on all tables in schema analytics');
    expect(sql).not.toContain('grant select on analytics.reader_tenants');
    expect(sql).toContain('revoke execute on all functions in schema public from public');
    expect(sql).toContain('grant execute on all functions in schema public to openwork_app');
    expect(sql).not.toContain('email');
    expect(sql).not.toContain('description');
    expect(sql).not.toContain('service_role');

    const wrapper = readFileSync(wrapperPath, 'utf8');
    expect(wrapper).toContain('20260811123000_metabase_reporting_layer.sql');
  });
});
