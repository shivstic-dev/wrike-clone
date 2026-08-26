import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_handoff_status_check;

    ALTER TABLE tasks
    ADD CONSTRAINT tasks_handoff_status_check
    CHECK (handoff_status IN ('pending', 'ready', 'confirmed', 'not_required'));
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_handoff_status_check;
  `);
}
