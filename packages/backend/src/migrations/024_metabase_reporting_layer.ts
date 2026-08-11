import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const migrationPath = resolve(
    __dirname,
    '../../../../supabase/migrations/20260811123000_metabase_reporting_layer.sql',
  );
  await knex.raw(await readFile(migrationPath, 'utf8'));
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    REVOKE ALL ON ALL TABLES IN SCHEMA analytics FROM cepaa_analytics_reader;
    REVOKE USAGE ON SCHEMA analytics FROM cepaa_analytics_reader;
    DROP VIEW IF EXISTS analytics.project_health;
    DROP VIEW IF EXISTS analytics.workload_snapshot;
    DROP VIEW IF EXISTS analytics.monthly_task_outcomes;
    DROP VIEW IF EXISTS analytics.task_facts;
    DROP TABLE IF EXISTS analytics.reader_tenants;
    DROP SCHEMA IF EXISTS analytics;
  `);
}
