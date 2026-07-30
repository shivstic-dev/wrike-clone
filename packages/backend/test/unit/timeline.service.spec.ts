import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
});
