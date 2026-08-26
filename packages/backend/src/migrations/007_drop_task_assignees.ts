import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Migration 004 copies legacy assignees first. The application now uses the
  // canonical tasks.assignee_id column and no longer queries this join table.
  await knex.schema.dropTableIfExists('task_assignees');
}

export async function down(knex: Knex): Promise<void> {
  // Recreate if needed
  const exists = await knex.schema.hasTable('task_assignees');
  if (!exists) {
    await knex.schema.createTable('task_assignees', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.timestamp('assigned_at').notNullable().defaultTo(knex.fn.now());
      table.string('role', 64);
      table.unique(['task_id', 'user_id']);
    });
  }
}
