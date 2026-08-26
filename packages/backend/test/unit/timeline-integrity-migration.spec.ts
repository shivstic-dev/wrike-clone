import { readFileSync } from 'fs';
import { resolve } from 'path';
import { down } from '../../src/migrations/022_timeline_integrity';

const sqlPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260730101000_timeline_integrity.sql',
);
const knexMigrationPath = resolve(
  __dirname,
  '../../src/migrations/022_timeline_integrity.ts',
);

function normalizedSql(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

describe('timeline integrity migration', () => {
  it('backfills tenant data and adds timeline integrity protections', () => {
    const sql = readFileSync(sqlPath, 'utf8');

    expect(sql).toContain('UPDATE task_dependencies td');
    expect(sql).toContain('SET tenant_id = t.tenant_id');
    expect(sql).toContain('dependency_type IN');
    expect(sql).toContain('lag_days >= 0');
    expect(sql).toContain('idx_task_dependencies_tenant_task');
    expect(sql).toContain('idx_tasks_tenant_timeline_dates');
  });

  it('rejects cross-tenant edges before backfilling their tenant', () => {
    const sql = readFileSync(sqlPath, 'utf8');
    const guard = sql.indexOf('predecessor_task.tenant_id IS DISTINCT FROM dependent_task.tenant_id');
    const backfill = sql.indexOf('UPDATE task_dependencies td');

    expect(guard).toBeGreaterThan(-1);
    expect(sql).toContain('task_dependencies contains cross-tenant dependency edges');
    expect(guard).toBeLessThan(backfill);
  });

  it('rejects null dependency types and makes the column non-null before checks', () => {
    const sql = readFileSync(sqlPath, 'utf8');
    const nullGuard = sql.indexOf('dependency_type IS NULL');
    const constraint = sql.indexOf('task_dependencies_dependency_type_check');

    expect(nullGuard).toBeGreaterThan(-1);
    expect(sql).toContain('task_dependencies contains a NULL or unsupported dependency_type');
    expect(sql).toContain('ALTER COLUMN dependency_type SET NOT NULL');
    expect(nullGuard).toBeLessThan(constraint);
    expect(sql).toContain('ALTER COLUMN lag_days SET NOT NULL');
  });

  it('keeps Knex and Supabase migration SQL equivalent', () => {
    const supabaseSql = readFileSync(sqlPath, 'utf8');
    const knexSource = readFileSync(knexMigrationPath, 'utf8');
    const knexSql = knexSource.match(/const timelineIntegritySql = `([\s\S]*?)`;/u)?.[1];

    expect(knexSql).toBeDefined();
    expect(normalizedSql(knexSql!)).toBe(normalizedSql(supabaseSql));
  });

  it('has a documented no-op Knex rollback for the Supabase-owned production schema', async () => {
    const raw = jest.fn();

    await down({ raw } as never);

    expect(raw).not.toHaveBeenCalled();
    expect(readFileSync(knexMigrationPath, 'utf8')).toContain('Supabase owns the shared production schema');
  });
});
