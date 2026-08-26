import { tenantContext } from '../../src/common/tenant-context';
import { UserService } from '../../src/user/user.service';

function createQueryBuilder() {
  return {
    where: jest.fn().mockReturnThis(),
    forUpdate: jest.fn().mockReturnThis(),
    first: jest.fn(),
    update: jest.fn(),
  };
}

describe('UserService', () => {
  it('disables membership and expires matching sessions atomically', async () => {
    const membershipLookup = createQueryBuilder();
    membershipLookup.first.mockResolvedValue({ id: 'membership-1' });

    const membershipQuery = createQueryBuilder();
    membershipQuery.first.mockResolvedValue({ id: 'membership-1' });
    membershipQuery.update.mockResolvedValue(1);
    const sessionQuery = createQueryBuilder();
    sessionQuery.update.mockResolvedValue(1);

    const trx = jest.fn((table: string) => {
      if (table === 'tenant_memberships') return membershipQuery;
      if (table === 'sessions') return sessionQuery;
      throw new Error(`Unexpected table: ${table}`);
    });
    const db = Object.assign(jest.fn().mockReturnValue(membershipLookup), {
      transaction: jest.fn(async (callback: (transaction: typeof trx) => Promise<void>) =>
        callback(trx),
      ),
    });
    const service = new UserService(db as never);

    await tenantContext.run(
      { tenantId: 'tenant-1', userId: 'admin-1' } as never,
      () => service.remove('user-1'),
    );

    expect(trx).toHaveBeenCalledWith('tenant_memberships');
    expect(membershipQuery.forUpdate).toHaveBeenCalledTimes(1);
    expect(membershipQuery.where).toHaveBeenCalledWith({
      id: 'membership-1',
      tenant_id: 'tenant-1',
    });
    expect(membershipQuery.update).toHaveBeenCalledWith({ is_active: false });
    expect(sessionQuery.where).toHaveBeenCalledWith({
      membership_id: 'membership-1',
      tenant_id: 'tenant-1',
    });
    expect(sessionQuery.update).toHaveBeenCalledWith({ expires_at: expect.any(Date) });
    expect(membershipQuery.forUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      sessionQuery.update.mock.invocationCallOrder[0]!,
    );
  });
});
