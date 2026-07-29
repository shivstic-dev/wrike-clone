import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_created_at
  ON tasks (tenant_id, department_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_completed_at
  ON tasks (tenant_id, department_id, completed_at)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_status_due_date
  ON tasks (tenant_id, department_id, status, due_date)
  WHERE deleted_at IS NULL;`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_tenant_department_created_at');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_tenant_department_completed_at');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_tenant_department_status_due_date');
}
