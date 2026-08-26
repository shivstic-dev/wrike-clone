import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_tenant_project_status_deleted
      ON tasks(tenant_id, project_id, status, deleted_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_active_project_status
      ON tasks(tenant_id, project_id, status) WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_tasks_tenant_due_status
      ON tasks(tenant_id, due_date, status, deleted_at) WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_projects_tenant_folder_status
      ON projects(tenant_id, folder_id, status, deleted_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status
      ON tasks(assignee_id, status, deleted_at) WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_comments_task_created
      ON task_comments(task_id, created_at) WHERE deleted_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_tasks_tenant_project_status_deleted;
    DROP INDEX IF EXISTS idx_tasks_active_project_status;
    DROP INDEX IF EXISTS idx_tasks_tenant_due_status;
    DROP INDEX IF EXISTS idx_projects_tenant_folder_status;
    DROP INDEX IF EXISTS idx_tasks_assignee_status;
    DROP INDEX IF EXISTS idx_comments_task_created;
  `);
}
