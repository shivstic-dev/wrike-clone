import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Set default visibility for existing projects
  await knex.schema.raw(`
    UPDATE projects SET visibility = 'department' WHERE visibility IS NULL;
  `);

  // Set default visibility for existing tasks
  await knex.schema.raw(`
    UPDATE tasks SET visibility = 'department' WHERE visibility IS NULL;
  `);

  // Backfill workspace_members with tenant_memberships for existing workspaces
  // Every existing tenant member becomes a 'member' in all workspaces
  await knex.schema.raw(`
    INSERT INTO workspace_members (id, tenant_id, workspace_id, user_id, role)
    SELECT gen_random_uuid(), tm.tenant_id, w.id, tm.user_id, 'member'
    FROM tenant_memberships tm
    CROSS JOIN workspaces w
    WHERE w.tenant_id = tm.tenant_id
      AND tm.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = w.id AND wm.user_id = tm.user_id
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Data migration — no automatic rollback
}
