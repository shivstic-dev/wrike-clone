import { readdirSync } from 'fs';
import { resolve } from 'path';
import type { Knex } from 'knex';
import { down, up } from '../../src/migrations/018_operations_atlas_analytics';

const repositoryRoot = resolve(__dirname, '../../../..');
const migrationWrapperRoot = resolve(repositoryRoot, 'packages/backend/src/migrations');

function recordingKnex(statements: string[]): Knex {
  return {
    raw: async (statement: string) => statements.push(statement),
  } as unknown as Knex;
}

describe('operations atlas analytics migration', () => {
  it('keeps Jest specs out of the Knex migration discovery directory', () => {
    const migrationSpecs = readdirSync(migrationWrapperRoot).filter((filename) =>
      filename.endsWith('.spec.ts'),
    );

    expect(migrationSpecs).toEqual([]);
  });

  it('creates exactly the tenant-scoped dashboard indexes without an external SQL file', async () => {
    const statements: string[] = [];

    await up(recordingKnex(statements));

    expect(statements).toHaveLength(1);
    const sql = statements[0]!.replace(/\r\n/g, '\n');

    expect(sql.match(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/gi)).toHaveLength(3);
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_created_at\n  ON tasks (tenant_id, department_id, created_at);',
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_completed_at\n  ON tasks (tenant_id, department_id, completed_at)\n  WHERE completed_at IS NOT NULL;',
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_tenant_department_status_due_date\n  ON tasks (tenant_id, department_id, status, due_date)\n  WHERE deleted_at IS NULL;',
    );
  });

  it('contains no destructive or security-changing SQL', async () => {
    const statements: string[] = [];

    await up(recordingKnex(statements));

    const sql = statements[0]!.replace(/\r\n/g, '\n');

    expect(sql).not.toMatch(
      /\b(?:DROP|ALTER\s+TABLE|TRUNCATE|DELETE|INSERT|UPDATE|CREATE\s+TABLE|GRANT|REVOKE|POLICY|RLS)\b/i,
    );
  });

  it('rolls back only the analytics indexes', async () => {
    const statements: string[] = [];

    await down(recordingKnex(statements));

    expect(statements).toEqual([
      'DROP INDEX IF EXISTS idx_tasks_tenant_department_created_at',
      'DROP INDEX IF EXISTS idx_tasks_tenant_department_completed_at',
      'DROP INDEX IF EXISTS idx_tasks_tenant_department_status_due_date',
    ]);
  });
});
