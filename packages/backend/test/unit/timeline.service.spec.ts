import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import knex, { type Knex } from 'knex';
import { tenantContext, type TenantContextData } from '../../src/common/tenant-context';
import {
  TimelineService,
  buildScheduledTimelineQuery,
  buildUnscheduledTimelineQuery,
  decodeTimelineCursor,
} from '../../src/timeline/timeline.service';

const context: TenantContextData = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  membershipId: 'membership-1',
  role: 'employee',
  permissions: ['task:read'],
};

const input = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-31T23:59:59.999Z',
  perPage: 500,
};

function sql(query: Knex.QueryBuilder) {
  const compiled = query.toSQL();
  return { sql: compiled.sql.replace(/\s+/g, ' ').toLowerCase(), bindings: compiled.bindings };
}

describe('timeline query construction', () => {
  const db = knex({ client: 'pg' });

  afterAll(() => db.destroy());

  it('uses inclusive date overlap plus tenant and soft-delete predicates', () => {
    const query = buildScheduledTimelineQuery(db, context, input);
    const compiled = sql(query);

    expect(compiled.sql).toContain('"tasks"."start_date" <= ?');
    expect(compiled.sql).toContain('"tasks"."due_date" >= ?');
    expect(compiled.sql).toContain('"tasks"."tenant_id" = ?');
    expect(compiled.sql).toContain('"tasks"."deleted_at" is null');
    expect(compiled.bindings).toContain(context.tenantId);
  });

  it('applies task access scope for an employee and uses tuple cursor ordering', () => {
    const query = buildScheduledTimelineQuery(db, context, {
      ...input,
      cursor: Buffer.from(JSON.stringify({ startDate: input.from, dueDate: input.to, id: 'task-1' }))
        .toString('base64url'),
    });
    const compiled = sql(query);

    expect(compiled.sql).toContain('from "task_assignees" as "own_ta"');
    expect(compiled.sql).toContain('order by "tasks"."start_date" asc, "tasks"."due_date" asc, "tasks"."id" asc');
    expect(compiled.sql).toContain('"tasks"."start_date" > ?');
  });

  it('classifies either missing schedule date as unscheduled before ordering', () => {
    const compiled = sql(buildUnscheduledTimelineQuery(db, context, input));

    expect(compiled.sql).toContain('"tasks"."start_date" is null');
    expect(compiled.sql).toContain('"tasks"."due_date" is null');
  });

  it('rejects malformed opaque cursors', () => {
    expect(() => decodeTimelineCursor('not-a-cursor')).toThrow('Invalid timeline cursor');
  });
});

