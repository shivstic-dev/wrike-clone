import type { DepartmentRole } from '../../src/rbac/department-access.service';
import {
  buildExactAudience,
  buildManagerAudience,
  buildUnrestrictedAudience,
  resolveReportMode,
  type ReportDepartmentMember,
} from '../../src/reports/report-audience';

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
  ];

  it('includes self and employees but excludes heads and other managers', () => {
    expect(buildManagerAudience('manager-1', members)).toEqual({
      userIds: ['manager-1', 'employee-1'],
      includeUnassigned: true,
    });
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
