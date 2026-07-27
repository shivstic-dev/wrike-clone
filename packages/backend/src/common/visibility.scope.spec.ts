import knex from 'knex';
import { applyTaskAccessScope } from './visibility.scope';

describe('role-aware task visibility SQL', () => {
  const context = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    userId: '00000000-0000-0000-0000-000000000002',
    membershipId: '00000000-0000-0000-0000-000000000003',
    role: 'member',
    permissions: [],
  };

  it('scopes non-admin task reads to assignments and department leadership', () => {
    const db = knex({ client: 'pg' });
    const query = applyTaskAccessScope(db('tasks').select('tasks.id'), context).toSQL();

    expect(query.sql).toContain('task_assignees');
    expect(query.sql).toContain('department_heads');
    expect(query.sql).toContain('workspace_members');
    expect(query.sql).not.toContain('"tasks"."visibility" = ?');
    expect(query.bindings).toContain(context.userId);
    db.destroy();
  });

  it('does not add the employee scope for tenant admins', () => {
    const db = knex({ client: 'pg' });
    const query = applyTaskAccessScope(db('tasks').select('tasks.id'), {
      ...context,
      role: 'admin',
    }).toSQL();

    expect(query.sql).not.toContain('task_assignees');
    db.destroy();
  });
});
