import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type {
  DashboardOverview,
  DashboardTaskBucket,
  DashboardTaskListResponse,
  DashboardTaskSummary,
  DashboardViewerRole,
} from '@wrike-clone/shared';
import type { Knex } from 'knex';
import { requireTenantContext } from '../common/tenant-context';
import { DATABASE_PROVIDER } from '../database/database.module';
import { DepartmentAccessService } from '../rbac/department-access.service';
import {
  buildDashboardMetrics,
  taskMatchesDashboardBucket,
  type DashboardTaskRow,
} from './dashboard-metrics';

export interface DashboardQueryScope {
  tenantId: string;
  userId: string;
  role: DashboardViewerRole;
  departmentId?: string;
}

function managerEmployeeIds(db: Knex, scope: DashboardQueryScope): Knex.QueryBuilder {
  return db('workspace_members as dashboard_member_workspace')
    .join('tenant_memberships as dashboard_member_tenant', function () {
      this.on(
        'dashboard_member_tenant.tenant_id',
        '=',
        'dashboard_member_workspace.tenant_id',
      ).andOn(
        'dashboard_member_tenant.user_id',
        '=',
        'dashboard_member_workspace.user_id',
      );
    })
    .where('dashboard_member_workspace.tenant_id', scope.tenantId)
    .where('dashboard_member_workspace.workspace_id', scope.departmentId!)
    .where('dashboard_member_tenant.is_active', true)
    .whereNot('dashboard_member_tenant.role', 'admin')
    .whereNot('dashboard_member_workspace.role', 'manager')
    .whereNot('dashboard_member_tenant.role', 'manager')
    .whereNotExists(function () {
      this.select(1)
        .from('department_heads as dashboard_member_head')
        .whereRaw(
          'dashboard_member_head.department_id = dashboard_member_workspace.workspace_id',
        )
        .whereRaw('dashboard_member_head.user_id = dashboard_member_workspace.user_id')
        .andWhere('dashboard_member_head.tenant_id', scope.tenantId);
    })
    .select('dashboard_member_workspace.user_id');
}

function applyEmployeeScope(query: Knex.QueryBuilder, scope: DashboardQueryScope): void {
  query.andWhere((visible) => {
    visible.where('tasks.assignee_id', scope.userId).orWhereExists(function () {
      this.select(1)
        .from('task_assignees as dashboard_self_ta')
        .whereRaw('dashboard_self_ta.task_id = tasks.id')
        .andWhere('dashboard_self_ta.tenant_id', scope.tenantId)
        .andWhere('dashboard_self_ta.user_id', scope.userId);
    });
  });
}

function applyManagerScope(
  db: Knex,
  query: Knex.QueryBuilder,
  scope: DashboardQueryScope,
): void {
  query.andWhere((visible) => {
    visible
      .where('tasks.assignee_id', scope.userId)
      .orWhereIn('tasks.assignee_id', managerEmployeeIds(db, scope))
      .orWhereExists(function () {
        this.select(1)
          .from('task_assignees as dashboard_manager_ta')
          .whereRaw('dashboard_manager_ta.task_id = tasks.id')
          .andWhere('dashboard_manager_ta.tenant_id', scope.tenantId)
          .andWhere((assigned) => {
            assigned
              .where('dashboard_manager_ta.user_id', scope.userId)
              .orWhereIn('dashboard_manager_ta.user_id', managerEmployeeIds(db, scope));
          });
      })
      .orWhere((unassigned) => {
        unassigned.whereNull('tasks.assignee_id').whereNotExists(function () {
          this.select(1)
            .from('task_assignees as dashboard_any_ta')
            .whereRaw('dashboard_any_ta.task_id = tasks.id')
            .andWhere('dashboard_any_ta.tenant_id', scope.tenantId);
        });
      });
  });
}

