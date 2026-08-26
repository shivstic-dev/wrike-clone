import { NotificationService } from '../../src/notification/notification.service';
import { tenantContext } from '../../src/common/tenant-context';

describe('NotificationService', () => {
  it('uses the supplied transaction executor when creating a notification', async () => {
    const insert = jest.fn().mockReturnThis();
    const returning = jest.fn().mockResolvedValue([{ id: 'notification-1' }]);
    const executor = jest.fn().mockReturnValue({ insert, returning });
    const service = new NotificationService(jest.fn() as any);

    await tenantContext.run(
      {
        tenantId: 'tenant-1', userId: 'user-1', membershipId: 'membership-1', role: 'member', permissions: [],
      },
      () => service.create({ userId: 'recipient-1', type: 'handoff_ready', title: 'Ready for handoff' }, executor as any),
    );

    expect(executor).toHaveBeenCalledWith('notifications');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-1', user_id: 'recipient-1' }));
  });

  it('marks only the current user notification in the current tenant as read', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
    };
    const db = jest.fn().mockReturnValue(query);
    const service = new NotificationService(db as any);

    await tenantContext.run(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        membershipId: 'membership-1',
        role: 'member',
        permissions: [],
      },
      () => service.markAsRead('notification-1'),
    );

    expect(query.where).toHaveBeenCalledWith({
      id: 'notification-1',
      tenant_id: 'tenant-1',
      user_id: 'user-1',
    });
    expect(query.update).toHaveBeenCalledWith({ is_read: true });
  });
});
