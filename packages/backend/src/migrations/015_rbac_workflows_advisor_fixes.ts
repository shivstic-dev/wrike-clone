import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const migrationPath = resolve(
    __dirname,
    '../../../../supabase/migrations/20260727203332_rbac_workflows_advisor_fixes.sql',
  );
  await knex.raw(await readFile(migrationPath, 'utf8'));
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_task_assignees_assigned_by');
}