function assigneeProjection(db: Knex, scope: DashboardQueryScope): Knex.Raw {
  let rolePredicate = '';
  const bindings: Knex.RawBinding[] = [scope.tenantId];

  if (scope.role === 'employee') {
    rolePredicate = 'WHERE "dashboard_assignees"."user_id" = ?';
    bindings.push(scope.userId);
  } else if (scope.role === 'manager') {
    rolePredicate = `
      WHERE "dashboard_assignees"."user_id" = ?
        OR EXISTS (
          SELECT 1
          FROM "workspace_members" AS "dashboard_member_workspace"
          JOIN "tenant_memberships" AS "dashboard_member_tenant"
            ON "dashboard_member_tenant"."tenant_id" =
              "dashboard_member_workspace"."tenant_id"
           AND "dashboard_member_tenant"."user_id" =
              "dashboard_member_workspace"."user_id"
          WHERE "dashboard_member_workspace"."tenant_id" = ?
            AND "dashboard_member_workspace"."workspace_id" = "tasks"."department_id"
            AND "dashboard_member_workspace"."user_id" =
              "dashboard_assignees"."user_id"
            AND "dashboard_member_tenant"."is_active" = ?
            AND "dashboard_member_tenant"."role" <> ?
            AND "dashboard_member_workspace"."role" <> ?
            AND "dashboard_member_tenant"."role" <> ?
            AND NOT EXISTS (
              SELECT 1
              FROM "department_heads" AS "dashboard_member_head"
              WHERE "dashboard_member_head"."tenant_id" = ?
                AND "dashboard_member_head"."department_id" =
                  "dashboard_member_workspace"."workspace_id"
                AND "dashboard_member_head"."user_id" =
                  "dashboard_member_workspace"."user_id"
            )
        )
    `;
    bindings.push(
      scope.userId,
      scope.tenantId,
      true,
      'admin',
      'manager',
      'manager',
      scope.tenantId,
    );
  }

  return db.raw(
    `
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'userId', "dashboard_assignees"."user_id",
              'name', "dashboard_assignees"."display_name"
            )
            ORDER BY
              "dashboard_assignees"."display_name",
              "dashboard_assignees"."user_id"
          )
          FROM (
            SELECT
              "dashboard_ta"."user_id",
              "dashboard_user"."display_name"
            FROM "task_assignees" AS "dashboard_ta"
            JOIN "users" AS "dashboard_user"
              ON "dashboard_user"."id" = "dashboard_ta"."user_id"
            WHERE "dashboard_ta"."task_id" = "tasks"."id"
              AND "dashboard_ta"."tenant_id" = ?
            UNION
            SELECT
              "legacy_user"."id" AS "user_id",
              "legacy_user"."display_name"
            FROM "users" AS "legacy_user"
            WHERE "legacy_user"."id" = "tasks"."assignee_id"
          ) AS "dashboard_assignees"
          ${rolePredicate}
        ),
        '[]'::jsonb
      ) AS "assignees"
    `,
    bindings,
  );
}

export function buildDashboardRowsQuery(
  db: Knex,
  scope: DashboardQueryScope,
): Knex.QueryBuilder {
  const query = db('tasks')
    .join('workspaces', function () {
      this.on('workspaces.id', '=', 'tasks.department_id').andOn(
        'workspaces.tenant_id',
        '=',
        'tasks.tenant_id',
      );
    })
    .leftJoin('projects as dashboard_project', function () {
      this.on('dashboard_project.id', '=', 'tasks.project_id').andOn(
        'dashboard_project.tenant_id',
        '=',
        'tasks.tenant_id',
      );
    })
    .leftJoin('users as dashboard_handoff_owner', 'dashboard_handoff_owner.id', 'tasks.handoff_owner_id')
    .where('tasks.tenant_id', scope.tenantId)
    .whereNull('tasks.deleted_at')
    .select(
      'tasks.id',
      'tasks.title',
      'tasks.status',
      'tasks.priority',
      'tasks.department_id as departmentId',
      'workspaces.name as departmentName',
      'tasks.created_at as createdAt',
      'tasks.completed_at as completedAt',
      'tasks.due_date as dueDate',
      'tasks.handoff_status as handoffStatus',
      'tasks.handoff_ready_at as handoffReadyAt',
      'tasks.updated_at as updatedAt',
      'tasks.project_id as projectId',
      'dashboard_project.name as projectName',
      db.raw(
        `CASE WHEN dashboard_handoff_owner.id IS NULL THEN NULL ELSE jsonb_build_object('id', dashboard_handoff_owner.id, 'displayName', dashboard_handoff_owner.display_name, 'email', dashboard_handoff_owner.email) END AS "handoffOwner"`,
      ),
      assigneeProjection(db, scope),
    );

  if (scope.departmentId) {
    query.andWhere('tasks.department_id', scope.departmentId);
  }

  if (scope.role === 'employee') {
    applyEmployeeScope(query, scope);
  } else if (scope.role === 'manager') {
    applyManagerScope(db, query, scope);
  }

  return query.orderBy('tasks.id', 'asc');
}

