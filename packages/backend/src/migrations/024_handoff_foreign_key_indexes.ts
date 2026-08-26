import type { Knex } from 'knex';

const handoffForeignKeyIndexSql = `
CREATE INDEX IF NOT EXISTS idx_tasks_handoff_owner
  ON tasks (handoff_owner_id);

CREATE INDEX IF NOT EXISTS idx_tasks_handoff_confirmed_by
  ON tasks (handoff_confirmed_by);
`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(handoffForeignKeyIndexSql);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_tasks_handoff_confirmed_by;
    DROP INDEX IF EXISTS idx_tasks_handoff_owner;
  `);
}
