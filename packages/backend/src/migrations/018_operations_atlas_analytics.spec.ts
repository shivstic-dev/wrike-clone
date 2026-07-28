import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Knex } from 'knex';
import { down } from './018_operations_atlas_analytics';

describe('operations atlas analytics migration', () => {
  it('creates only the tenant-scoped dashboard indexes with their query predicates', async () => {
    const sql = await readFile(
      resolve(
        __dirname,
        '../../../../supabase/migrations/20260728183000_operations_atlas_analytics.sql',
      ),
      'utf8',
    );

    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_created_at\n  ON tasks (tenant_id, department_id, created_at);',
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_completed_at\n  ON tasks (tenant_id, department_id, completed_at)\n  WHERE completed_at IS NOT NULL;',
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_status_due_date\n  ON tasks (tenant_id, department_id, status, due_date)\n  WHERE deleted_at IS NULL;',
    );
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM|UPDATE\s+tasks|ALTER TABLE/i);
  });

  it('rolls back only the analytics indexes', async () => {
    const statements: string[] = [];
    const knex = {
      raw: async (statement: string) => statements.push(statement),
    } as unknown as Knex;

    await down(knex);

    expect(statements).toEqual([
      'DROP INDEX IF EXISTS idx_tasks_tenant_department_created_at',
      'DROP INDEX IF EXISTS idx_tasks_tenant_department_completed_at',
      'DROP INDEX IF EXISTS idx_tasks_tenant_department_status_due_date',
    ]);
  });
});
