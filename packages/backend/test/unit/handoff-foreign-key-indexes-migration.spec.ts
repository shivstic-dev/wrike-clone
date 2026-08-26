import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Knex } from 'knex';

const supabaseMigrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260808110000_handoff_foreign_key_indexes.sql',
);

function loadMigration(): {
  up: (knex: Knex) => Promise<void>;
  down: (knex: Knex) => Promise<void>;
} {
  return require('../../src/migrations/024_handoff_foreign_key_indexes') as {
    up: (knex: Knex) => Promise<void>;
    down: (knex: Knex) => Promise<void>;
  };
}

function recordingKnex(statements: string[]): Knex {
  return {
    raw: async (statement: string) => statements.push(statement),
  } as unknown as Knex;
}

describe('handoff foreign-key indexes migration', () => {
  it('adds covering indexes for both handoff user foreign keys in Knex and Supabase', async () => {
    const statements: string[] = [];
    await loadMigration().up(recordingKnex(statements));

    const knexSql = statements.join('\n').replace(/\s+/gu, ' ').trim();
    const supabaseSql = readFileSync(supabaseMigrationPath, 'utf8').replace(/\s+/gu, ' ').trim();

    expect(knexSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_handoff_owner ON tasks (handoff_owner_id)',
    );
    expect(knexSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_handoff_confirmed_by ON tasks (handoff_confirmed_by)',
    );
    expect(supabaseSql).toBe(knexSql);
  });

  it('drops only the two handoff foreign-key indexes during Knex rollback', async () => {
    const statements: string[] = [];
    await loadMigration().down(recordingKnex(statements));

    const sql = statements.join('\n').replace(/\s+/gu, ' ');
    expect(sql).toContain('DROP INDEX IF EXISTS idx_tasks_handoff_owner');
    expect(sql).toContain('DROP INDEX IF EXISTS idx_tasks_handoff_confirmed_by');
  });
});
