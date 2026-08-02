import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Knex } from 'knex';
import { down, up } from '../../src/migrations/021_handoff_confirmation';

const sql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260730100000_handoff_confirmation.sql'),
  'utf8',
);

describe('handoff confirmation migration', () => {
  it('adds the handoff state columns, confirmation invariants, completed-task backfill, and ready-task index', () => {
    expect(sql).toContain("handoff_status IN ('pending', 'ready', 'confirmed', 'not_required')");
    expect(sql).toContain("handoff_status <> 'confirmed'");
    expect(sql).toContain('handoff_confirmed_by IS NOT NULL AND handoff_confirmed_at IS NOT NULL');
    expect(sql).toContain('handoff_required BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('handoff_owner_id UUID');
    expect(sql).toContain('handoff_confirmed_by UUID');
    expect(sql).toContain('idx_tasks_tenant_handoff_ready');
    expect(sql).toMatch(/status = 'completed'[\s\S]*handoff_status = 'not_required'/);
  });

  it('adds and removes the confirmation constraint in the Knex representation', async () => {
    const statements: string[] = [];
    const column = {
      notNullable: () => column,
      defaultTo: () => column,
      nullable: () => column,
      references: () => column,
      inTable: () => column,
      onDelete: () => column,
    };
    const migrationKnex = {
      raw: async (statement: string) => statements.push(statement),
      schema: {
        hasColumn: async () => false,
        alterTable: async (_name: string, callback: (table: any) => void) => callback({
          boolean: () => column,
          string: () => column,
          uuid: () => column,
          timestamp: () => column,
          dropColumn: () => undefined,
        }),
      },
    } as unknown as Knex;

    await up(migrationKnex);
    await down(migrationKnex);

    expect(statements.join('\n')).toContain('tasks_handoff_confirmation_check');
    expect(statements.join('\n')).toContain("handoff_status <> 'confirmed'");
    expect(statements.join('\n')).toContain('DROP CONSTRAINT IF EXISTS tasks_handoff_confirmation_check');
  });
});
