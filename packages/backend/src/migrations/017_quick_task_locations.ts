import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const migrationPath = resolve(
    __dirname,
    '../../../../supabase/migrations/20260728114500_quick_task_locations.sql',
  );
  await knex.raw(await readFile(migrationPath, 'utf8'));
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_task_folder_links_home_folder;
    DROP INDEX IF EXISTS ux_task_folder_links_home;
    DROP INDEX IF EXISTS ux_projects_system_folder;
    DROP INDEX IF EXISTS ux_folders_system_general;
    ALTER TABLE projects DROP COLUMN IF EXISTS is_system;
    ALTER TABLE folders DROP COLUMN IF EXISTS is_system_general;
  `);
}
