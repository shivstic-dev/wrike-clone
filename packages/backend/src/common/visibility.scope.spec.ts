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

  it('lets department managers read employee and peer-manager assignments', () => {
    const db = knex({ client: 'pg' });
    const query = applyTaskAccessScope(db('tasks').select('tasks.id'), context).toSQL();
    const sql = query.sql.replace(/\s+/g, ' ');

    expect(sql).toContain('"visible_primary_wm"."role" in (?, ?)');
    expect(sql).toContain('visible_primary_wm.workspace_id = tasks.department_id');
    expect(sql).toContain('"visible_primary_wm"."tenant_id" = ?');
    expect(sql).toContain('"visible_additional_wm"."role" in (?, ?)');
    expect(query.bindings).toEqual(expect.arrayContaining(['employee', 'manager']));
    db.destroy();
  });

  it('requires the requesting manager to be an active non-admin non-head member', () => {
    const db = knex({ client: 'pg' });
    const query = applyTaskAccessScope(db('tasks').select('tasks.id'), context).toSQL();
    const sql = query.sql.replace(/\s+/g, ' ');

    expect(sql).toContain('inner join "tenant_memberships" as "actor_tm"');
    expect(sql).toContain('"actor_tm"."is_active" = ?');
    expect(sql).toContain('not "actor_tm"."role" = ?');
    expect(sql).toContain('from "department_heads" as "actor_dh"');
    expect(query.bindings).toEqual(expect.arrayContaining([true, 'admin']));
    db.destroy();
  });

  it('excludes inactive tenant admins and department heads from primary and additional manager audiences', () => {
    const db = knex({ client: 'pg' });
    const query = applyTaskAccessScope(db('tasks').select('tasks.id'), context).toSQL();
    const sql = query.sql.replace(/\s+/g, ' ');

    expect(sql).toContain('inner join "tenant_memberships" as "visible_primary_tm"');
    expect(sql).toContain('"visible_primary_tm"."is_active" = ?');
    expect(sql).toContain('not "visible_primary_tm"."role" = ?');
    expect(sql).toContain('from "department_heads" as "visible_primary_dh"');
    expect(sql).toContain('inner join "tenant_memberships" as "visible_additional_tm"');
    expect(sql).toContain('"visible_additional_tm"."is_active" = ?');
    expect(sql).toContain('not "visible_additional_tm"."role" = ?');
    expect(sql).toContain('from "department_heads" as "visible_additional_dh"');
    expect(query.bindings.filter((binding) => binding === true)).toHaveLength(3);
    expect(query.bindings.filter((binding) => binding === 'admin')).toHaveLength(3);
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
