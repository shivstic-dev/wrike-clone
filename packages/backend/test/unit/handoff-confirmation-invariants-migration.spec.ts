import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Knex } from 'knex';

const supabaseMigrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260803090000_handoff_confirmation_invariants.sql',
);

function loadMigration(): { up: (knex: Knex) => Promise<void> } {
  return require('../../src/migrations/023_handoff_confirmation_invariants') as {
    up: (knex: Knex) => Promise<void>;
  };
}

function recordingKnex(statements: string[]): Knex {
  return {
    raw: async (statement: string) => statements.push(statement),
  } as unknown as Knex;
}

describe('handoff confirmation invariant reconciliation migration', () => {
  it('conservatively reopens unverifiable confirmed handoffs before adding both constraints', async () => {
    const statements: string[] = [];

    await loadMigration().up(recordingKnex(statements));

    const sql = statements.join('\n').replace(/\s+/gu, ' ');
    const reconciliation = sql.indexOf("handoff_status = 'ready'");
    const constraints = sql.indexOf('tasks_handoff_status_check');

    expect(sql).toContain("WHERE handoff_status = 'confirmed'");
    expect(sql).toContain('handoff_confirmed_by IS NULL OR handoff_confirmed_at IS NULL');
    expect(sql).toContain("status = CASE WHEN status = 'completed' THEN 'in_progress' ELSE status END");
    expect(sql).toContain('completed_at = CASE WHEN status = \'completed\' THEN NULL ELSE completed_at END');
    expect(sql).toContain('handoff_ready_at = COALESCE(handoff_ready_at, NOW())');
    expect(reconciliation).toBeGreaterThan(-1);
    expect(constraints).toBeGreaterThan(reconciliation);
    expect(sql).toContain('tasks_handoff_status_check');
    expect(sql).toContain('tasks_handoff_confirmation_check');
  });

  it('keeps the Supabase forward migration aligned with the Knex reconciliation policy', async () => {
    const statements: string[] = [];
    await loadMigration().up(recordingKnex(statements));

    const knexSql = statements.join('\n').replace(/\s+/gu, ' ').trim();
    const supabaseSql = readFileSync(supabaseMigrationPath, 'utf8')
      .replace(/\s+/gu, ' ')
      .trim();

    expect(supabaseSql).toBe(knexSql);
  });
});
