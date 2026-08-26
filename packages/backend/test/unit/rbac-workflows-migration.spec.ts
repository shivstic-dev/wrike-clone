import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('RBAC workflow migration', () => {
  const workflowSql = readFileSync(
    resolve(__dirname, '../../../../supabase/migrations/20260727203157_rbac_workflows.sql'),
    'utf8',
  );
  const advisorFixSql = readFileSync(
    resolve(
      __dirname,
      '../../../../supabase/migrations/20260727203332_rbac_workflows_advisor_fixes.sql',
    ),
    'utf8',
  );

  it('keeps multi-assignee rows unique and cascade-deletes them with tasks', () => {
    expect(workflowSql).toContain('CREATE TABLE task_assignees');
    expect(workflowSql).toContain('REFERENCES tasks(id) ON DELETE CASCADE');
    expect(workflowSql).toContain('UNIQUE (task_id, user_id)');
    expect(workflowSql).toContain('idx_task_assignees_one_primary');
    expect(advisorFixSql).toContain('idx_task_assignees_assigned_by');
  });

  it('stores every employee/manager role change in a tenant-isolated audit table', () => {
    expect(workflowSql).toContain('CREATE TABLE role_change_log');
    expect(workflowSql).toContain("old_role IN ('employee', 'manager')");
    expect(workflowSql).toContain('ALTER TABLE role_change_log FORCE ROW LEVEL SECURITY');
    expect(workflowSql).toContain('CREATE POLICY tenant_isolation ON role_change_log');
  });
});
