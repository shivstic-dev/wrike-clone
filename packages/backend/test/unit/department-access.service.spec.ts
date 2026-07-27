import { ForbiddenException } from '@nestjs/common';
import { DepartmentAccessService } from '../../src/rbac/department-access.service';
import { tenantContext } from '../../src/common/tenant-context';

type Row = Record<string, unknown>;

function createDatabase(rows: {
  memberships: Row[];
  workspaceMembers: Row[];
  departmentHeads: Row[];
}) {
  return jest.fn((table: string) => {
    let criteria: Row = {};
    return {
      where(value: Row) {
        criteria = { ...criteria, ...value };
        return this;
      },
      async first() {
        const source =
          table === 'tenant_memberships'
            ? rows.memberships
            : table === 'workspace_members'
              ? rows.workspaceMembers
              : rows.departmentHeads;
        return source.find((row) =>
          Object.entries(criteria).every(([key, value]) => row[key] === value),
        );
      },
    };
  });
}

describe('DepartmentAccessService authorization matrix', () => {
  const userId = 'user-1';
  const tenantId = 'tenant-1';
  const db = createDatabase({
    memberships: [
      { tenant_id: tenantId, user_id: userId, role: 'member', is_active: true },
      { tenant_id: tenantId, user_id: 'admin-1', role: 'admin', is_active: true },
    ],
    workspaceMembers: [
      { tenant_id: tenantId, workspace_id: 'department-a', user_id: userId, role: 'employee' },
      { tenant_id: tenantId, workspace_id: 'department-b', user_id: userId, role: 'employee' },
    ],
    departmentHeads: [{ tenant_id: tenantId, department_id: 'department-a', user_id: userId }],
  });
  const service = new DepartmentAccessService(db as never);

  const runAs = <T>(activeUserId: string, callback: () => Promise<T>) =>
    tenantContext.run(
      {
        tenantId,
        userId: activeUserId,
        membershipId: 'membership-1',
        role: activeUserId === 'admin-1' ? 'admin' : 'member',
        permissions: ['task:read'],
      },
      callback,
    );

  it('supports head in one department and employee in another', async () => {
    await runAs(userId, async () => {
      await expect(service.getRole('department-a')).resolves.toBe('department_head');
      await expect(service.getRole('department-b')).resolves.toBe('employee');
    });
  });

  it('fails closed outside the user departments', async () => {
    await runAs(userId, () =>
      expect(service.assertCanViewDepartment('department-c')).rejects.toBeInstanceOf(
        ForbiddenException,
      ),
    );
  });

  it('allows only department head or admin to set global visibility', async () => {
    await runAs(userId, async () => {
      await expect(service.assertCanSetVisibility('department-a')).resolves.toBe('department_head');
      await expect(service.assertCanSetVisibility('department-b')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  it('allows an employee to change only an assigned task status', async () => {
    await runAs(userId, async () => {
      await expect(service.assertCanChangeStatus('department-b', userId)).resolves.toBeUndefined();
      await expect(
        service.assertCanChangeStatus('department-b', 'someone-else'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('limits employee reports to their own tasks', async () => {
    await runAs(userId, () =>
      expect(service.getReportScope('department-b')).resolves.toEqual({
        role: 'employee',
        departmentId: 'department-b',
        ownTasksOnly: true,
      }),
    );
  });

  it('allows admins to request an organization-wide report', async () => {
    await runAs('admin-1', () =>
      expect(service.getReportScope()).resolves.toEqual({
        role: 'admin',
        departmentId: undefined,
        ownTasksOnly: false,
      }),
    );
  });
});
