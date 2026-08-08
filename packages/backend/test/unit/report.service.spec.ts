import { TaskPriority, TaskStatus } from '@wrike-clone/shared';
import type { Knex } from 'knex';
import { tenantContext } from '../../src/common/tenant-context';
import type { DepartmentRole } from '../../src/rbac/department-access.service';
import { ReportService } from '../../src/reports/report.service';

type TaskFixture = {
  id: string;
  tenant_id: string;
  department_id: string;
  title: string;
  status: string;
  priority: string;
  visibility: string;
  assignee_id: string | null;
  start_date: Date | null;
  due_date: Date | null;
  completed_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
};

type Fixtures = {
  tasks: TaskFixture[];
  workspaces: Array<{ id: string; name: string }>;
  users: Array<{ id: string; display_name: string }>;
  taskAssignees: Array<{
    tenant_id: string;
    task_id: string;
    user_id: string;
    is_primary: boolean;
  }>;
  workspaceMembers: Array<{
    tenant_id: string;
    workspace_id: string;
    user_id: string;
    role: string;
  }>;
  departmentHeads: Array<{ department_id: string; user_id: string }>;
  tenantMemberships: Array<{
    tenant_id: string;
    user_id: string;
    role: string;
    is_active: boolean;
  }>;
};

type TaskPredicate = (task: TaskFixture) => boolean;

class RelatedTaskQuery {
  private tenantId?: string;
  private userIds?: string[];

  constructor(private readonly fixtures: Fixtures) {}

  select(): this {
    return this;
  }

  from(): this {
    return this;
  }

  whereRaw(): this {
    return this;
  }

  andWhere(column: string, value: unknown): this {
    if (column.endsWith('.tenant_id')) this.tenantId = String(value);
    return this;
  }

  whereIn(column: string, values: readonly string[]): this {
    if (column.endsWith('.user_id')) this.userIds = [...values];
    return this;
  }

  existsFor(task: TaskFixture): boolean {
    return this.fixtures.taskAssignees.some(
      (assignment) =>
        assignment.task_id === task.id &&
        (!this.tenantId || assignment.tenant_id === this.tenantId) &&
        (!this.userIds || this.userIds.includes(assignment.user_id)),
    );
  }
}

class PredicateGroup {
  private readonly clauses: Array<{ operator: 'and' | 'or'; predicate: TaskPredicate }> = [];

  constructor(private readonly fixtures: Fixtures) {}

  whereIn(column: string, values: readonly string[]): this {
    return this.add('and', (task) => values.includes(String(this.value(task, column))));
  }

  whereNull(column: string): this {
    return this.add('and', (task) => this.value(task, column) === null);
  }

  whereNotExists(callback: (this: RelatedTaskQuery) => void): this {
    const related = new RelatedTaskQuery(this.fixtures);
    callback.call(related);
    return this.add('and', (task) => !related.existsFor(task));
  }

  orWhereExists(callback: (this: RelatedTaskQuery) => void): this {
    const related = new RelatedTaskQuery(this.fixtures);
    callback.call(related);
    return this.add('or', (task) => related.existsFor(task));
  }

  orWhere(callback: (query: PredicateGroup) => void): this {
    const nested = new PredicateGroup(this.fixtures);
    callback(nested);
    return this.add('or', (task) => nested.matches(task));
  }

  matches(task: TaskFixture): boolean {
    return this.clauses.reduce(
      (result, clause, index) =>
        index === 0 || clause.operator === 'and'
          ? result && clause.predicate(task)
          : result || clause.predicate(task),
      true,
    );
  }

  private add(operator: 'and' | 'or', predicate: TaskPredicate): this {
    this.clauses.push({ operator, predicate });
    return this;
  }

  private value(task: TaskFixture, column: string): unknown {
    return task[column.split('.').at(-1)! as keyof TaskFixture];
  }
}

class TasksQuery {
  private readonly predicates: TaskPredicate[] = [];
  private readonly ordering: Array<{ column: string; direction: string }> = [];

  constructor(private readonly fixtures: Fixtures) {}

