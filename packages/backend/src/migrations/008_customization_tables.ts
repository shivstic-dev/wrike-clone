import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('workspace_statuses')) return;

  // ── workspace_statuses — custom workflow statuses per workspace ──
  await knex.schema.createTable('workspace_statuses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table
      .uuid('workspace_id')
      .notNullable()
      .references('id')
      .inTable('workspaces')
      .onDelete('CASCADE');
    table.string('name', 128).notNullable();
    table.string('color', 7).notNullable().defaultTo('#6366f1');
    table.string('category', 32).notNullable().defaultTo('custom');
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamps(true, true);
  });

  await knex.schema.raw(`
    CREATE INDEX idx_ws_workspace ON workspace_statuses(workspace_id);
    CREATE INDEX idx_ws_tenant ON workspace_statuses(tenant_id);
  `);

  await knex.schema.raw('ALTER TABLE workspace_statuses ENABLE ROW LEVEL SECURITY;');
  await knex.schema.raw('ALTER TABLE workspace_statuses FORCE ROW LEVEL SECURITY;');
  await knex.schema.raw(`
    CREATE POLICY tenant_isolation ON workspace_statuses FOR ALL
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  // ── project_templates — blueprint templates ──
  await knex.schema.createTable('project_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.string('name', 256).notNullable();
    table.text('description');
    table.uuid('source_project_id').references('id').inTable('projects').onDelete('SET NULL');
    table.jsonb('task_template').notNullable().defaultTo('[]');
    table.timestamps(true, true);
  });

  await knex.schema.raw(`
    CREATE INDEX idx_pt_tenant ON project_templates(tenant_id);
  `);

  await knex.schema.raw('ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;');
  await knex.schema.raw('ALTER TABLE project_templates FORCE ROW LEVEL SECURITY;');
  await knex.schema.raw(`
    CREATE POLICY tenant_isolation ON project_templates FOR ALL
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  // ── request_forms — dynamic intake forms ──
  await knex.schema.createTable('request_forms', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.string('name', 256).notNullable();
    table.text('description');
    table.uuid('folder_id').notNullable().references('id').inTable('folders').onDelete('CASCADE');
    table.jsonb('form_fields').notNullable().defaultTo('[]');
    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.timestamps(true, true);
  });

  await knex.schema.raw(`
    CREATE INDEX idx_rf_tenant ON request_forms(tenant_id);
    CREATE INDEX idx_rf_folder ON request_forms(folder_id);
  `);

  await knex.schema.raw('ALTER TABLE request_forms ENABLE ROW LEVEL SECURITY;');
  await knex.schema.raw('ALTER TABLE request_forms FORCE ROW LEVEL SECURITY;');
  await knex.schema.raw(`
    CREATE POLICY tenant_isolation ON request_forms FOR ALL
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('request_forms');
  await knex.schema.dropTableIfExists('project_templates');
  await knex.schema.dropTableIfExists('workspace_statuses');
}