describe('TimelineService', () => {
  const taskRows = jest.fn();
  const dependencyRows = jest.fn();
  const projectRow = jest.fn();
  const departmentAccess = {
    assertCanViewDepartment: jest.fn(),
    assertCanManageTask: jest.fn(),
    getRole: jest.fn(),
  };
  let db: jest.MockedFunction<Knex>;
  let service: TimelineService;

  beforeEach(() => {
    taskRows.mockReset();
    dependencyRows.mockReset();
    projectRow.mockReset();
    departmentAccess.assertCanViewDepartment.mockReset();
    departmentAccess.getRole.mockReset();
    departmentAccess.getRole.mockResolvedValue('employee');

    const taskQuery: any = {
      leftJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), whereNull: jest.fn().mockReturnThis(), whereNotNull: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(), first: jest.fn(() => projectRow()),
      then: (resolve: any, reject: any) => taskRows().then(resolve, reject),
    };
    const dependencyQuery: any = {
      where: jest.fn().mockReturnThis(), whereIn: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), then: (resolve: any, reject: any) => dependencyRows().then(resolve, reject),
    };
    const database = jest.fn((table: string) => table === 'task_dependencies' ? dependencyQuery : taskQuery) as any;
    database.raw = jest.fn((value: string) => value);
    db = database;
    service = new TimelineService(db, departmentAccess as never);
  });

  it('checks a requested department before reading timeline tasks', async () => {
    taskRows.mockResolvedValue([]);
    dependencyRows.mockResolvedValue([]);

    await tenantContext.run(context, () => service.dashboard({ ...input, departmentId: 'department-1' }));

    expect(departmentAccess.assertCanViewDepartment).toHaveBeenCalledWith('department-1');
  });

  it('rejects a project that is not visible through its department', async () => {
    projectRow.mockResolvedValue(undefined);

    await expect(tenantContext.run(context, () => service.project('project-1', input)))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns scheduled and unscheduled tasks, edge set, capabilities, and no critical path by default', async () => {
    taskRows
      .mockResolvedValueOnce([{ id: 'scheduled', start_date: new Date(input.from), due_date: new Date(input.to), department_id: 'department-1' }])
      .mockResolvedValueOnce([]);
    dependencyRows.mockResolvedValue([]);

    const result = await tenantContext.run(context, () => service.dashboard(input));

    expect(result.tasks).toHaveLength(1);
    expect(result.unscheduled).toEqual([]);
    expect(result.tasks[0]!.capabilities).toEqual({ canEditSchedule: false, canManageDependencies: false });
    expect(result.tasks[0]!.isCritical).toBe(false);
  });

  describe('updateSchedule', () => {
    it('rejects a stale optimistic schedule update with the current schedule', async () => {
      const scheduleQuery: any = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
        first: jest.fn().mockResolvedValue({
          id: 'task-1',
          tenant_id: context.tenantId,
          department_id: 'department-1',
          start_date: '2026-08-01T00:00:00.000Z',
          due_date: '2026-08-02T00:00:00.000Z',
          updated_at: '2026-08-02T00:00:00.000Z',
        }),
      };
      const database: any = jest.fn(() => scheduleQuery);
      database.transaction = jest.fn((callback: (trx: any) => unknown) => callback(database));
      const updateService = new TimelineService(database, departmentAccess as never);

      await expect(
        tenantContext.run(context, () =>
          (updateService as any).updateSchedule('task-1', {
            startDate: '2026-08-03T00:00:00.000Z',
            dueDate: '2026-08-04T00:00:00.000Z',
            expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
          }),
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'STALE_TASK',
          current: expect.objectContaining({ id: 'task-1' }),
        },
      });
    });

    it('writes a complete schedule with tenant, optimistic timestamp, and activity data', async () => {
      const task = { id: 'task-1', tenant_id: context.tenantId, department_id: 'department-1' };
      const scheduleQuery: any = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ ...task, start_date: '2026-08-03', due_date: '2026-08-04' }]),
        first: jest.fn().mockResolvedValue(task),
        insert: jest.fn().mockResolvedValue(undefined),
      };
      const database: any = jest.fn(() => scheduleQuery);
      database.transaction = jest.fn((callback: (trx: any) => unknown) => callback(database));
      const updateService = new TimelineService(database, departmentAccess as never);

      const result = await tenantContext.run(context, () =>
        (updateService as any).updateSchedule('task-1', {
          startDate: '2026-08-03T00:00:00.000Z',
          dueDate: '2026-08-04T00:00:00.000Z',
          expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
        }),
      );

      expect(result).toMatchObject({ id: 'task-1', start_date: '2026-08-03', due_date: '2026-08-04' });
      expect(scheduleQuery.where).toHaveBeenCalledWith({
        id: 'task-1', tenant_id: context.tenantId, updated_at: new Date('2026-08-01T00:00:00.000Z'),
      });
      expect(scheduleQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'task:schedule:updated' }));
    });

    it('unschedules a task only when both schedule values are null', async () => {
      const task = { id: 'task-1', tenant_id: context.tenantId, department_id: 'department-1' };
      const scheduleQuery: any = {
        where: jest.fn().mockReturnThis(), whereNull: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ ...task, start_date: null, due_date: null }]),
        first: jest.fn().mockResolvedValue(task), insert: jest.fn().mockResolvedValue(undefined),
      };
      const database: any = jest.fn(() => scheduleQuery);
      database.transaction = jest.fn((callback: (trx: any) => unknown) => callback(database));
      const updateService = new TimelineService(database, departmentAccess as never);

      await tenantContext.run(context, () => (updateService as any).updateSchedule('task-1', {
        startDate: null, dueDate: null, expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      }));

      expect(scheduleQuery.update).toHaveBeenCalledWith(expect.objectContaining({ start_date: null, due_date: null }));
    });

    it.each([
      [{ startDate: null, dueDate: '2026-08-04T00:00:00.000Z' }],
      [{ startDate: '2026-08-05T00:00:00.000Z', dueDate: '2026-08-04T00:00:00.000Z' }],
    ])('rejects an invalid schedule range before writing it', async (dates) => {
      const updateService = new TimelineService(db, departmentAccess as never);
      await expect(
        tenantContext.run(context, () =>
          (updateService as any).updateSchedule('task-1', {
            ...dates,
            expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not permit an employee to schedule another task', async () => {
      const forbidden = new ForbiddenException({ code: 'FORBIDDEN', message: 'Schedule access denied' });
      departmentAccess.assertCanManageTask.mockRejectedValueOnce(forbidden);
      const taskQuery: any = {
        where: jest.fn().mockReturnThis(), whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 'task-1', tenant_id: context.tenantId, department_id: 'department-1' }),
      };
      const database: any = jest.fn(() => taskQuery);
      database.transaction = jest.fn((callback: (trx: any) => unknown) => callback(database));
      const updateService = new TimelineService(database, departmentAccess as never);

      await expect(tenantContext.run(context, () => (updateService as any).updateSchedule('task-1', {
        startDate: null, dueDate: null, expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      }))).rejects.toBe(forbidden);
    });

    it('does not update a task outside the active tenant', async () => {
      const taskQuery: any = {
        where: jest.fn().mockReturnThis(), whereNull: jest.fn().mockReturnThis(), first: jest.fn().mockResolvedValue(undefined),
      };
      const database: any = jest.fn(() => taskQuery);
      database.transaction = jest.fn((callback: (trx: any) => unknown) => callback(database));
      const updateService = new TimelineService(database, departmentAccess as never);

      await expect(tenantContext.run(context, () => (updateService as any).updateSchedule('other-tenant-task', {
        startDate: null, dueDate: null, expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      }))).rejects.toBeInstanceOf(NotFoundException);
      expect(taskQuery.where).toHaveBeenCalledWith({ id: 'other-tenant-task', tenant_id: context.tenantId });
    });
  });
});
