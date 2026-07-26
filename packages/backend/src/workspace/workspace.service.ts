/**
 * Workspace service — top-level organizational containers (departments).
 * Phase 1: Added workspace_members endpoints for department-based access control.
 */

import { Injectable, NotFoundException, Inject, Logger, ForbiddenException, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { hash } from 'bcrypt';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext, getTenantContext, TenantContextData } from '../common/tenant-context';
import { applyVisibilityScope } from '../common/visibility.scope';
import type { CreateWorkspaceInput, UpdateWorkspaceRequest } from '@wrike-clone/shared';

const SALT_ROUNDS = 12;

@Injectable({ scope: Scope.REQUEST })
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  private getContext(): TenantContextData {
    // Try AsyncLocalStorage first
    let ctx = getTenantContext();
    
    // Fallback to request object if AsyncLocalStorage lost context
    if (!ctx && (this.request as any).tenantContext) {
      ctx = (this.request as any).tenantContext;
    }
    
    if (!ctx) {
      throw new Error('Tenant context not available');
    }
    
    return ctx;
  }

  async findAll() {
    const ctx = this.getContext();
    let query = this.db('workspaces')
      .where({ tenant_id: ctx.tenantId, deleted_at: null })
      .orderBy('sort_order', 'asc');

    // Apply visibility: non-admin users only see workspaces they're members of,
    // or workspaces that contain at least one organization-visible project
    if (ctx.role !== 'admin') {
      query = query.where((b) =>
        b.whereIn('id', function () {
          this.select('workspace_id').from('workspace_members').where('user_id', ctx.userId);
        }).orWhereIn('id', function () {
          this.select('folders.workspace_id')
            .from('folders')
            .join('projects', 'projects.folder_id', 'folders.id')
            .where('projects.visibility', 'organization')
            .andWhere('projects.deleted_at', null);
        }),
      );
    }

    return query;
  }

  async findById(id: string) {
    const ctx = this.getContext();
    const ws = await this.db('workspaces')
      .where({ id, tenant_id: ctx.tenantId, deleted_at: null })
      .first();
    if (!ws) throw new NotFoundException('Workspace not found');
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
    this.logger.log(`Workspace ${id} created`);
    return ws;
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
    await this.db('workspaces').where({ id, tenant_id: ctx.tenantId }).update({ deleted_at: new Date() });
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
      .where('workspace_members.workspace_id', workspaceId)
      .andWhere('workspace_members.tenant_id', ctx.tenantId)
      .select(
        'workspace_members.id',
        'workspace_members.workspace_id',
        'workspace_members.user_id',
        'workspace_members.role',
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

    // Find or create user
    let user = await this.db('users').where({ email: input.email }).first();
    if (!user) {
      const id = uuidv4();
      const passwordHash = await hash(input.tempPassword, SALT_ROUNDS);
      [user] = await this.db('users')
        .insert({
          id,
          email: input.email,
          display_name: input.displayName,
          password_hash: passwordHash,
          must_change_password: true,
        })
        .returning('*');
    } else {
      // Update existing user with temp password
      const passwordHash = await hash(input.tempPassword, SALT_ROUNDS);
      await this.db('users').where({ id: user.id }).update({
        password_hash: passwordHash,
        must_change_password: true,
      });
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

    if (existingWsMember) {
      // Update role if already a member
      await this.db('workspace_members')
        .where({ id: existingWsMember.id })
        .update({ role: input.role });
      return { ...existingWsMember, role: input.role };
    }

    const [member] = await this.db('workspace_members')
      .insert({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        workspace_id: workspaceId,
        user_id: user.id,
        role: input.role,
      })
      .returning('*');

    this.logger.log(`User ${input.email} added to workspace ${workspaceId} as ${input.role}`);

    // Log activity
    await this.logActivity(ctx.userId, 'workspace_member', member.id, 'workspace:member:added', {
      email: input.email,
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

    await this.db('workspace_members')
      .where({ id: member.id })
      .update({ role });

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
   * Check if a user is a dept_admin of a workspace.
   */
  async isDeptAdmin(workspaceId: string, userId: string): Promise<boolean> {
    const ctx = this.getContext();
    const member = await this.db('workspace_members')
      .where({ workspace_id: workspaceId, user_id: userId, role: 'dept_admin', tenant_id: ctx.tenantId })
      .first();
    return !!member;
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
