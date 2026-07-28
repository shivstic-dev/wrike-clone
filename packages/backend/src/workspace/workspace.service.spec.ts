import knex from 'knex';
import { buildWorkspaceMembersQuery } from './workspace.service';

describe('workspace member effective-role query', () => {
  it('matches department access precedence for admins, department heads, managers, and employees', async () => {
    const db = knex({ client: 'pg' });

    try {
      const query = buildWorkspaceMembersQuery(db, 'department-1', 'tenant-1').toSQL();
      const sql = query.sql.replace(/\s+/g, ' ');

      expect(sql).toContain("WHEN tenant_memberships.role = 'admin' THEN 'admin'");
      expect(sql).toContain("WHEN department_heads.id IS NOT NULL THEN 'department_head'");
      expect(sql).toContain(
        "WHEN tenant_memberships.role = 'manager' OR workspace_members.role = 'manager' THEN 'manager'",
      );
      expect(sql).toContain("ELSE 'employee'");
      expect(sql.indexOf("WHEN tenant_memberships.role = 'admin' THEN 'admin'")).toBeLessThan(
        sql.indexOf("WHEN department_heads.id IS NOT NULL THEN 'department_head'"),
      );
      expect(
        sql.indexOf("WHEN department_heads.id IS NOT NULL THEN 'department_head'"),
      ).toBeLessThan(
        sql.indexOf(
          "WHEN tenant_memberships.role = 'manager' OR workspace_members.role = 'manager' THEN 'manager'",
        ),
      );
      expect(query.bindings).toEqual(expect.arrayContaining([true, 'department-1', 'tenant-1']));
    } finally {
      await db.destroy();
    }
  });

  it('requires an active tenant membership before a workspace member can be returned', async () => {
    const db = knex({ client: 'pg' });

    try {
      const query = buildWorkspaceMembersQuery(db, 'department-1', 'tenant-1').toSQL();
      const sql = query.sql.replace(/\s+/g, ' ');

      expect(sql).toContain('inner join "tenant_memberships"');
      expect(sql).not.toContain('left join "tenant_memberships"');
      expect(sql).toContain('"tenant_memberships"."is_active" = ?');
      expect(query.bindings).toContain(true);
    } finally {
      await db.destroy();
    }
  });
});
