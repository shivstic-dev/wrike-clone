import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Knex } from 'knex';

/**
 * Establish the baseline for fresh installations. Existing deployments are
 * detected by the tenants table and record the baseline without rebuilding it.
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('tenants')) return;

  const schemaPath = resolve(
    __dirname,
    '../../../../supabase/migrations/20260727105057_production_baseline.sql',
  );
  await knex.raw(await readFile(schemaPath, 'utf8'));
}

export async function down(): Promise<void> {
  throw new Error('The production baseline cannot be rolled back automatically');
}
