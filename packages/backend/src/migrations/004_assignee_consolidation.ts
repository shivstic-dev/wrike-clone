import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('task_assignees'))) return;

  // Copy first task_assignees row into tasks.assignee_id where tasks.assignee_id is null
  await knex.schema.raw(`
    UPDATE tasks
    SET assignee_id = sub.first_assignee_id
    FROM (
      SELECT DISTINCT ON (task_id) task_id, user_id AS first_assignee_id
      FROM task_assignees
      ORDER BY task_id, assigned_at ASC
    ) sub
    WHERE tasks.id = sub.task_id
      AND tasks.assignee_id IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // No rollback for data migration — re-run seed if needed
}
