import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';

export type DepartmentRole = 'admin' | 'department_head' | 'manager' | 'employee' | 'none';

@Injectable()
export class DepartmentAccessService {
  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async isTenantAdmin(executor: Knex | Knex.Transaction = this.db): Promise<boolean> {
    const ctx = requireTenantContext();
    const membership = await executor('tenant_memberships')
      .where({
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        is_active: true,
        role: 'admin',
      })
      .first();
    return !!membership;
  }

  async getRole(
    departmentId: string,
    userId?: string,
    executor: Knex | Knex.Transaction = this.db,
  ): Promise<DepartmentRole> {
    const ctx = requireTenantContext();
    const targetUserId = userId || ctx.userId;

    const tenantMembership = await executor('tenant_memberships')
      .where({
        tenant_id: ctx.tenantId,
        user_id: targetUserId,
        is_active: true,
      })
      .first();

    if (!tenantMembership) return 'none';
    if (tenantMembership.role === 'admin') return 'admin';

    const membership = await executor('workspace_members')
      .where({
        tenant_id: ctx.tenantId,
        workspace_id: departmentId,
        user_id: targetUserId,
      })
      .first();
    if (!membership) return 'none';

    const departmentHead = await executor('department_heads')
      .where({
        tenant_id: ctx.tenantId,
        department_id: departmentId,
        user_id: targetUserId,
      })
      .first();
    if (departmentHead) return 'department_head';

    // Retain compatibility for existing tenant-level manager accounts while
    // still requiring membership in the specific department.
    if (tenantMembership.role === 'manager' || membership.role === 'manager') return 'manager';
    return 'employee';
  }

  async assertCanCreateTask(
    departmentId: string,
    executor: Knex | Knex.Transaction = this.db,
  ): Promise<DepartmentRole> {
    return this.assertRole(departmentId, ['admin', 'department_head', 'manager'], executor);
  }

  async assertCanManageTask(
    departmentId: string,
    taskId: string,
    executor: Knex | Knex.Transaction = this.db,
  ): Promise<DepartmentRole> {
    const ctx = requireTenantContext();
    const actorRole = await this.assertRole(
      departmentId,
      ['admin', 'department_head', 'manager'],
      executor,
    );
    if (actorRole !== 'manager') return actorRole;

    const peerManager = await executor('workspace_members as peer_manager_wm')
      .join('tenant_memberships as peer_manager_tm', function () {
        this.on('peer_manager_tm.tenant_id', '=', 'peer_manager_wm.tenant_id').andOn(
          'peer_manager_tm.user_id',
          '=',
          'peer_manager_wm.user_id',
        );
      })
      .where({
        'peer_manager_wm.tenant_id': ctx.tenantId,
        'peer_manager_wm.workspace_id': departmentId,
        'peer_manager_tm.is_active': true,
      })
      .whereNot('peer_manager_wm.user_id', ctx.userId)
      .andWhere((managerRole) => {
        managerRole
          .where('peer_manager_wm.role', 'manager')
          .orWhere('peer_manager_tm.role', 'manager');
      })
      .andWhere((assigned) => {
        assigned
          .whereExists(function () {
            this.select(1)
              .from('tasks as peer_primary_task')
              .whereRaw('peer_primary_task.id = ?', [taskId])
              .andWhere('peer_primary_task.tenant_id', ctx.tenantId)
              .whereNull('peer_primary_task.deleted_at')
              .whereRaw('peer_primary_task.assignee_id = peer_manager_wm.user_id');
          })
          .orWhereExists(function () {
            this.select(1)
              .from('task_assignees as peer_task_assignee')
              .where('peer_task_assignee.task_id', taskId)
              .andWhere('peer_task_assignee.tenant_id', ctx.tenantId)
              .whereRaw('peer_task_assignee.user_id = peer_manager_wm.user_id');
          });
      })
      .first('peer_manager_wm.user_id');

    if (peerManager) {
      throw new ForbiddenException("Managers cannot modify another manager's task");
    }
    return actorRole;
  }

