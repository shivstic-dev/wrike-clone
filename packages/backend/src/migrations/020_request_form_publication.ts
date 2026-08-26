import { Knex } from 'knex';

/**
 * Adds an explicit publication switch for external request-form access.
 * Existing forms are intentionally private after the migration.
 */
export async function up(knex: Knex): Promise<void> {
  const hasPublicationColumn = await knex.schema.hasColumn('request_forms', 'is_public');
  if (!hasPublicationColumn) {
    await knex.schema.alterTable('request_forms', (table) => {
      table.boolean('is_public').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPublicationColumn = await knex.schema.hasColumn('request_forms', 'is_public');
  if (hasPublicationColumn) {
    await knex.schema.alterTable('request_forms', (table) => {
      table.dropColumn('is_public');
    });
  }
}
