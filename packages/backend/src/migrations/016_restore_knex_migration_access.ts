import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const migrationPath = resolve(
    __dirname,
    '../../../../supabase/migrations/20260727205042_restore_knex_migration_access.sql',
  );
  await knex.raw(await readFile(migrationPath, 'utf8'));
}

export async function down(): Promise<void> {
  throw new Error('Knex migration bookkeeping access cannot be disabled safely');
}
