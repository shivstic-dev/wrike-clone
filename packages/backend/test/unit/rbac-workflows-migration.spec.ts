import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('RBAC workflow migration', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../../supabase/migrations/20260727201506_rbac_workflows.sql'),
    'utf8',
  );

  it('keeps multi-assignee rows unique and cascade-deletes them with tasks', () => {
    expect(sql).toContain('CREATE TABLE task_assignees');
    expect(sql).toContain('REFERENCES tasks(id) ON DELETE CASCADE');
    expect(sql).toContain('UNIQUE (task_id, user_id)');
    expect(sql).toContain('idx_task_assignees_one_primary');
    expect(sql).toContain('idx_task_assignees_assigned_by');
  });

  it('stores every employee/manager role change in a tenant-isolated audit table', () => {
    expect(sql).toContain('CREATE TABLE role_change_log');
    expect(sql).toContain("old_role IN ('employee', 'manager')");
    expect(sql).toContain('ALTER TABLE role_change_log FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY tenant_isolation ON role_change_log');
  });
});
