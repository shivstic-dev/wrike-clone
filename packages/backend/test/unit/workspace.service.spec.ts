import { WorkspaceService } from '../../src/workspace/workspace.service';
import { tenantContext } from '../../src/common/tenant-context';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

function createQueryBuilder() {
  const builder: any = {};
  for (const method of ['where', 'andWhere', 'whereNull', 'select', 'orderBy', 'update']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.first = jest.fn();
  builder.insert = jest.fn(() => builder);
  builder.returning = jest.fn();
  builder.del = jest.fn().mockResolvedValue(0);
  builder.onConflict = jest.fn(() => builder);
  builder.ignore = jest.fn().mockResolvedValue(undefined);
  return builder;
}

describe('WorkspaceService member management', () => {
  it('creates the tenant membership before selecting the new RLS-protected user', async () => {
    const workspaces = createQueryBuilder();
    const users = createQueryBuilder();
    const tenantMemberships = createQueryBuilder();
    const workspaceMembers = createQueryBuilder();
    const departmentHeads = createQueryBuilder();
    const activityLogs = createQueryBuilder();

    workspaces.first.mockResolvedValue({
      id: 'workspace-1',
      tenant_id: 'tenant-1',
      deleted_at: null,
    });
    users.first.mockResolvedValue(null);
    tenantMemberships.first.mockResolvedValue(null);
    workspaceMembers.first.mockResolvedValue(null);
    workspaceMembers.returning.mockResolvedValue([
      {
        id: 'workspace-member-1',
        tenant_id: 'tenant-1',
        workspace_id: 'workspace-1',
        user_id: 'new-user-1',
        role: 'employee',
      },
    ]);

    const db: any = jest.fn((table: string) => {
      switch (table) {
        case 'workspaces':
          return workspaces;
        case 'users':
          return users;
        case 'tenant_memberships':
          return tenantMemberships;
        case 'workspace_members':
          return workspaceMembers;
        case 'department_heads':
          return departmentHeads;
        case 'activity_logs':
          return activityLogs;
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    });
    const departmentAccess = {
      isTenantAdmin: jest.fn().mockResolvedValue(true),
    } as any;
    const service = new WorkspaceService(db, departmentAccess);

    const result = await tenantContext.run(
      {
        tenantId: 'tenant-1',
        userId: 'admin-1',
        membershipId: 'admin-membership-1',
        role: 'admin',
        permissions: ['*'],
      },
      () =>
        service.addMember('workspace-1', {
          email: 'NEW.MEMBER@Example.com',
          displayName: 'New Member',
          tempPassword: 'temporary-password',
          role: 'employee',
        }),
    );

    expect(users.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new.member@example.com',
        display_name: 'New Member',
        password_hash: 'hashed-password',
      }),
    );
    expect(users.returning).not.toHaveBeenCalled();
    expect(tenantMemberships.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        role: 'member',
      }),
    );
    expect(result).toMatchObject({
      id: 'workspace-member-1',
      role: 'employee',
    });
  });
});
