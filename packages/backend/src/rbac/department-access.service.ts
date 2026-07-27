import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';

export type DepartmentRole = 'admin' | 'department_head' | 'manager' | 'employee' | 'none';

@Injectable()
export class DepartmentAccessService {
  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async isTenantAdmin(): Promise<boolean> {
    const ctx = requireTenantContext();
    const membership = await this.db('tenant_memberships')
      .where({
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        is_active: true,
        role: 'admin',
      })
      .first();
    return !!membership;
  }

  async getRole(departmentId: string, userId?: string): Promise<DepartmentRole> {
    const ctx = requireTenantContext();
    const targetUserId = userId || ctx.userId;

    const tenantMembership = await this.db('tenant_memberships')
      .where({
        tenant_id: ctx.tenantId,
        user_id: targetUserId,
        is_active: true,
      })
      .first();

    if (!tenantMembership) return 'none';
    if (tenantMembership.role === 'admin') return 'admin';

    const membership = await this.db('workspace_members')
      .where({
        tenant_id: ctx.tenantId,
        workspace_id: departmentId,
        user_id: targetUserId,
      })
      .first();
    if (!membership) return 'none';

    const departmentHead = await this.db('department_heads')
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

  async assertCanCreateTask(departmentId: string): Promise<DepartmentRole> {
    return this.assertRole(departmentId, ['admin', 'department_head', 'manager']);
  }

  async assertCanManageTask(departmentId: string): Promise<DepartmentRole> {
    return this.assertRole(departmentId, ['admin', 'department_head', 'manager']);
  }

  async assertCanSetVisibility(departmentId: string): Promise<DepartmentRole> {
    return this.assertRole(departmentId, ['admin', 'department_head']);
  }

  async assertCanChangeStatus(departmentId: string, assigneeId: string | null): Promise<void> {
    const ctx = requireTenantContext();
    const role = await this.getRole(departmentId);
    if (role === 'admin' || role === 'department_head' || role === 'manager') return;
    if (role === 'employee' && assigneeId === ctx.userId) return;
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
  ): Promise<DepartmentRole> {
    const role = await this.getRole(departmentId);
    if (!allowed.includes(role)) throw new ForbiddenException('Department access denied');
    return role;
  }
}
