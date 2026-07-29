import { readFileSync } from 'fs';
import { resolve } from 'path';

const sqlPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260730101000_timeline_integrity.sql',
);

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
});
