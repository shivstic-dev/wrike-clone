import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type TimelineQuery,
  type TimelineResponse,
  type TimelineTask,
  type UpdateTaskScheduleInput,
  updateTaskScheduleSchema,
} from '@wrike-clone/shared';
import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';
import { applyTaskAccessScope } from '../common/visibility.scope';
import { requireTenantContext, type TenantContextData } from '../common/tenant-context';
import { DATABASE_PROVIDER } from '../database/database.module';
import { DepartmentAccessService, type DepartmentRole } from '../rbac/department-access.service';
import { criticalPathTaskIds, type DependencyEdge } from './dependency-graph';

type TimelineRow = Record<string, unknown> & {
  id: string;
  department_id: string;
  start_date: Date | string | null;
  due_date: Date | string | null;
};

interface CapabilityDepartmentRow {
  department_id: string;
  workspace_role: string;
  department_head_user_id: string | null;
}

interface TimelineCursor {
  startDate: string;
  dueDate: string;
  id: string;
}

/** Decodes the intentionally opaque timeline continuation cursor. */
export function decodeTimelineCursor(cursor: string): TimelineCursor {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof (decoded as TimelineCursor).startDate !== 'string' ||
      typeof (decoded as TimelineCursor).dueDate !== 'string' ||
      typeof (decoded as TimelineCursor).id !== 'string' ||
      Number.isNaN(new Date((decoded as TimelineCursor).startDate).getTime()) ||
      Number.isNaN(new Date((decoded as TimelineCursor).dueDate).getTime())
    ) {
      throw new Error('invalid shape');
    }
    return decoded as TimelineCursor;
  } catch {
    throw new BadRequestException('Invalid timeline cursor');
  }
}

function encodeTimelineCursor(row: TimelineRow): string {
  return Buffer.from(
    JSON.stringify({
      startDate: toIso(row.start_date),
      dueDate: toIso(row.due_date),
      id: row.id,
    } satisfies TimelineCursor),
  ).toString('base64url');
}

function toIso(value: Date | string | null): string {
  if (value === null) throw new RangeError('Scheduled tasks require both dates');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid timeline task date');
  return date.toISOString();
}

function applyTimelineFilters(query: Knex.QueryBuilder, input: TimelineQuery): Knex.QueryBuilder {
  if (input.departmentId) query.andWhere('tasks.department_id', input.departmentId);
  if (input.projectId) query.andWhere('tasks.project_id', input.projectId);
  if (input.assigneeId) {
    query.andWhere((assignee) => {
      assignee.where('tasks.assignee_id', input.assigneeId).orWhereExists(function () {
        this.select(1)
          .from('task_assignees as timeline_assignee')
          .whereRaw('timeline_assignee.task_id = tasks.id')
          .andWhereRaw('timeline_assignee.tenant_id = tasks.tenant_id')
          .andWhere('timeline_assignee.user_id', input.assigneeId!);
      });
    });
  }
  if (input.status?.length) query.whereIn('tasks.status', input.status);
  return query;
}

function baseTimelineQuery(
  db: Knex,
  ctx: TenantContextData,
  input: TimelineQuery,
): Knex.QueryBuilder {
  const assigneeSummary = db.raw(
    `COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', timeline_assignee.id,
        'task_id', timeline_assignee.task_id,
        'user_id', timeline_assignee.user_id,
        'assigned_by_id', timeline_assignee.assigned_by_id
      ) ORDER BY timeline_assignee.user_id)
      FROM task_assignees AS timeline_assignee
      WHERE timeline_assignee.task_id = tasks.id
        AND timeline_assignee.tenant_id = tasks.tenant_id
    ), '[]'::jsonb) AS assignees`,
  );

  const query = db('tasks')
    .leftJoin('projects as timeline_project', function () {
      this.on('timeline_project.id', '=', 'tasks.project_id').andOn(
        'timeline_project.tenant_id',
        '=',
        'tasks.tenant_id',
      );
    })
    .leftJoin('workspaces as timeline_department', function () {
      this.on('timeline_department.id', '=', 'tasks.department_id').andOn(
        'timeline_department.tenant_id',
        '=',
        'tasks.tenant_id',
      );
    })
    .where('tasks.tenant_id', ctx.tenantId)
    .whereNull('tasks.deleted_at')
    .select(
      'tasks.*',
      'timeline_project.name as project_name',
      'timeline_department.name as department_name',
      assigneeSummary,
    );

  applyTaskAccessScope(query, ctx);
  return applyTimelineFilters(query, input);
}

