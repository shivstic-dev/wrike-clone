import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasHandoffRequired = await knex.schema.hasColumn('tasks', 'handoff_required');
  if (!hasHandoffRequired) {
    await knex.schema.alterTable('tasks', (table) => {
      table.boolean('handoff_required').notNullable().defaultTo(true);
      table.string('handoff_status').notNullable().defaultTo('pending');
      table.uuid('handoff_owner_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('handoff_ready_at', { useTz: true }).nullable();
      table.uuid('handoff_confirmed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('handoff_confirmed_at', { useTz: true }).nullable();
    });

    await knex.raw(`
      UPDATE tasks
      SET handoff_required = false,
          handoff_status = 'not_required',
          handoff_owner_id = created_by_id
      WHERE status = 'completed';
    `);

    await knex.raw(`
      UPDATE tasks
      SET handoff_owner_id = created_by_id
      WHERE handoff_owner_id IS NULL;
    `);

    await knex.raw(`
      ALTER TABLE tasks
        ADD CONSTRAINT tasks_handoff_status_check
        CHECK (handoff_status IN ('pending', 'ready', 'confirmed', 'not_required'));
    `);

    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_tasks_tenant_handoff_ready
      ON tasks (tenant_id, handoff_owner_id, handoff_ready_at DESC)
      WHERE deleted_at IS NULL AND handoff_status = 'ready';
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_tenant_handoff_ready;');
  await knex.raw('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_handoff_status_check;');
  await knex.schema.alterTable('tasks', (table) => {
    table.dropColumn('handoff_confirmed_at');
    table.dropColumn('handoff_confirmed_by');
    table.dropColumn('handoff_ready_at');
    table.dropColumn('handoff_owner_id');
    table.dropColumn('handoff_status');
    table.dropColumn('handoff_required');
  });
}