  join(): this {
    return this;
  }

  select(): this {
    return this;
  }

  where(
    columnOrCallback: string | ((query: PredicateGroup) => void),
    operatorOrValue?: unknown,
    possibleValue?: unknown,
  ): this {
    if (typeof columnOrCallback === 'function') {
      const group = new PredicateGroup(this.fixtures);
      columnOrCallback(group);
      this.predicates.push((task) => group.matches(task));
      return this;
    }

    const value = possibleValue === undefined ? operatorOrValue : possibleValue;
    const operator = possibleValue === undefined ? '=' : String(operatorOrValue);
    this.predicates.push((task) => {
      const actual = task[columnOrCallback.split('.').at(-1)! as keyof TaskFixture];
      if (operator === '>=') return actual! >= value!;
      if (operator === '<=') return actual! <= value!;
      return actual === value;
    });
    return this;
  }

  andWhere(callback: (query: PredicateGroup) => void): this {
    return this.where(callback);
  }

  whereNull(column: string): this {
    this.predicates.push(
      (task) => task[column.split('.').at(-1)! as keyof TaskFixture] === null,
    );
    return this;
  }

  orderBy(column: string, direction: string): this {
    this.ordering.push({ column, direction });
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onFulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const rows = this.fixtures.tasks
      .filter((task) => this.predicates.every((predicate) => predicate(task)))
      .sort((left, right) => {
        for (const { column, direction } of this.ordering) {
          const key = column.split('.').at(-1)! as keyof TaskFixture;
          const leftValue = left[key];
          const rightValue = right[key];
          if (leftValue === rightValue) continue;
          const comparison = leftValue! < rightValue! ? -1 : 1;
          return direction === 'desc' ? -comparison : comparison;
        }
        return 0;
      })
      .map((task) => {
        const workspace = this.fixtures.workspaces.find(
          (candidate) => candidate.id === task.department_id,
        );
        const assignedUsers = this.fixtures.taskAssignees
          .filter(
            (assignment) =>
              assignment.task_id === task.id && assignment.tenant_id === task.tenant_id,
          )
          .sort((left, right) => Number(right.is_primary) - Number(left.is_primary))
          .map((assignment) =>
            this.fixtures.users.find((user) => user.id === assignment.user_id),
          )
          .filter((user): user is Fixtures['users'][number] => !!user);
        const legacyUser = this.fixtures.users.find((user) => user.id === task.assignee_id);
        return {
          ...task,
          department_name: workspace?.name || '',
          assignee_name:
            assignedUsers.map((user) => user.display_name).join(', ') ||
            legacyUser?.display_name ||
            null,
        };
      });
    return Promise.resolve(rows).then(onFulfilled, onRejected);
  }
}

class WorkspaceMembersQuery {
  private filters: Record<string, unknown> = {};

  constructor(private readonly fixtures: Fixtures) {}

  leftJoin(_table: string, callback: (this: { on(): unknown; andOn(): unknown }) => void): this {
    const clause = {
      on() {
        return clause;
      },
      andOn() {
        return clause;
      },
    };
    callback.call(clause);
    return this;
  }

  join(_table: string, callback: (this: { on(): unknown; andOn(): unknown }) => void): this {
    return this.leftJoin(_table, callback);
  }

  where(filters: Record<string, unknown>): this {
    this.filters = { ...this.filters, ...filters };
    return this;
  }

  select(): this {
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onFulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const members = this.fixtures.workspaceMembers
      .filter(
        (member) =>
          member.tenant_id === this.filters['workspace_members.tenant_id'] &&
          member.workspace_id === this.filters['workspace_members.workspace_id'],
      )
      .flatMap((member) => {
        const membership = this.fixtures.tenantMemberships.find(
          (candidate) =>
            candidate.tenant_id === member.tenant_id &&
            candidate.user_id === member.user_id &&
            candidate.is_active === this.filters['tenant_memberships.is_active'],
        );
        if (!membership) return [];
        const isDepartmentHead = this.fixtures.departmentHeads.some(
          (head) =>
            head.department_id === member.workspace_id && head.user_id === member.user_id,
        );
        const role =
          membership.role === 'admin'
            ? 'admin'
            : isDepartmentHead
              ? 'department_head'
              : member.role === 'manager' || membership.role === 'manager'
                ? 'manager'
                : 'employee';
        return [{ userId: member.user_id, role, isDepartmentHead }];
      });
    return Promise.resolve(members).then(onFulfilled, onRejected);
  }
}

