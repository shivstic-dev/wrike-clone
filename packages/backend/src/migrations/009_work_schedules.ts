import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── working_hours — per-user default working hours ──
  await knex.schema.createTable('working_hours', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('day_of_week').notNullable().checkBetween([0, 6]);
    table.string('start_time', 5).notNullable().defaultTo('09:00');
    table.string('end_time', 5).notNullable().defaultTo('17:00');
    table.timestamps(true, true);
    table.unique(['tenant_id', 'user_id', 'day_of_week']);
  });

  await knex.schema.raw('ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;');
  await knex.schema.raw(`
    CREATE POLICY tenant_isolation ON working_hours FOR ALL
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  // ── time_off — vacation / sick day requests ──
  await knex.schema.createTable('time_off', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.date('date').notNullable();
    table.string('type', 20).notNullable().checkIn(['vacation', 'sick', 'personal']);
    table.text('reason');
    table.string('status', 20).notNullable().defaultTo('pending').checkIn(['pending', 'approved', 'rejected']);
    table.timestamps(true, true);
  });

  await knex.schema.raw('CREATE INDEX idx_to_user ON time_off(user_id);');
  await knex.schema.raw('CREATE INDEX idx_to_tenant ON time_off(tenant_id);');
  await knex.schema.raw('ALTER TABLE time_off ENABLE ROW LEVEL SECURITY;');
  await knex.schema.raw(`
    CREATE POLICY tenant_isolation ON time_off FOR ALL
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  // ── tenant_holidays — company-wide holidays ──
  await knex.schema.createTable('tenant_holidays', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.date('date').notNullable();
    table.string('name', 256).notNullable();
    table.timestamps(true, true);
    table.unique(['tenant_id', 'date']);
  });

  await knex.schema.raw('CREATE INDEX idx_th_tenant ON tenant_holidays(tenant_id);');
  await knex.schema.raw('ALTER TABLE tenant_holidays ENABLE ROW LEVEL SECURITY;');
  await knex.schema.raw(`
    CREATE POLICY tenant_isolation ON tenant_holidays FOR ALL
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tenant_holidays');
  await knex.schema.dropTableIfExists('time_off');
  await knex.schema.dropTableIfExists('working_hours');
}
