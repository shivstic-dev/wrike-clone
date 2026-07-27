import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('workspace_members')) return;

  await knex.schema.createTable('workspace_members', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table
      .uuid('workspace_id')
      .notNullable()
      .references('id')
      .inTable('workspaces')
      .onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('role').notNullable().checkIn(['dept_admin', 'member']);
    table.timestamps(true, true);
    table.unique(['workspace_id', 'user_id']);
  });

  await knex.schema.raw(`
    CREATE INDEX idx_wm_user ON workspace_members(user_id);
    CREATE INDEX idx_wm_workspace ON workspace_members(workspace_id);
  `);

  // Enable RLS
  await knex.schema.raw('ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;');
  await knex.schema.raw(`
    CREATE POLICY tenant_isolation ON workspace_members FOR ALL
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('workspace_members');
}