class TenantMembershipsQuery {
  private filters: Record<string, unknown> = {};

  constructor(private readonly fixtures: Fixtures) {}

  where(filters: Record<string, unknown>): this {
    this.filters = { ...this.filters, ...filters };
    return this;
  }

  async first(): Promise<Fixtures['tenantMemberships'][number] | undefined> {
    return this.fixtures.tenantMemberships.find((membership) =>
      Object.entries(this.filters).every(
        ([column, expected]) =>
          membership[column.split('.').at(-1)! as keyof typeof membership] === expected,
      ),
    );
  }
}

function createTableAwareDb(fixtures: Fixtures): Knex {
  const db = ((tableName: string) => {
    if (tableName === 'tasks') return new TasksQuery(fixtures);
    if (tableName === 'workspace_members') return new WorkspaceMembersQuery(fixtures);
    if (tableName === 'tenant_memberships') return new TenantMembershipsQuery(fixtures);
    throw new Error(`Unexpected table: ${tableName}`);
  }) as unknown as Knex;
  db.raw = ((sql: string) => sql) as unknown as typeof db.raw;
  return db;
}

describe('ReportService report rows', () => {
  type ReportBuildFilter = Omit<Parameters<ReportService['build']>[0], 'scope'> & {
    scope?: Parameters<ReportService['build']>[0]['scope'];
  };

  const fixtures: Fixtures = {
    tasks: [
      {
        id: 'task-manager',
        tenant_id: 'tenant-1',
        department_id: 'dept-1',
        title: 'Manager task',
        status: 'in_progress',
        priority: 'high',
        visibility: 'department',
        assignee_id: 'manager-1',
        start_date: null,
        due_date: new Date('2026-08-01T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-07-01T00:00:00.000Z'),
        deleted_at: null,
      },
      {
        id: 'task-employee',
        tenant_id: 'tenant-1',
        department_id: 'dept-1',
        title: 'Employee task',
        status: 'todo',
        priority: 'medium',
        visibility: 'department',
        assignee_id: null,
        start_date: null,
        due_date: new Date('2026-08-02T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-07-02T00:00:00.000Z'),
        deleted_at: null,
      },
      {
        id: 'task-unassigned',
        tenant_id: 'tenant-1',
        department_id: 'dept-1',
        title: 'Unassigned task',
        status: 'todo',
        priority: 'low',
        visibility: 'department',
        assignee_id: null,
        start_date: null,
        due_date: new Date('2026-08-03T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-07-03T00:00:00.000Z'),
        deleted_at: null,
      },
      {
        id: 'task-other-manager',
        tenant_id: 'tenant-1',
        department_id: 'dept-1',
        title: 'Other manager task',
        status: 'todo',
        priority: 'normal',
        visibility: 'department',
        assignee_id: 'manager-2',
        start_date: null,
        due_date: new Date('2026-08-04T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-07-04T00:00:00.000Z'),
        deleted_at: null,
      },
      {
        id: 'task-department-head',
        tenant_id: 'tenant-1',
        department_id: 'dept-1',
        title: 'Department head task',
        status: 'todo',
        priority: 'medium',
        visibility: 'department',
        assignee_id: 'head-1',
        start_date: null,
        due_date: new Date('2026-08-05T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-07-05T00:00:00.000Z'),
        deleted_at: null,
      },
      {
        id: 'task-tenant-admin',
        tenant_id: 'tenant-1',
        department_id: 'dept-1',
        title: 'Tenant admin task',
        status: 'todo',
        priority: 'medium',
        visibility: 'department',
        assignee_id: 'admin-1',
        start_date: null,
        due_date: new Date('2026-08-06T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-07-06T00:00:00.000Z'),
        deleted_at: null,
      },
      {
        id: 'task-second-department',
        tenant_id: 'tenant-1',
        department_id: 'dept-2',
        title: 'Second department task',
        status: 'todo',
        priority: 'medium',
        visibility: 'department',
        assignee_id: null,
        start_date: null,
        due_date: new Date('2026-08-07T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-07-07T00:00:00.000Z'),
        deleted_at: null,
      },
      {
        id: 'task-other-tenant',
        tenant_id: 'tenant-2',
        department_id: 'dept-other-tenant',
        title: 'Other tenant task',
        status: 'todo',
        priority: 'medium',
        visibility: 'department',
        assignee_id: 'employee-1',
        start_date: null,
        due_date: new Date('2026-08-08T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-07-08T00:00:00.000Z'),
        deleted_at: null,
      },
      {
        id: 'task-deleted',
        tenant_id: 'tenant-1',
        department_id: 'dept-1',
        title: 'Deleted task',
        status: 'todo',
        priority: 'medium',
        visibility: 'department',
        assignee_id: 'manager-1',
        start_date: null,
        due_date: new Date('2026-08-09T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-07-09T00:00:00.000Z'),
        deleted_at: new Date('2026-07-10T00:00:00.000Z'),
      },
    ],
    workspaces: [
      { id: 'dept-1', name: 'CEPA' },
      { id: 'dept-2', name: 'Finance' },
      { id: 'dept-other-tenant', name: 'Other tenant department' },
    ],
    users: [
      { id: 'manager-1', display_name: 'Current Manager' },
      { id: 'manager-2', display_name: 'Other Manager' },
      { id: 'employee-1', display_name: 'Employee' },
      { id: 'head-1', display_name: 'Department Head' },
      { id: 'admin-1', display_name: 'Admin' },
    ],
    taskAssignees: [
      {
        tenant_id: 'tenant-1',
        task_id: 'task-employee',
        user_id: 'employee-1',
        is_primary: true,
      },
    ],
    workspaceMembers: [
      { tenant_id: 'tenant-1', workspace_id: 'dept-1', user_id: 'manager-1', role: 'manager' },
      { tenant_id: 'tenant-1', workspace_id: 'dept-1', user_id: 'manager-2', role: 'manager' },
      {
        tenant_id: 'tenant-1',
        workspace_id: 'dept-1',
        user_id: 'employee-1',
        role: 'member',
      },
      { tenant_id: 'tenant-1', workspace_id: 'dept-1', user_id: 'head-1', role: 'member' },
      { tenant_id: 'tenant-1', workspace_id: 'dept-1', user_id: 'admin-1', role: 'member' },
    ],
    departmentHeads: [{ department_id: 'dept-1', user_id: 'head-1' }],
    tenantMemberships: [
      { tenant_id: 'tenant-1', user_id: 'manager-1', role: 'manager', is_active: true },
      { tenant_id: 'tenant-1', user_id: 'manager-2', role: 'manager', is_active: true },
      { tenant_id: 'tenant-1', user_id: 'employee-1', role: 'member', is_active: true },
      { tenant_id: 'tenant-1', user_id: 'head-1', role: 'member', is_active: true },
      { tenant_id: 'tenant-1', user_id: 'admin-1', role: 'admin', is_active: true },
    ],
  };

  function runReport(
    role: DepartmentRole,
    filter: ReportBuildFilter,
  ) {
    const departmentAccess = {
      getReportScope: jest.fn().mockResolvedValue({
        departmentId: filter.departmentId,
        role,
        ownTasksOnly: role === 'employee',
      }),
    };
    const service = new ReportService(createTableAwareDb(fixtures), departmentAccess as never);
    const userId =
      role === 'admin' ? 'admin-1' : role === 'department_head' ? 'head-1' : 'manager-1';
    return tenantContext.run(
      {
        tenantId: 'tenant-1',
        userId,
        membershipId: `membership-${userId}`,
        role: role === 'department_head' ? 'member' : role,
        permissions: [],
      },
      () => service.build(filter as Parameters<ReportService['build']>[0]),
    );
  }

  it('manager combined includes self, peer managers, employees, and unassigned tasks', async () => {
    const report = await runReport('manager', { departmentId: 'dept-1' });

    expect(report.tasks.map((task) => task.title)).toEqual([
      'Manager task',
      'Employee task',
      'Unassigned task',
      'Other manager task',
    ]);
    expect(report.scope).toEqual({
      departmentId: 'dept-1',
      role: 'manager',
      mode: 'combined',
      ownTasksOnly: false,
    });
    expect(report.filters.scope).toBe('combined');
  });

  it('department head includes every current task in the selected department only', async () => {
    const report = await runReport('department_head', { departmentId: 'dept-1' });

    expect(report.tasks.map((task) => task.title)).toEqual([
      'Manager task',
      'Employee task',
      'Unassigned task',
      'Other manager task',
      'Department head task',
      'Tenant admin task',
    ]);
    expect(report.totals.tasks).toBe(6);
    expect(report.scope.mode).toBe('combined');
    expect(report.filters.scope).toBe('combined');
  });

  it('admin selected department includes every current task in that department only', async () => {
    const report = await runReport('admin', { departmentId: 'dept-1' });

    expect(report.tasks.map((task) => task.title)).toEqual([
      'Manager task',
      'Employee task',
      'Unassigned task',
      'Other manager task',
      'Department head task',
      'Tenant admin task',
    ]);
    expect(report.totals.tasks).toBe(6);
    expect(report.scope.departmentId).toBe('dept-1');
  });

  it('organization admin includes both tenant departments without crossing tenants', async () => {
    const report = await runReport('admin', {});

    expect(report.tasks.map((task) => task.title)).toEqual([
      'Manager task',
      'Employee task',
      'Unassigned task',
      'Other manager task',
      'Department head task',
      'Tenant admin task',
      'Second department task',
    ]);
    expect(report.totals.tasks).toBe(7);
    expect(report.scope).toEqual({
      departmentId: undefined,
      role: 'admin',
      mode: 'combined',
      ownTasksOnly: false,
    });
  });

  it('serializes the resolved individual scope and all active filters', async () => {
    const dateFrom = new Date('2026-07-01T00:00:00.000Z');
    const dateTo = new Date('2026-07-31T00:00:00.000Z');
    const report = await runReport('manager', {
      departmentId: 'dept-1',
      scope: 'individual',
      targetUserId: 'employee-1',
      dateFrom,
      dateTo,
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
    });

    expect(report.tasks.map((task) => task.title)).toEqual(['Employee task']);
    expect(report.filters).toEqual({
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      status: 'todo',
      priority: 'medium',
      assigneeId: undefined,
      scope: 'individual',
      targetUserId: 'employee-1',
    });
  });

  it('serializes combined scope with active date, status, and priority filters', async () => {
    const dateFrom = new Date('2026-07-01T00:00:00.000Z');
    const dateTo = new Date('2026-07-31T00:00:00.000Z');
    const report = await runReport('manager', {
      departmentId: 'dept-1',
      dateFrom,
      dateTo,
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
    });

    expect(report.tasks.map((task) => task.title)).toEqual(['Employee task']);
    expect(report.filters).toEqual({
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      status: 'todo',
      priority: 'medium',
      assigneeId: undefined,
      scope: 'combined',
      targetUserId: undefined,
    });
  });

  it('keeps an explicit assignee filter exact and excludes unassigned tasks', async () => {
    const report = await runReport('manager', {
      departmentId: 'dept-1',
      assigneeId: 'employee-1',
    });

    expect(report.tasks.map((task) => task.title)).toEqual(['Employee task']);
    expect(report.filters.assigneeId).toBe('employee-1');
  });

  it('allows an exact peer-manager assignee filter inside the department', async () => {
    const report = await runReport('manager', {
      departmentId: 'dept-1',
      assigneeId: 'manager-2',
    });

    expect(report.tasks.map((task) => task.title)).toEqual(['Other manager task']);
    expect(report.filters.assigneeId).toBe('manager-2');
  });
});
