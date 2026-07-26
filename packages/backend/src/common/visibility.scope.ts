/**
 * Visibility Scope — reusable query scopes for department-based access control.
 *
 * Applies filters ensuring users can only see items that belong to workspaces
 * (departments) they are members of, or that are `organization`-visible.
 *
 * Org admins bypass all filters and see everything.
 */

import { Knex } from 'knex';
import type { TenantContextData } from './tenant-context';

/**
 * Apply visibility scope to a Knex query builder for tables that have a
 * `visibility` column (tasks, projects).
 *
 * Filters: visibility = 'organization' OR workspace_id IN (user's workspaces)
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
    b.where(visibilityColumn, 'organization')
      .orWhereIn(workspaceIdColumn, function () {
        this.select('workspace_id')
          .from('workspace_members')
          .where('user_id', ctx.userId);
      }),
  );
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
    this.select('workspace_id')
      .from('workspace_members')
      .where('user_id', ctx.userId);
  });
}
