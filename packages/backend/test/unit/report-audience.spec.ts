import knex, { type Knex } from 'knex';
import { tenantContext } from '../../src/common/tenant-context';
import type { DepartmentRole } from '../../src/rbac/department-access.service';
import {
  buildExactAudience,
  buildManagerAudience,
  buildUnrestrictedAudience,
  resolveReportMode,
  type ReportDepartmentMember,
} from '../../src/reports/report-audience';
import { ReportService } from '../../src/reports/report.service';

describe('resolveReportMode', () => {
  it.each([
    ['employee', 'self'],
    ['manager', 'combined'],
    ['department_head', 'combined'],
    ['admin', 'combined'],
  ] satisfies Array<[DepartmentRole, 'self' | 'combined']>)(
    'defaults %s to %s',
    (role, expected) => {
      expect(resolveReportMode(role, undefined)).toBe(expected);
    },
  );

  it.each([
    ['manager', 'self'],
    ['department_head', 'individual'],
    ['admin', 'combined'],
  ] satisfies Array<[DepartmentRole, 'self' | 'individual' | 'combined']>)(
    'preserves an explicit %s report mode of %s',
    (role, requested) => {
      expect(resolveReportMode(role, requested)).toBe(requested);
    },
  );

  it.each(['individual', 'combined'] as const)(
    'does not let an employee request %s',
    (requested) => {
      expect(() => resolveReportMode('employee', requested)).toThrow(
        'Employees may only run reports for themselves',
      );
    },
  );
});

describe('buildManagerAudience', () => {
  const members: ReportDepartmentMember[] = [
    { userId: 'manager-1', role: 'manager', isDepartmentHead: false },
    { userId: 'manager-2', role: 'manager', isDepartmentHead: false },
    { userId: 'employee-1', role: 'employee', isDepartmentHead: false },
    { userId: 'head-1', role: 'department_head', isDepartmentHead: true },
    { userId: 'head-stored-as-employee', role: 'employee', isDepartmentHead: true },
    { userId: 'admin-1', role: 'admin', isDepartmentHead: false },
  ];

  it('includes self, employees, and peer managers but excludes heads and admins', () => {
    expect(buildManagerAudience('manager-1', members)).toEqual({
      userIds: ['manager-1', 'manager-2', 'employee-1'],
      includeUnassigned: true,
    });
  });
});

describe('ReportService department-member audience query', () => {
  it('classifies active tenant admins before department roles so managers cannot target them', async () => {
    const queryCompiler = knex({ client: 'pg' });
    let compiledMemberQuery: Knex.Sql | undefined;
    const effectiveMembers: ReportDepartmentMember[] = [
      { userId: 'admin-1', role: 'admin', isDepartmentHead: false },
      { userId: 'manager-2', role: 'manager', isDepartmentHead: false },
      { userId: 'employee-1', role: 'employee', isDepartmentHead: false },
    ];
    const db = ((tableName: string) => {
      const query = queryCompiler(tableName);
      if (tableName === 'workspace_members') {
        const compile = query.toSQL.bind(query);
        query.then = ((onFulfilled, onRejected) => {
          compiledMemberQuery = compile();
          return Promise.resolve(effectiveMembers).then(onFulfilled, onRejected);
        }) as typeof query.then;
      }
      return query;
    }) as Knex;
    db.raw = queryCompiler.raw.bind(queryCompiler);
    const departmentAccess = {
      getReportScope: jest.fn().mockResolvedValue({
        departmentId: 'department-1',
        role: 'manager',
        ownTasksOnly: false,
      }),
    };
    const service = new ReportService(db, departmentAccess as never);

    try {
      const audience = await tenantContext.run(
        {
          tenantId: 'tenant-1',
          userId: 'manager-1',
          membershipId: 'membership-1',
          role: 'manager',
          permissions: [],
        },
        () => (service as any).resolveAudience({ departmentId: 'department-1' }),
      );
      const sql = compiledMemberQuery!.sql.replace(/\s+/g, ' ');
      const adminBranch = "WHEN tenant_memberships.role = 'admin' THEN 'admin'";
      const headBranch = "WHEN department_heads.id IS NOT NULL THEN 'department_head'";

      expect(sql).toContain(adminBranch);
      expect(sql.indexOf(adminBranch)).toBeLessThan(sql.indexOf(headBranch));
      expect(sql).toContain('inner join "tenant_memberships"');
      expect(sql).toContain('"tenant_memberships"."is_active" = ?');
      expect(compiledMemberQuery!.bindings).toEqual(
        expect.arrayContaining(['tenant-1', 'department-1', true]),
      );
      expect(audience.userIds).toEqual(['manager-1', 'manager-2', 'employee-1']);
      expect(audience.allowedTargetUserIds).toEqual([
        'manager-1',
        'manager-2',
        'employee-1',
      ]);
    } finally {
      await queryCompiler.destroy();
    }
  });
});

describe('exact and unrestricted report audiences', () => {
  it('limits an exact audience to the requested user and excludes unassigned work', () => {
    expect(buildExactAudience('user-1')).toEqual({
      userIds: ['user-1'],
      includeUnassigned: false,
    });
  });

  it('leaves an unrestricted audience unbounded and includes unassigned work', () => {
    expect(buildUnrestrictedAudience()).toEqual({
      userIds: null,
      includeUnassigned: true,
    });
  });
});
