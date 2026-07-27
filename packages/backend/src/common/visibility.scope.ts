/**
 * Visibility Scope — reusable query scopes for department-based access control.
 *
 * Applies filters ensuring users can only see items that belong to workspaces
 * (departments) they are members of, or that are `global`-visible.
 *
 * Org admins bypass all filters and see everything.
 */

import { Knex } from 'knex';
import type { TenantContextData } from './tenant-context';

/**
 * Apply visibility scope to a Knex query builder for tables that have a
 * `visibility` column (tasks, projects).
 *
 * Filters: visibility = 'global' OR workspace_id IN (user's workspaces)
 *
 * @param qb - The Knex query builder
 * @param ctx - The tenant context (user info)
 * @param workspaceIdColumn - The column name for workspace_id (default: 'workspace_id')
 * @param visibilityColumn - The qualified visibility column (default: 'visibility')
 */
export function applyVisibilityScope(
  qb: Knex.QueryBuilder,
  ctx: TenantContextData,
  workspaceIdColumn = 'workspace_id',
  visibilityColumn = 'visibility',
): Knex.QueryBuilder {
  // Org admin sees all
  if (ctx.role === 'admin') return qb;

  return qb.where((b) =>
    b.where(visibilityColumn, 'global').orWhereIn(workspaceIdColumn, function () {
      this.select('workspace_id').from('workspace_members').where('user_id', ctx.userId);
    }),
  );
}

/**
 * Apply the role-aware task scope from the department RBAC model.
 *
 * Employees see only tasks assigned to them. Managers see their own tasks and
 * tasks assigned to employees in departments they manage. Department heads
 * see every task in their departments. Tenant admins bypass this helper.
 */
export function applyTaskAccessScope(
  qb: Knex.QueryBuilder,
  ctx: TenantContextData,
): Knex.QueryBuilder {
  if (ctx.role === 'admin') return qb;

  return qb.andWhere((scope) => {
    scope
      .where('tasks.assignee_id', ctx.userId)
      .orWhereExists(function () {
        this.select(1)
          .from('task_assignees as own_ta')
          .whereRaw('own_ta.task_id = tasks.id')
          .andWhere('own_ta.tenant_id', ctx.tenantId)
          .andWhere('own_ta.user_id', ctx.userId);
      })
      .orWhereExists(function () {
        this.select(1)
          .from('department_heads as own_dh')
          .whereRaw('own_dh.department_id = tasks.department_id')
          .andWhere('own_dh.tenant_id', ctx.tenantId)
          .andWhere('own_dh.user_id', ctx.userId);
      })
      .orWhere((managerScope) => {
        managerScope
          .whereExists(function () {
            this.select(1)
              .from('workspace_members as actor_wm')
              .leftJoin('tenant_memberships as actor_tm', function () {
                this.on('actor_tm.tenant_id', '=', 'actor_wm.tenant_id').andOn(
                  'actor_tm.user_id',
                  '=',
                  'actor_wm.user_id',
                );
              })
              .whereRaw('actor_wm.workspace_id = tasks.department_id')
              .andWhere('actor_wm.tenant_id', ctx.tenantId)
              .andWhere('actor_wm.user_id', ctx.userId)
              .andWhere((role) =>
                role.where('actor_wm.role', 'manager').orWhere('actor_tm.role', 'manager'),
              );
          })
          .andWhere((employeeTask) => {
            employeeTask
              .where((unassigned) => {
                unassigned.whereNull('tasks.assignee_id').whereNotExists(function () {
                  this.select(1)
                    .from('task_assignees as any_ta')
                    .whereRaw('any_ta.task_id = tasks.id')
                    .andWhere('any_ta.tenant_id', ctx.tenantId);
                });
              })
              .orWhereIn('tasks.assignee_id', function () {
                this.select('employee_wm.user_id')
                  .from('workspace_members as employee_wm')
                  .whereRaw('employee_wm.workspace_id = tasks.department_id')
                  .andWhere('employee_wm.tenant_id', ctx.tenantId)
                  .andWhere('employee_wm.role', 'employee');
              })
              .orWhereExists(function () {
                this.select(1)
                  .from('task_assignees as employee_ta')
                  .join('workspace_members as employee_wm', function () {
                    this.on('employee_wm.user_id', '=', 'employee_ta.user_id').andOn(
                      'employee_wm.workspace_id',
                      '=',
                      'tasks.department_id',
                    );
                  })
                  .whereRaw('employee_ta.task_id = tasks.id')
                  .andWhere('employee_ta.tenant_id', ctx.tenantId)
                  .andWhere('employee_wm.tenant_id', ctx.tenantId)
                  .andWhere('employee_wm.role', 'employee');
              });
          });
      });
  });
}

/**
 * Apply visibility scope to tables WITHOUT a `visibility` column (folders).
 * Filters: workspace_id IN (user's workspaces) only.
 *
 * @param qb - The Knex query builder
 * @param ctx - The tenant context (user info)
 */
export function applyFolderVisibilityScope(
  qb: Knex.QueryBuilder,
  ctx: TenantContextData,
): Knex.QueryBuilder {
  // Org admin sees all
  if (ctx.role === 'admin') return qb;

  return qb.whereIn('workspace_id', function () {
    this.select('workspace_id').from('workspace_members').where('user_id', ctx.userId);
  });
}
