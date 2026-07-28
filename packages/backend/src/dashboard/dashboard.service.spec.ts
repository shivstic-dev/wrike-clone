import { BadRequestException, ForbiddenException, HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { DashboardOverview } from '@wrike-clone/shared';
import knex, { type Knex } from 'knex';
import { ZodError } from 'zod';
import { tenantContext, type TenantContextData } from '../common/tenant-context';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardController } from './dashboard.controller';
import {
  buildDashboardRowsQuery,
  DashboardService,
  type DashboardQueryScope,
} from './dashboard.service';
import type { DashboardTaskRow } from './dashboard-metrics';

function row(
  overrides: Partial<DashboardTaskRow> & { id: string },
): DashboardTaskRow {
  return {
    title: overrides.id,
    status: 'todo',
    priority: 'normal',
    departmentId: 'department-1',
    departmentName: 'Operations',
    createdAt: new Date('2026-07-20T09:00:00.000Z'),
    completedAt: null,
    dueDate: null,
    assignees: [],
    ...overrides,
  };
}

function normalizedSql(query: Knex.QueryBuilder): {
  sql: string;
  bindings: readonly unknown[];
} {
  const compiled = query.toSQL();
  return {
    sql: compiled.sql.replace(/\s+/g, ' ').trim().toLowerCase(),
    bindings: compiled.bindings,
  };
}

