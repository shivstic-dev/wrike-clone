import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TaskController } from '../../src/task/task.controller';
import { TaskService } from '../../src/task/task.service';
import { DepartmentAccessService } from '../../src/rbac/department-access.service';
import { DATABASE_PROVIDER } from '../../src/database/database.module';
import { AuthGuard } from '../../src/common/guards/auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { tenantContext } from '../../src/common/tenant-context';
import { TaskLocationService } from '../../src/task/task-location.service';
import { TaskCompletionService } from '../../src/task/task-completion.service';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { MemoryCacheService } from '../../src/common/cache/memory-cache.service';

function queryBuilder() {
  const builder: any = {};
  for (const method of [
    'leftJoin',
    'join',
    'where',
    'whereNot',
    'andWhere',
    'whereNull',
    'whereIn',
    'select',
    'modify',
    'update',
    'insert',
    'orderBy',
    'forUpdate',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.first = jest.fn();
  builder.returning = jest.fn().mockResolvedValue([]);
  builder.del = jest.fn().mockResolvedValue(0);
  return builder;
}

describe('Department permission checks through the HTTP API', () => {
  let app: INestApplication;
  let builder: any;

  beforeAll(async () => {
    builder = queryBuilder();
    const database: any = jest.fn(() => builder);
    database.raw = jest.fn();
    database.transaction = jest.fn((callback) => callback(database));

    const module = await Test.createTestingModule({
      controllers: [TaskController],
      providers: [
        TaskService,
        MemoryCacheService,
        TaskLocationService,
        DepartmentAccessService,
        { provide: TaskCompletionService, useValue: {} },
        { provide: RealtimeService, useValue: { publishTaskEvent: jest.fn() } },
        { provide: DATABASE_PROVIDER, useValue: database },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: () => {
          tenantContext.enterWith({
            tenantId: 'tenant-1',
            userId: 'manager-1',
            membershipId: 'membership-1',
            role: 'member',
            permissions: ['task:read'],
          });
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a manager who bypasses the UI and tries to make a task global', async () => {
    const tenantMembership = {
      tenant_id: 'tenant-1',
      user_id: 'manager-1',
      role: 'member',
      is_active: true,
    };
    const workspaceMembership = {
      tenant_id: 'tenant-1',
      workspace_id: 'department-1',
      user_id: 'manager-1',
      role: 'manager',
    };
    builder.first
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        tenant_id: 'tenant-1',
        department_id: 'department-1',
        assignee_id: 'employee-1',
        visibility: 'department',
        status: 'todo',
      })
      .mockResolvedValueOnce(tenantMembership)
      .mockResolvedValueOnce(workspaceMembership)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tenantMembership)
      .mockResolvedValueOnce(workspaceMembership)
      .mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .patch('/tasks/11111111-1111-4111-8111-111111111111')
      .send({ visibility: 'global' })
      .expect(403);
  });
});
