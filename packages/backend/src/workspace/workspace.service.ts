/**
 * Workspace service — top-level organizational containers (departments).
 * Phase 1: Added workspace_members endpoints for department-based access control.
 */

import { Injectable, NotFoundException, Inject, Logger, ForbiddenException } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { hash } from 'bcrypt';
import { DATABASE_PROVIDER } from '../database/database.module';
import { getTenantContext, TenantContextData } from '../common/tenant-context';
import { applyVisibilityScope } from '../common/visibility.scope';
import type { CreateWorkspaceInput, UpdateWorkspaceRequest } from '@wrike-clone/shared';
import { DepartmentAccessService } from '../rbac/department-access.service';

const SALT_ROUNDS = 12;

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccess: DepartmentAccessService,
  ) {}

  private getContext(): TenantContextData {
    const ctx = getTenantContext();

    if (!ctx) {
      this.logger.error('Tenant context not available - AsyncLocalStorage context lost');
      throw new ForbiddenException('Tenant context not available. Please try logging in again.');
    }

    return ctx;
  }

  async findAllForUser(user: any) {
    const ctx = getTenantContext();
    const tenantId = user?.tenantId || ctx?.tenantId;
    const userId = user?.userId || ctx?.userId;
    const role = (await this.departmentAccess.isTenantAdmin()) ? 'admin' : 'member';

    this.logger.debug(
      `findAllForUser called - user: ${JSON.stringify(user)}, ctx: ${JSON.stringify(ctx)}, resolved: tenantId=${tenantId}, userId=${userId}, role=${role}`,
    );

    if (!tenantId || !userId) {
      this.logger.error(
        `Missing context - user keys: ${user ? Object.keys(user).join(',') : 'null'}, ctx: ${ctx ? 'present' : 'null'}`,
      );
      throw new ForbiddenException('User information missing from request context');
    }

    try {
      let query = this.db('workspaces')
        .where('workspaces.tenant_id', tenantId)
        .whereNull('workspaces.deleted_at')
        .orderBy('workspaces.sort_order', 'asc');

      // Apply visibility: admin users see all workspaces, others see only their workspaces
      if (role !== 'admin') {
        query = query.where((b) =>
          b
            .whereIn('workspaces.id', function () {
              this.select('workspace_id').from('workspace_members').where('user_id', userId);
            })
            .orWhereIn('workspaces.id', function () {
              this.select('folders.workspace_id')
                .from('folders')
                .join('projects', 'projects.folder_id', 'folders.id')
                .where('projects.visibility', 'global')
                .whereNull('projects.deleted_at')
                .whereNull('folders.deleted_at');
            }),
        );
      }

      const result = await query;
      this.logger.debug(`findAllForUser returned ${result.length} workspaces`);
      return this.attachDepartmentRoles(result, userId, role === 'admin');
    } catch (error: unknown) {
      this.logger.error(
        `Error in findAllForUser: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  async findAll() {
    const ctx = this.getContext();
    const isAdmin = await this.departmentAccess.isTenantAdmin();
    let query = this.db('workspaces')
      .where('workspaces.tenant_id', ctx.tenantId)
      .whereNull('workspaces.deleted_at')
      .orderBy('workspaces.sort_order', 'asc');

    // Apply visibility: non-admin users only see workspaces they're members of,
    // or workspaces that contain at least one organization-visible project
    if (!isAdmin) {
      query = query.where((b) =>
        b
          .whereIn('workspaces.id', function () {
            this.select('workspace_id').from('workspace_members').where('user_id', ctx.userId);
          })
          .orWhereIn('workspaces.id', function () {
            this.select('folders.workspace_id')
              .from('folders')
              .join('projects', 'projects.folder_id', 'folders.id')
              .where('projects.visibility', 'global')
              .whereNull('projects.deleted_at')
              .whereNull('folders.deleted_at');
          }),
      );
    }

    return this.attachDepartmentRoles(await query, ctx.userId, isAdmin);
  }

  async findById(id: string) {
    const ctx = this.getContext();
    const ws = await this.db('workspaces')
      .where({ id, tenant_id: ctx.tenantId, deleted_at: null })
      .first();
    if (!ws) throw new NotFoundException('Workspace not found');
    if (!(await this.departmentAccess.isTenantAdmin())) {
      await this.departmentAccess.assertCanViewDepartment(id);
    }
    return ws;
  }

  async create(input: CreateWorkspaceInput) {
    const ctx = this.getContext();
    const id = uuidv4();
    const [ws] = await this.db('workspaces')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        name: input.name,
        description: input.description || null,
        icon: input.icon || null,
        sort_order: 0,
      })
      .returning('*');
    await this.db('workspace_statuses').insert([
      {
        tenant_id: ctx.tenantId,
        workspace_id: id,
        name: 'To Do',
        color: '#64748b',
        category: 'not_started',
        sort_order: 0,
      },
      {
        tenant_id: ctx.tenantId,
        workspace_id: id,
        name: 'In Progress',
        color: '#3b82f6',
        category: 'active',
        sort_order: 1,
      },
      {
        tenant_id: ctx.tenantId,
        workspace_id: id,
        name: 'Completed',
        color: '#22c55e',
        category: 'completed',
        sort_order: 2,
      },
      {
        tenant_id: ctx.tenantId,
        workspace_id: id,
        name: 'Blocked',
        color: '#ef4444',
        category: 'blocked',
        sort_order: 3,
      },
    ]);
    this.logger.log(`Workspace ${id} created`);
    return ws;
  }

  private async attachDepartmentRoles(
    workspaces: Array<Record<string, unknown>>,
    userId: string,
    isAdmin: boolean,
  ): Promise<Array<Record<string, unknown>>> {
    if (isAdmin) {
      return workspaces.map((workspace) => ({ ...workspace, department_role: 'admin' }));
    }
    if (workspaces.length === 0) return workspaces;

    const ids = workspaces.map((workspace) => workspace.id as string);
    const memberships = await this.db('workspace_members')
      .where({ user_id: userId })
      .whereIn('workspace_id', ids)
      .select('workspace_id', 'role');
    const heads = await this.db('department_heads')
      .where({ user_id: userId })
      .whereIn('department_id', ids)
      .select('department_id');
    const headIds = new Set(heads.map((head) => head.department_id as string));
    const roles = new Map(
      memberships.map((membership) => [
        membership.workspace_id as string,
        membership.role as string,
      ]),
    );

    return workspaces.map((workspace) => ({
      ...workspace,
      department_role: headIds.has(workspace.id as string)
        ? 'department_head'
        : roles.get(workspace.id as string) || 'none',
    }));
  }

  async update(id: string, input: UpdateWorkspaceRequest) {
    const ctx = this.getContext();
    await this.findById(id); // ensure exists
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates['name'] = input.name;
    if (input.description !== undefined) updates['description'] = input.description;
    if (input.icon !== undefined) updates['icon'] = input.icon;

    const [ws] = await this.db('workspaces')
      .where({ id, tenant_id: ctx.tenantId })
      .update(updates)
      .returning('*');
    return ws;
  }

  async remove(id: string): Promise<void> {
    const ctx = this.getContext();
    await this.findById(id);
    await this.db('workspaces')
      .where({ id, tenant_id: ctx.tenantId })
      .update({ deleted_at: new Date() });
    this.logger.log(`Workspace ${id} deleted`);
  }

  // ── Workspace Members ──────────────────────────────────────────

  /**
   * List members of a workspace (department).
   */
  async findMembers(workspaceId: string) {
    const ctx = this.getContext();
    // Verify workspace exists
    await this.findById(workspaceId);

    return this.db('workspace_members')
      .join('users', 'workspace_members.user_id', 'users.id')
      .leftJoin('department_heads', function () {
        this.on('department_heads.department_id', '=', 'workspace_members.workspace_id').andOn(
          'department_heads.user_id',
          '=',
          'workspace_members.user_id',
        );
      })
      .where('workspace_members.workspace_id', workspaceId)
      .andWhere('workspace_members.tenant_id', ctx.tenantId)
      .select(
        'workspace_members.id',
        'workspace_members.workspace_id',
        'workspace_members.user_id',
        this.db.raw(
          `CASE WHEN department_heads.id IS NOT NULL THEN 'department_head' ELSE workspace_members.role END as role`,
        ),
        'workspace_members.created_at',
        'workspace_members.updated_at',
        'users.id as user_id',
        'users.email',
        'users.display_name',
        'users.avatar_url',
      )
      .orderBy('users.display_name', 'asc');
  }

  /**
   * Add a member to a workspace (department).
   * Creates or finds user by email, sets temp password, creates membership.
   */
  async addMember(
    workspaceId: string,
    input: {
      email: string;
      displayName: string;
      tempPassword: string;
      role: string;
    },
  ) {
    const ctx = this.getContext();
    await this.findById(workspaceId);
    const email = input.email.trim().toLowerCase();

    // Find or create user
    let user = await this.db('users').where({ email }).first();
    if (!user) {
      const id = uuidv4();
      const passwordHash = await hash(input.tempPassword, SALT_ROUNDS);
      // Do not use RETURNING here. The users SELECT policy only exposes users
      // after their tenant_memberships row exists, so RETURNING would make
      // Postgres reject this otherwise-authorized bootstrap insert under RLS.
      await this.db('users').insert({
        id,
        email,
        display_name: input.displayName,
        password_hash: passwordHash,
        must_change_password: true,
      });
      user = {
        id,
        email,
        display_name: input.displayName,
      };
    }

    // Ensure tenant membership exists
    const existingMembership = await this.db('tenant_memberships')
      .where({ tenant_id: ctx.tenantId, user_id: user.id })
      .first();

    if (!existingMembership) {
      await this.db('tenant_memberships').insert({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        user_id: user.id,
        role: 'member',
      });
    } else if (!existingMembership.is_active) {
      await this.db('tenant_memberships')
        .where({ id: existingMembership.id })
        .update({ is_active: true });
    }

    // Create workspace membership
    const existingWsMember = await this.db('workspace_members')
      .where({ workspace_id: workspaceId, user_id: user.id })
      .first();

    const storedRole = input.role === 'department_head' ? 'employee' : input.role;
    if (existingWsMember) {
      // Update role if already a member
      await this.db('workspace_members')
        .where({ id: existingWsMember.id })
        .update({ role: storedRole });
      await this.setDepartmentHead(workspaceId, user.id, input.role === 'department_head');
      return { ...existingWsMember, role: input.role };
    }

    const [member] = await this.db('workspace_members')
      .insert({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        workspace_id: workspaceId,
        user_id: user.id,
        role: storedRole,
      })
      .returning('*');
    await this.setDepartmentHead(workspaceId, user.id, input.role === 'department_head');

    this.logger.log(`User ${email} added to workspace ${workspaceId} as ${input.role}`);

    // Log activity
    await this.logActivity(ctx.userId, 'workspace_member', member.id, 'workspace:member:added', {
      email,
      workspaceId,
      role: input.role,
    });

    return member;
  }

  /**
   * Update a workspace member's role.
   */
  async updateMemberRole(workspaceId: string, userId: string, role: string) {
    const ctx = this.getContext();
    await this.findById(workspaceId);

    const member = await this.db('workspace_members')
      .where({ workspace_id: workspaceId, user_id: userId, tenant_id: ctx.tenantId })
      .first();

    if (!member) {
      throw new NotFoundException('Member not found in this workspace');
    }

    const storedRole = role === 'department_head' ? 'employee' : role;
    await this.db('workspace_members').where({ id: member.id }).update({ role: storedRole });
    await this.setDepartmentHead(workspaceId, userId, role === 'department_head');

    return { ...member, role };
  }

  /**
   * Remove a member from a workspace.
   * Also invalidates their refresh tokens for security.
   */
  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const ctx = this.getContext();
    await this.findById(workspaceId);

    const member = await this.db('workspace_members')
      .where({ workspace_id: workspaceId, user_id: userId, tenant_id: ctx.tenantId })
      .first();

    if (!member) {
      throw new NotFoundException('Member not found in this workspace');
    }

    // Delete workspace membership
    await this.db('workspace_members').where({ id: member.id }).del();
    await this.db('department_heads')
      .where({ department_id: workspaceId, user_id: userId, tenant_id: ctx.tenantId })
      .del();

    // Invalidate refresh tokens
    await this.db('sessions')
      .where({ user_id: userId, tenant_id: ctx.tenantId })
      .update({ expires_at: new Date() });

    this.logger.log(`User ${userId} removed from workspace ${workspaceId}`);

    // Log activity
    await this.logActivity(ctx.userId, 'workspace_member', member.id, 'workspace:member:removed', {
      userId,
      workspaceId,
    });
  }

  /**
   * Check if a user is a department head of a workspace.
   */
  async isDepartmentHead(workspaceId: string, userId: string): Promise<boolean> {
    const ctx = this.getContext();
    const member = await this.db('department_heads')
      .where({
        department_id: workspaceId,
        user_id: userId,
        tenant_id: ctx.tenantId,
      })
      .first();
    return !!member;
  }

  private async setDepartmentHead(
    workspaceId: string,
    userId: string,
    isDepartmentHead: boolean,
  ): Promise<void> {
    const ctx = this.getContext();
    const where = {
      tenant_id: ctx.tenantId,
      department_id: workspaceId,
      user_id: userId,
    };
    if (!isDepartmentHead) {
      await this.db('department_heads').where(where).del();
      return;
    }
    await this.db('department_heads')
      .insert({
        id: uuidv4(),
        ...where,
        assigned_by_id: ctx.userId,
      })
      .onConflict(['department_id', 'user_id'])
      .ignore();
  }

  /**
   * Log an activity entry.
   */
  private async logActivity(
    actorId: string,
    entityType: string,
    entityId: string,
    action: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    try {
      const ctx = this.getContext();
      await this.db('activity_logs').insert({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        actor_id: actorId,
        entity_type: entityType,
        entity_id: entityId,
        action,
        changes: JSON.stringify(changes),
        metadata: '{}',
      });
    } catch (err) {
      this.logger.warn(`Failed to log activity: ${(err as Error).message}`);
    }
  }
}