export function buildScheduledTimelineQuery(
  db: Knex,
  ctx: TenantContextData,
  input: TimelineQuery,
): Knex.QueryBuilder {
  const query = baseTimelineQuery(db, ctx, input)
    .whereNotNull('tasks.start_date')
    .whereNotNull('tasks.due_date');
  if (input.to) query.andWhere('tasks.start_date', '<=', input.to);
  if (input.from) query.andWhere('tasks.due_date', '>=', input.from);
  if (input.cursor) {
    const cursor = decodeTimelineCursor(input.cursor);
    query.andWhere((afterCursor) => {
      afterCursor
        .where('tasks.start_date', '>', cursor.startDate)
        .orWhere((sameStart) => {
          sameStart
            .where('tasks.start_date', cursor.startDate)
            .andWhere('tasks.due_date', '>', cursor.dueDate);
        })
        .orWhere((sameTuple) => {
          sameTuple
            .where('tasks.start_date', cursor.startDate)
            .andWhere('tasks.due_date', cursor.dueDate)
            .andWhere('tasks.id', '>', cursor.id);
        });
    });
  }
  return query
    .orderBy('tasks.start_date', 'asc')
    .orderBy('tasks.due_date', 'asc')
    .orderBy('tasks.id', 'asc');
}

export function buildUnscheduledTimelineQuery(
  db: Knex,
  ctx: TenantContextData,
  input: TimelineQuery,
): Knex.QueryBuilder {
  return baseTimelineQuery(db, ctx, input)
    .andWhere((unscheduled) => {
      unscheduled.whereNull('tasks.start_date').orWhereNull('tasks.due_date');
    })
    .orderBy('tasks.updated_at', 'desc')
    .orderBy('tasks.id', 'asc');
}