function isDashboardRole(role: string): role is DashboardViewerRole {
  return (
    role === 'employee' ||
    role === 'manager' ||
    role === 'department_head' ||
    role === 'admin'
  );
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareNullableDate(left: Date | null, right: Date | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.getTime() - right.getTime();
}

function compareDashboardTaskRows(left: DashboardTaskRow, right: DashboardTaskRow): number {
  return (
    compareNullableDate(left.handoffReadyAt, right.handoffReadyAt) ||
    compareNullableDate(left.dueDate, right.dueDate) ||
    right.updatedAt.getTime() - left.updatedAt.getTime() ||
    compareText(left.title, right.title) ||
    compareText(left.id, right.id)
  );
}

function toDashboardTaskSummary(row: DashboardTaskRow): DashboardTaskSummary {
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    projectName: row.projectName,
    departmentId: row.departmentId,
    status: row.status as DashboardTaskSummary['status'],
    handoffStatus: row.handoffStatus as DashboardTaskSummary['handoffStatus'],
    handoffOwner: row.handoffOwner,
    assignees: row.assignees,
    dueDate: row.dueDate?.toISOString() ?? null,
    handoffReadyAt: row.handoffReadyAt?.toISOString() ?? null,
  };
}

function buildDepartmentComparison(
  rows: DashboardTaskRow[],
  now: Date,
): DashboardOverview['departments'] {
  const byDepartment = new Map<
    string,
    {
      id: string;
      name: string;
      total: number;
      active: number;
      completed: number;
      overdue: number;
    }
  >();

  for (const row of rows) {
    const current = byDepartment.get(row.departmentId) ?? {
      id: row.departmentId,
      name: row.departmentName,
      total: 0,
      active: 0,
      completed: 0,
      overdue: 0,
    };
    if (compareText(row.departmentName, current.name) < 0) {
      current.name = row.departmentName;
    }
    current.total += 1;
    if (row.status === 'completed') {
      current.completed += 1;
    } else {
      current.active += 1;
      if (row.dueDate && row.dueDate.getTime() < now.getTime()) {
        current.overdue += 1;
      }
    }
    byDepartment.set(row.departmentId, current);
  }

  return [...byDepartment.values()]
    .map(({ total, completed, ...department }) => ({
      ...department,
      completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    }))
    .sort(
      (left, right) =>
        compareText(left.name, right.name) || compareText(left.id, right.id),
    );
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccess: DepartmentAccessService,
  ) {}

  private async resolveScope(departmentIdInput?: string): Promise<{
    role: DashboardViewerRole;
    scope: DashboardQueryScope;
  }> {
    const ctx = requireTenantContext();
    const resolved = await this.departmentAccess.getReportScope(departmentIdInput);
    if (!isDashboardRole(resolved.role)) {
      throw new ForbiddenException('Dashboard access denied');
    }
    if (resolved.role !== 'admin' && !resolved.departmentId) {
      throw new ForbiddenException('A department is required for dashboard access');
    }
    const departmentId =
      resolved.role === 'admin' ? departmentIdInput : resolved.departmentId;
    if (resolved.role === 'admin' && departmentId) {
      const department = await this.db('workspaces')
        .where({ id: departmentId, tenant_id: ctx.tenantId })
        .whereNull('deleted_at')
        .first('id');
      if (!department) {
        throw new ForbiddenException('Department access denied');
      }
    }

    return {
      role: resolved.role,
      scope: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: resolved.role,
        departmentId,
      },
    };
  }

  async overview(input: {
    departmentId?: string;
    days: 30;
  }): Promise<DashboardOverview> {
    const { role, scope } = await this.resolveScope(input.departmentId);
    const now = new Date();
    const rows = (await buildDashboardRowsQuery(this.db, scope)) as DashboardTaskRow[];
    const metrics = buildDashboardMetrics(rows, now, input.days);

    return {
      generatedAt: now.toISOString(),
      windowDays: input.days,
      scope: {
        departmentId: scope.departmentId,
        role,
      },
      ...metrics,
      departments:
        role === 'admin' ? buildDepartmentComparison(rows, now) : [],
    };
  }

  async tasks(input: {
    departmentId?: string;
    days: 30;
    bucket: DashboardTaskBucket;
  }): Promise<DashboardTaskListResponse> {
    const { scope } = await this.resolveScope(input.departmentId);
    const now = new Date();
    const rows = (await buildDashboardRowsQuery(this.db, scope)) as DashboardTaskRow[];

    return {
      generatedAt: now.toISOString(),
      bucket: input.bucket,
      data: rows
        .filter((row) => taskMatchesDashboardBucket(row, input.bucket, now))
        .sort(compareDashboardTaskRows)
        .map(toDashboardTaskSummary),
    };
  }
}
