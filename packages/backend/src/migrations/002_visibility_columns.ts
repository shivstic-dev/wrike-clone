import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add visibility to projects
  await knex.schema.raw(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS visibility VARCHAR(20)
      NOT NULL DEFAULT 'department'
      CHECK (visibility IN ('organization', 'department'));
  `);

  // Add visibility to tasks
  await knex.schema.raw(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS visibility VARCHAR(20)
      NOT NULL DEFAULT 'department'
      CHECK (visibility IN ('organization', 'department'));
  `);

  // Create indexes
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_visibility ON tasks(visibility);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    ALTER TABLE projects DROP COLUMN IF EXISTS visibility;
    ALTER TABLE tasks DROP COLUMN IF EXISTS visibility;
    DROP INDEX IF EXISTS idx_tasks_visibility;
  `);
}
