import { ForbiddenException } from '@nestjs/common';
import { tenantContext } from '../common/tenant-context';
import { DepartmentAccessService } from './department-access.service';

const context = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-000000000002',
  membershipId: '00000000-0000-0000-0000-000000000003',
  role: 'member',
  permissions: [],
};

describe('DepartmentAccessService workflow rules', () => {
  it('allows a manager to assign an employee or themselves', async () => {
    const service = new DepartmentAccessService({} as never);
    jest
      .spyOn(service, 'getRole')
      .mockResolvedValueOnce('manager')
      .mockResolvedValueOnce('employee');

    await expect(
      tenantContext.run(context, () => service.assertCanAssignTo('department-1', 'employee-1')),
    ).resolves.toBe('manager');

    jest
      .spyOn(service, 'getRole')
      .mockResolvedValueOnce('manager')
      .mockResolvedValueOnce('manager');
    await expect(
      tenantContext.run(context, () => service.assertCanAssignTo('department-1', context.userId)),
    ).resolves.toBe('manager');
  });

  it('rejects a manager assigning another manager or department head', async () => {
    const service = new DepartmentAccessService({} as never);
    jest
      .spyOn(service, 'getRole')
      .mockResolvedValueOnce('manager')
      .mockResolvedValueOnce('manager');

    await expect(
      tenantContext.run(context, () => service.assertCanAssignTo('department-1', 'manager-2')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects manager role changes while allowing department heads', async () => {
    const service = new DepartmentAccessService({} as never);
    jest.spyOn(service, 'getRole').mockResolvedValueOnce('manager');
    await expect(
      tenantContext.run(context, () => service.assertCanChangeMemberRole('department-1')),
    ).rejects.toBeInstanceOf(ForbiddenException);

    jest.spyOn(service, 'getRole').mockResolvedValueOnce('department_head');
    await expect(
      tenantContext.run(context, () => service.assertCanChangeMemberRole('department-1')),
    ).resolves.toBe('department_head');
  });

  it('lets a co-assigned employee change task status', async () => {
    const chain = {
      where: jest.fn(),
      first: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
    };
    chain.where.mockReturnValue(chain);
    const db = jest.fn().mockReturnValue(chain);
    const service = new DepartmentAccessService(db as never);
    jest.spyOn(service, 'getRole').mockResolvedValue('employee');

    await expect(
      tenantContext.run(context, () =>
        service.assertCanChangeStatus('department-1', 'task-1', null),
      ),
    ).resolves.toBeUndefined();
  });
});