  async assertCanViewGroupedTasks(departmentId: string): Promise<DepartmentRole> {
    return this.assertRole(departmentId, ['admin', 'department_head', 'manager']);
  }

  async assertCanChangeMemberRole(departmentId: string): Promise<DepartmentRole> {
    return this.assertRole(departmentId, ['admin', 'department_head']);
  }

  async assertCanAssignTo(
    departmentId: string,
    targetUserId: string,
    executor: Knex | Knex.Transaction = this.db,
  ): Promise<DepartmentRole> {
    const ctx = requireTenantContext();
    const actorRole = await this.getRole(departmentId, undefined, executor);
    const targetRole = await this.getRole(departmentId, targetUserId, executor);

    if (targetRole === 'none' || targetRole === 'admin') {
      throw new ForbiddenException('Assignee must be an active member of this department');
    }
    if (actorRole === 'admin' || actorRole === 'department_head') return actorRole;
    if (actorRole === 'manager' && (targetRole === 'employee' || targetUserId === ctx.userId)) {
      return actorRole;
    }
    throw new ForbiddenException('Managers may only assign employees or themselves');
  }

  async assertCanSetVisibility(
    departmentId: string,
    executor: Knex | Knex.Transaction = this.db,
  ): Promise<DepartmentRole> {
    return this.assertRole(departmentId, ['admin', 'department_head'], executor);
  }

  async assertCanChangeStatus(
    departmentId: string,
    taskIdOrAssigneeId: string | null,
    assigneeIdArgument?: string | null,
    executor: Knex | Knex.Transaction = this.db,
  ): Promise<void> {
    const ctx = requireTenantContext();
    const hasTaskId = arguments.length >= 3;
    const taskId = hasTaskId ? taskIdOrAssigneeId : null;
    const assigneeId = hasTaskId ? assigneeIdArgument || null : taskIdOrAssigneeId;
    const role = await this.getRole(departmentId, undefined, executor);
    if (role === 'admin' || role === 'department_head') return;
    if (role === 'manager' && taskId) {
      await this.assertCanManageTask(departmentId, taskId, executor);
      return;
    }
    if (role === 'employee' && assigneeId === ctx.userId) return;
    if (role === 'employee' && taskId) {
      const assignment = await executor('task_assignees')
        .where({ tenant_id: ctx.tenantId, task_id: taskId, user_id: ctx.userId })
        .first();
      if (assignment) return;
    }
    throw new ForbiddenException('You may only change the status of tasks assigned to you');
  }

  async assertCanViewDepartment(departmentId: string): Promise<DepartmentRole> {
    return this.assertRole(departmentId, ['admin', 'department_head', 'manager', 'employee']);
  }

  async getReportScope(departmentId?: string): Promise<{
    role: DepartmentRole;
    departmentId?: string;
    ownTasksOnly: boolean;
  }> {
    const ctx = requireTenantContext();
    const tenantMembership = await this.db('tenant_memberships')
      .where({ tenant_id: ctx.tenantId, user_id: ctx.userId, is_active: true })
      .first();
    if (!tenantMembership) throw new ForbiddenException('Active tenant membership required');

    if (tenantMembership.role === 'admin') {
      return { role: 'admin', departmentId, ownTasksOnly: false };
    }
    if (!departmentId) {
      throw new ForbiddenException('A department is required for non-admin reports');
    }

    const role = await this.getRole(departmentId);
    if (role === 'none') throw new ForbiddenException('Department access denied');
    return {
      role,
      departmentId,
      ownTasksOnly: role === 'employee',
    };
  }

  private async assertRole(
    departmentId: string,
    allowed: DepartmentRole[],
    executor: Knex | Knex.Transaction = this.db,
  ): Promise<DepartmentRole> {
    const role = await this.getRole(departmentId, undefined, executor);
    if (!allowed.includes(role)) throw new ForbiddenException('Department access denied');
    return role;
  }
}
