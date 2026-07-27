import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const migrationPath = resolve(
    __dirname,
    '../../../../supabase/migrations/20260727115821_department_dashboard_v1.sql',
  );
  await knex.raw(await readFile(migrationPath, 'utf8'));
}

export async function down(): Promise<void> {
  throw new Error('The department dashboard migration cannot be rolled back automatically');
}