@Injectable()
export class TimelineService {
  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccess: DepartmentAccessService,
  ) {}

  async dashboard(input: TimelineQuery): Promise<TimelineResponse> {
    if (input.departmentId) await this.departmentAccess.assertCanViewDepartment(input.departmentId);
    return this.read(input);
  }

  async project(
    projectId: string,
    input: Omit<TimelineQuery, 'projectId'>,
  ): Promise<TimelineResponse> {
    const ctx = requireTenantContext();
    const project = await this.db('projects as timeline_project')
      .leftJoin('folders as timeline_folder', function () {
        this.on('timeline_folder.id', '=', 'timeline_project.folder_id').andOn(
          'timeline_folder.tenant_id',
          '=',
          'timeline_project.tenant_id',
        );
      })
      .where('timeline_project.id', projectId)
      .andWhere('timeline_project.tenant_id', ctx.tenantId)
      .whereNull('timeline_project.deleted_at')
      .select('timeline_project.id', 'timeline_folder.workspace_id as department_id')
      .first();
    if (!project?.department_id) throw new NotFoundException('Project not found');
    await this.departmentAccess.assertCanViewDepartment(project.department_id);
    return this.read({ ...input, projectId });
  }

  async updateSchedule(taskId: string, input: UpdateTaskScheduleInput): Promise<TimelineTask> {
    const parsed = updateTaskScheduleSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid task schedule');
    const ctx = requireTenantContext();
    const updated = await this.db.transaction(async (trx) => {
      const current = await trx('tasks')
        .where({ id: taskId, tenant_id: ctx.tenantId })
        .whereNull('deleted_at')
        .forUpdate()
        .first();
      if (!current) throw new NotFoundException('Task not found');
      await this.departmentAccess.assertCanManageTask(current.department_id, current.id, trx);

      const rows = await trx('tasks')
        .where({
          id: taskId,
          tenant_id: ctx.tenantId,
          updated_at: new Date(parsed.data.expectedUpdatedAt),
        })
        .whereNull('deleted_at')
        .update({
          start_date: parsed.data.startDate,
          due_date: parsed.data.dueDate,
          updated_at: new Date(),
        })
        .returning('*');
      const [row] = rows;
      if (!row) {
        throw new ConflictException({
          code: 'STALE_TASK',
          message: 'This task schedule changed elsewhere.',
          current: await this.currentSchedule(trx, taskId),
        });
      }
      await trx('activity_logs').insert({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        actor_id: ctx.userId,
        entity_type: 'task',
        entity_id: taskId,
        action: 'task:schedule:updated',
        changes: JSON.stringify({
          startDate: { old: current.start_date, new: parsed.data.startDate },
          dueDate: { old: current.due_date, new: parsed.data.dueDate },
        }),
        metadata: '{}',
      });
      return row as TimelineRow;
    });
    return this.toTask(updated, new Map([[updated.id, true]]), new Set());
  }

  private async read(input: TimelineQuery): Promise<TimelineResponse> {
    const ctx = requireTenantContext();
    const perPage = input.perPage ?? 500;
    const [scheduledRows, unscheduledRows] = await Promise.all([
      buildScheduledTimelineQuery(this.db, ctx, input).limit(perPage + 1) as Promise<TimelineRow[]>,
      buildUnscheduledTimelineQuery(this.db, ctx, input).limit(perPage) as Promise<TimelineRow[]>,
    ]);
    const hasMore = scheduledRows.length > perPage;
    const scheduled = scheduledRows.slice(0, perPage);
    const allRows = [...scheduled, ...unscheduledRows];
    const ids = allRows.map((row) => row.id);
    const dependencies = await this.readDependencies(ctx.tenantId, ids);
    const critical = input.includeCriticalPath
      ? criticalPathTaskIds(
          scheduled.map((task) => ({
            id: task.id,
            startDate: task.start_date === null ? null : toIso(task.start_date),
            dueDate: task.due_date === null ? null : toIso(task.due_date),
          })),
          dependencies.map((dependency) => ({
            taskId: dependency.task_id,
            dependsOnTaskId: dependency.depends_on_task_id,
            dependencyType: dependency.dependency_type,
            lagDays: Number(dependency.lag_days),
          })) as DependencyEdge[],
        )
      : new Set<string>();
    const capabilities = await this.resolveCapabilities(allRows);

    return {
      tasks: scheduled.map((row) => this.toTask(row, capabilities, critical)),
      unscheduled: unscheduledRows.map((row) => this.toTask(row, capabilities, critical)),
      dependencies: dependencies.map((dependency) => ({
        id: dependency.id,
        taskId: dependency.task_id,
        dependsOnTaskId: dependency.depends_on_task_id,
        dependencyType: dependency.dependency_type,
        lagDays: Number(dependency.lag_days),
      })),
      meta: {
        from: input.from ?? '',
        to: input.to ?? '',
        nextCursor: hasMore ? encodeTimelineCursor(scheduled[scheduled.length - 1]!) : null,
      },
    };
  }

  private async currentSchedule(
    trx: Knex,
    taskId: string,
  ): Promise<Record<string, unknown> | null> {
    const ctx = requireTenantContext();
    const task = await trx('tasks')
      .where({ id: taskId, tenant_id: ctx.tenantId })
      .whereNull('deleted_at')
      .select('id', 'start_date', 'due_date', 'updated_at')
      .first();
    return task ?? null;
  }

  private async readDependencies(
    tenantId: string,
    taskIds: string[],
  ): Promise<Array<Record<string, any>>> {
    if (taskIds.length === 0) return [];
    return this.db('task_dependencies')
      .where('tenant_id', tenantId)
      .whereIn('task_id', taskIds)
      .whereIn('depends_on_task_id', taskIds)
      .select('id', 'task_id', 'depends_on_task_id', 'dependency_type', 'lag_days')
      .orderBy('task_id', 'asc')
      .orderBy('depends_on_task_id', 'asc');
  }

  private async resolveCapabilities(rows: TimelineRow[]): Promise<Map<string, boolean>> {
    const capabilities = new Map(rows.map((row) => [row.id, false]));
    if (rows.length === 0) return capabilities;

    const ctx = requireTenantContext();
    const tenantMembership = await this.db('tenant_memberships')
      .where({ tenant_id: ctx.tenantId, user_id: ctx.userId, is_active: true })
      .first('role');
    if (!tenantMembership) return capabilities;
    if (tenantMembership.role === 'admin') {
      for (const row of rows) capabilities.set(row.id, true);
      return capabilities;
    }

    const departmentIds = [...new Set(rows.map((row) => row.department_id))];
    const departmentMemberships = (await this.db('workspace_members as capability_actor_wm')
      .leftJoin('department_heads as capability_actor_dh', function () {
        this.on('capability_actor_dh.department_id', '=', 'capability_actor_wm.workspace_id')
          .andOn('capability_actor_dh.tenant_id', '=', 'capability_actor_wm.tenant_id')
          .andOn('capability_actor_dh.user_id', '=', 'capability_actor_wm.user_id');
      })
      .where({
        'capability_actor_wm.tenant_id': ctx.tenantId,
        'capability_actor_wm.user_id': ctx.userId,
      })
      .whereIn('capability_actor_wm.workspace_id', departmentIds)
      .select(
        'capability_actor_wm.workspace_id as department_id',
        'capability_actor_wm.role as workspace_role',
        'capability_actor_dh.user_id as department_head_user_id',
      )) as CapabilityDepartmentRow[];

    const roles = new Map<string, DepartmentRole>();
    for (const membership of departmentMemberships) {
      const role: DepartmentRole = membership.department_head_user_id
        ? 'department_head'
        : tenantMembership.role === 'manager' || membership.workspace_role === 'manager'
          ? 'manager'
          : 'employee';
      roles.set(membership.department_id, role);
    }

    const managerTaskIds: string[] = [];
    const managerDepartmentIds = new Set<string>();
    for (const row of rows) {
      const role = roles.get(row.department_id) ?? 'none';
      if (role === 'department_head') capabilities.set(row.id, true);
      if (role === 'manager') {
        capabilities.set(row.id, true);
        managerTaskIds.push(row.id);
        managerDepartmentIds.add(row.department_id);
      }
    }
    if (managerTaskIds.length === 0) return capabilities;

    const peerManagerTasks = (await this.db('tasks as capability_task')
      .join('workspace_members as capability_peer_wm', function () {
        this.on('capability_peer_wm.workspace_id', '=', 'capability_task.department_id').andOn(
          'capability_peer_wm.tenant_id',
          '=',
          'capability_task.tenant_id',
        );
      })
      .join('tenant_memberships as capability_peer_tm', function () {
        this.on('capability_peer_tm.tenant_id', '=', 'capability_peer_wm.tenant_id').andOn(
          'capability_peer_tm.user_id',
          '=',
          'capability_peer_wm.user_id',
        );
      })
      .where('capability_task.tenant_id', ctx.tenantId)
      .whereNull('capability_task.deleted_at')
      .whereIn('capability_task.id', managerTaskIds)
      .whereIn('capability_task.department_id', [...managerDepartmentIds])
      .where('capability_peer_tm.is_active', true)
      .whereNot('capability_peer_wm.user_id', ctx.userId)
      .andWhere((managerRole) => {
        managerRole
          .where('capability_peer_wm.role', 'manager')
          .orWhere('capability_peer_tm.role', 'manager');
      })
      .andWhere((assigned) => {
        assigned
          .whereRaw('capability_task.assignee_id = capability_peer_wm.user_id')
          .orWhereExists(function () {
            this.select(1)
              .from('task_assignees as capability_peer_ta')
              .whereRaw('capability_peer_ta.task_id = capability_task.id')
              .andWhereRaw('capability_peer_ta.tenant_id = capability_task.tenant_id')
              .whereRaw('capability_peer_ta.user_id = capability_peer_wm.user_id');
          });
      })
      .distinct('capability_task.id as task_id')) as Array<{ task_id: string }>;

    for (const row of peerManagerTasks) capabilities.set(row.task_id, false);
    return capabilities;
  }

  private toTask(
    row: TimelineRow,
    capabilities: Map<string, boolean>,
    critical: Set<string>,
  ): TimelineTask {
    const canManage = capabilities.get(row.id) ?? false;
    return {
      ...(row as unknown as TimelineTask),
      capabilities: { canEditSchedule: canManage, canManageDependencies: canManage },
      isCritical: critical.has(row.id),
    };
  }
}
