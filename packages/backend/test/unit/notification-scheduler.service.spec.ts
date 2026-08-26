import { NotificationSchedulerService } from '../../src/notification/notification-scheduler.service';

function createRootDatabase() {
  const claims = new Map<string, { id: string; dedupe_key: string }>();
  const notifications: unknown[] = [];
  let sequence = 0;

  const database = jest.fn((table: string) => {
    let inserted: any;
    let where: any;
    const chain: any = {
      insert(value: any) {
        inserted = value;
        return chain;
      },
      onConflict() {
        return chain;
      },
      ignore() {
        return chain;
      },
      async returning() {
        if (claims.has(inserted.dedupe_key)) return [];
        const id = `claim-${++sequence}`;
        claims.set(inserted.dedupe_key, { id, dedupe_key: inserted.dedupe_key });
        return [{ id }];
      },
      where(value: any) {
        where = value;
        return chain;
      },
      async delete() {
        for (const [key, claim] of claims) {
          if (claim.id === where.id) claims.delete(key);
        }
      },
      then(resolve: (value: unknown) => void) {
        if (table === 'notifications') {
          notifications.push(inserted);
          resolve(undefined);
        }
      },
    };
    return chain;
  });

  return { database, claims, notifications };
}

describe('NotificationSchedulerService', () => {
  const task = {
    id: 'task-1',
    tenant_id: 'tenant-1',
    title: 'Prepare release',
    priority: 'critical',
    status: 'todo',
    due_date: null,
    assignee_id: 'user-1',
    email: 'user@example.com',
  };

  it('chooses one deadline threshold for each scheduler cycle', () => {
    const { database } = createRootDatabase();
    const service = new NotificationSchedulerService(
      database as never,
      {
        sendTaskAlert: jest.fn(),
      } as never,
    );
    const deadlineRule = (service as any).deadlineRule.bind(service);

    expect(deadlineRule(new Date(Date.now() + 36 * 3_600_000))).toMatchObject({ threshold: 48 });
    expect(deadlineRule(new Date(Date.now() + 12 * 3_600_000))).toMatchObject({ threshold: 24 });
    expect(deadlineRule(new Date(Date.now() - 60_000))).toMatchObject({ threshold: 0 });
    expect(deadlineRule(new Date(Date.now() + 72 * 3_600_000))).toBeUndefined();
  });

  it('uses notification_log to send the same rule only once', async () => {
    const { database, claims, notifications } = createRootDatabase();
    const email = { sendTaskAlert: jest.fn().mockResolvedValue(true) };
    const service = new NotificationSchedulerService(database as never, email as never);
    const deliver = (service as any).deliverOnce.bind(service);

    await deliver(
      task,
      'priority_alert',
      'priority:task-1:user-1:critical',
      'Critical task',
      'Act now',
    );
    await deliver(
      task,
      'priority_alert',
      'priority:task-1:user-1:critical',
      'Critical task',
      'Act now',
    );

    expect(email.sendTaskAlert).toHaveBeenCalledTimes(1);
    expect(claims.size).toBe(1);
    expect(notifications).toHaveLength(1);
  });

  it('releases the claim after SMTP failure so the next cycle retries', async () => {
    const { database, claims, notifications } = createRootDatabase();
    const email = {
      sendTaskAlert: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    };
    const service = new NotificationSchedulerService(database as never, email as never);
    const deliver = (service as any).deliverOnce.bind(service);

    await expect(
      deliver(
        task,
        'priority_alert',
        'priority:task-1:user-1:critical',
        'Critical task',
        'Act now',
      ),
    ).rejects.toThrow('SMTP delivery failed');
    expect(claims.size).toBe(0);

    await deliver(
      task,
      'priority_alert',
      'priority:task-1:user-1:critical',
      'Critical task',
      'Act now',
    );
    expect(email.sendTaskAlert).toHaveBeenCalledTimes(2);
    expect(notifications).toHaveLength(1);
  });
});
