import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Columns already added in migration 003; this migration ensures indexes exist
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_users_email_active ON users(email, is_active);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_users_email_active;`);
}