describe('buildDashboardRowsQuery', () => {
  const db = knex({ client: 'pg' });
  const baseScope: DashboardQueryScope = {
    tenantId: 'tenant-current',
    userId: 'employee-current',
    role: 'employee',
    departmentId: 'department-current',
  };

  afterAll(async () => {
    await db.destroy();
  });

  it('binds the current tenant and excludes deleted tasks before aggregation', () => {
    const { sql, bindings } = normalizedSql(buildDashboardRowsQuery(db, baseScope));

    expect(sql).toContain('"tasks"."tenant_id" = ?');
    expect(sql).toContain('"tasks"."deleted_at" is null');
    expect(sql).toContain('"workspaces"."tenant_id" = "tasks"."tenant_id"');
    expect(bindings.filter((value) => value === baseScope.tenantId).length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('limits employee task visibility and returned assignees to the current user', () => {
    const { sql, bindings } = normalizedSql(buildDashboardRowsQuery(db, baseScope));

    expect(sql).toContain('"tasks"."assignee_id" = ?');
    expect(sql).toContain('from "task_assignees" as "dashboard_self_ta"');
    expect(sql).toContain('"dashboard_self_ta"."tenant_id" = ?');
    expect(sql).toContain('"dashboard_assignees"."user_id" = ?');
    expect(bindings.filter((value) => value === baseScope.userId).length).toBeGreaterThanOrEqual(3);
  });

  it('limits managers to self, active employees, and truly unassigned tasks', () => {
    const scope: DashboardQueryScope = {
      ...baseScope,
      role: 'manager',
      userId: 'manager-current',
    };
    const { sql, bindings } = normalizedSql(buildDashboardRowsQuery(db, scope));

    expect(sql).toContain('"dashboard_member_tenant"."is_active" = ?');
    expect(sql).toContain('"dashboard_member_tenant"."role" <> ?');
    expect(sql).toContain('"dashboard_member_workspace"."role" <> ?');
    expect(sql).toContain('from "department_heads" as "dashboard_member_head"');
    expect(sql).toContain('"tasks"."assignee_id" is null');
    expect(sql).toContain('from "task_assignees" as "dashboard_any_ta"');
    expect(bindings).toContain(true);
    expect(bindings).toContain('admin');
    expect(bindings).toContain('manager');
  });

  it('deduplicates legacy and junction assignees inside the single task row query', () => {
    const { sql } = normalizedSql(
      buildDashboardRowsQuery(db, { ...baseScope, role: 'department_head' }),
    );

    expect(sql).toContain('from "task_assignees" as "dashboard_ta"');
    expect(sql).toContain('"tasks"."assignee_id"');
    expect(sql).toMatch(/\bunion\b/);
    expect(sql).not.toMatch(/\bunion all\b/);
    expect(sql).toContain('jsonb_agg');
  });

  it('keeps an explicit admin department selection in the tenant-bound row query', () => {
    const { sql, bindings } = normalizedSql(
      buildDashboardRowsQuery(db, {
        ...baseScope,
        role: 'admin',
        userId: 'admin-current',
      }),
    );

    expect(sql).toContain('"tasks"."department_id" = ?');
    expect(bindings).toContain('department-current');
    expect(bindings).toContain('tenant-current');
  });
});

describe('DashboardService', () => {
  const context: TenantContextData = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    membershipId: 'membership-1',
    role: 'admin',
    permissions: ['*'],
  };

  const dbRows = jest.fn<Promise<DashboardTaskRow[]>, []>();
  const workspaceExists = jest.fn<Promise<{ id: string } | undefined>, []>();
  const departmentAccess = {
    getReportScope: jest.fn(),
  };
  let db: jest.MockedFunction<Knex>;
  let workspaceQuery: {
    where: jest.Mock;
    whereNull: jest.Mock;
    first: jest.Mock;
  };
  let service: DashboardService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-28T12:00:00.000Z'));
    dbRows.mockReset();
    workspaceExists.mockReset();
    departmentAccess.getReportScope.mockReset();

    const taskRowsQuery = {
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      then: (
        onFulfilled?: (rows: DashboardTaskRow[]) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => dbRows().then(onFulfilled, onRejected),
    };
    workspaceQuery = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn(() => workspaceExists()),
    };
    const database = jest.fn((table: string) =>
      table === 'workspaces' ? workspaceQuery : taskRowsQuery,
    ) as unknown as jest.MockedFunction<Knex>;
    database.raw = jest.fn((sql: string) => sql) as unknown as typeof database.raw;
    db = database;
    service = new DashboardService(db, departmentAccess as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses access-service employee self scope instead of the client role', async () => {
    departmentAccess.getReportScope.mockResolvedValue({
      role: 'employee',
      departmentId: 'department-1',
      ownTasksOnly: true,
    });
    dbRows.mockResolvedValue([
      row({ id: 'mine', assignees: [{ userId: context.userId, name: 'Me' }] }),
    ]);

    const result = await tenantContext.run(context, () =>
      service.overview({ departmentId: 'department-1', days: 30 }),
    );

    expect(result.scope.role).toBe('employee');
    expect(result.capacity.map((item) => item.userId)).toEqual([context.userId]);
    expect(result.departments).toEqual([]);
  });

  it('rejects a manager requesting another department before querying tasks', async () => {
    departmentAccess.getReportScope.mockRejectedValue(new ForbiddenException());

    await expect(
      tenantContext.run(context, () =>
        service.overview({ departmentId: 'department-2', days: 30 }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(departmentAccess.getReportScope).toHaveBeenCalledWith('department-2');
    expect(db).not.toHaveBeenCalled();
    expect(dbRows).not.toHaveBeenCalled();
  });

  it('returns manager self, employee, and unassigned metrics without a department comparison', async () => {
    departmentAccess.getReportScope.mockResolvedValue({
      role: 'manager',
      departmentId: 'department-1',
      ownTasksOnly: false,
    });
    dbRows.mockResolvedValue([
      row({
        id: 'manager-task',
        assignees: [{ userId: context.userId, name: 'Current manager' }],
      }),
      row({
        id: 'employee-task',
        assignees: [{ userId: 'employee-1', name: 'Employee' }],
      }),
      row({ id: 'unassigned-task' }),
    ]);

    const result = await tenantContext.run(context, () =>
      service.overview({ departmentId: 'department-1', days: 30 }),
    );

    expect(result.totals.active).toBe(3);
    expect(result.totals.unassigned).toBe(1);
    expect(result.capacity.map((item) => item.userId).sort()).toEqual([
      'employee-1',
      context.userId,
    ]);
    expect(result.departments).toEqual([]);
    expect(db).toHaveBeenCalledTimes(1);
    expect(db).toHaveBeenCalledWith('tasks');
    expect(workspaceExists).not.toHaveBeenCalled();
  });

  it('counts a task and its capacity once when legacy and junction assignments overlap', async () => {
    departmentAccess.getReportScope.mockResolvedValue({
      role: 'department_head',
      departmentId: 'department-1',
      ownTasksOnly: false,
    });
    dbRows.mockResolvedValue([
      row({
        id: 'deduplicated-task',
        assignees: [
          { userId: 'employee-1', name: 'Employee' },
          { userId: 'employee-1', name: 'Employee' },
        ],
      }),
    ]);

    const result = await tenantContext.run(context, () =>
      service.overview({ departmentId: 'department-1', days: 30 }),
    );

    expect(result.totals.active).toBe(1);
    expect(result.capacity).toEqual([
      { userId: 'employee-1', name: 'Employee', openTasks: 1, overdue: 0 },
    ]);
  });

  it('returns deterministic department comparisons only to admins using the same rows', async () => {
    departmentAccess.getReportScope.mockResolvedValue({
      role: 'admin',
      departmentId: undefined,
      ownTasksOnly: false,
    });
    dbRows.mockResolvedValue([
      row({
        id: 'beta-active',
        departmentId: 'department-b',
        departmentName: 'Beta',
        dueDate: new Date('2026-07-27T12:00:00.000Z'),
      }),
      row({
        id: 'alpha-completed',
        departmentId: 'department-a',
        departmentName: 'Alpha',
        status: 'completed',
        completedAt: new Date('2026-07-25T12:00:00.000Z'),
      }),
    ]);

    const result = await tenantContext.run(context, () =>
      service.overview({ days: 30 }),
    );

    expect(result.generatedAt).toBe('2026-07-28T12:00:00.000Z');
    expect(result.scope).toEqual({ role: 'admin', departmentId: undefined });
    expect(result.departments).toEqual([
      {
        id: 'department-a',
        name: 'Alpha',
        active: 0,
        overdue: 0,
        completionRate: 100,
      },
      {
        id: 'department-b',
        name: 'Beta',
        active: 1,
        overdue: 1,
        completionRate: 0,
      },
    ]);
    expect(db).toHaveBeenCalledTimes(1);
    expect(dbRows).toHaveBeenCalledTimes(1);
  });

  it('validates an explicit admin department in the current tenant before querying tasks', async () => {
    const departmentId = 'e7d22702-f992-4590-8d20-f74bfe13ac8c';
    departmentAccess.getReportScope.mockResolvedValue({
      role: 'admin',
      departmentId,
      ownTasksOnly: false,
    });
    workspaceExists.mockResolvedValue({ id: departmentId });
    dbRows.mockResolvedValue([]);

    const result = await tenantContext.run(context, () =>
      service.overview({ departmentId, days: 30 }),
    );

    expect(result.scope.departmentId).toBe(departmentId);
    expect(db).toHaveBeenNthCalledWith(1, 'workspaces');
    expect(db).toHaveBeenNthCalledWith(2, 'tasks');
    expect(workspaceQuery.where).toHaveBeenCalledWith({
      id: departmentId,
      tenant_id: context.tenantId,
    });
    expect(workspaceQuery.whereNull).toHaveBeenCalledWith('deleted_at');
    expect(workspaceExists).toHaveBeenCalledTimes(1);
    expect(dbRows).toHaveBeenCalledTimes(1);
  });

  it('rejects a foreign admin department before the task-row query', async () => {
    const foreignDepartmentId = 'f517ea4b-c009-4465-bd2c-6064489f07c7';
    departmentAccess.getReportScope.mockResolvedValue({
      role: 'admin',
      departmentId: foreignDepartmentId,
      ownTasksOnly: false,
    });
    workspaceExists.mockResolvedValue(undefined);

    await expect(
      tenantContext.run(context, () =>
        service.overview({ departmentId: foreignDepartmentId, days: 30 }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db).toHaveBeenCalledTimes(1);
    expect(db).toHaveBeenCalledWith('workspaces');
    expect(workspaceExists).toHaveBeenCalledTimes(1);
    expect(dbRows).not.toHaveBeenCalled();
  });

  it('fails closed if the access service does not resolve a dashboard role', async () => {
    departmentAccess.getReportScope.mockResolvedValue({
      role: 'none',
      departmentId: 'department-1',
      ownTasksOnly: false,
    });

    await expect(
      tenantContext.run(context, () =>
        service.overview({ departmentId: 'department-1', days: 30 }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dbRows).not.toHaveBeenCalled();
  });

  it('fails closed if a non-admin scope has no permitted department', async () => {
    departmentAccess.getReportScope.mockResolvedValue({
      role: 'manager',
      departmentId: undefined,
      ownTasksOnly: false,
    });

    await expect(
      tenantContext.run(context, () => service.overview({ days: 30 })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dbRows).not.toHaveBeenCalled();
  });
});

describe('DashboardController', () => {
  it('requires authentication, current permissions, and task read access', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DashboardController)).toEqual([
      AuthGuard,
      RolesGuard,
    ]);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, DashboardController.prototype.overview),
    ).toEqual(['task:read']);
  });

  it('validates and defaults overview query input before calling the service', async () => {
    const overview = jest.fn<Promise<DashboardOverview>, [{ departmentId?: string; days: 30 }]>();
    const controller = new DashboardController({ overview } as never);
    const departmentId = 'e7d22702-f992-4590-8d20-f74bfe13ac8c';
    overview.mockResolvedValue({} as DashboardOverview);

    await controller.overview({ departmentId });

    expect(overview).toHaveBeenCalledWith({ departmentId, days: 30 });
  });

  it('returns a safe 400 response for unsupported windows without calling the service', async () => {
    const overview = jest.fn<Promise<DashboardOverview>, [{ departmentId?: string; days: 30 }]>();
    const controller = new DashboardController({ overview } as never);

    let thrown: unknown;
    try {
      await controller.overview({ days: 7 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as BadRequestException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect((thrown as BadRequestException).getResponse()).toEqual({
      statusCode: 400,
      message: 'Invalid dashboard query',
      issues: [{ code: 'custom', path: ['days'], message: 'Invalid input' }],
    });
    expect(thrown).not.toBeInstanceOf(ZodError);
    expect(overview).not.toHaveBeenCalled();
  });
});
