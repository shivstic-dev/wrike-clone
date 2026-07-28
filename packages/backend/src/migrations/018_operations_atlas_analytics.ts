import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const migrationPath = resolve(
    __dirname,
    '../../../../supabase/migrations/20260728183000_operations_atlas_analytics.sql',
  );
  await knex.raw(await readFile(migrationPath, 'utf8'));
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_tenant_department_created_at');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_tenant_department_completed_at');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_tenant_department_status_due_date');
}
