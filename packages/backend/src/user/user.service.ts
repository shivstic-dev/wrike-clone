/**
 * User service — manages tenant users and memberships.
 */

import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import type { InviteUserInput, UpdateMembershipRequest } from '@wrike-clone/shared';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async findAll(page = 1, perPage = 25) {
    const ctx = requireTenantContext();
    const countResult = (await this.db('tenant_memberships')
      .where({ tenant_id: ctx.tenantId, is_active: true })
      .count()
      .first()) as { count?: string | number } | undefined;

    const users = await this.db('tenant_memberships')
      .join('users', 'tenant_memberships.user_id', 'users.id')
      .where('tenant_memberships.tenant_id', ctx.tenantId)
      .andWhere('tenant_memberships.is_active', true)
      .select(
        'users.id',
        'users.email',
        'users.display_name',
        'users.avatar_url',
        'users.locale',
        'users.timezone',
        'users.is_active as is_active_user',
        'users.last_login_at',
        'tenant_memberships.role',
        'tenant_memberships.joined_at',
      )
      .orderBy('users.display_name', 'asc')
      .limit(perPage)
      .offset((page - 1) * perPage);

    const total = Number(countResult?.count || 0);
    return {
      data: users,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async findByEmail(email: string) {
    return this.db('users').where({ email }).first();
  }

  async invite(input: InviteUserInput) {
    const ctx = requireTenantContext();
    let user = await this.db('users').where({ email: input.email }).first();

    if (!user) {
      const id = uuidv4();
      [user] = await this.db('users')
        .insert({
          id,
          email: input.email,
          display_name: input.email.split('@')[0] || input.email,
        })
        .returning('*');
    }

    // Check if already a member
    const existingMembership = await this.db('tenant_memberships')
      .where({ tenant_id: ctx.tenantId, user_id: user.id })
      .first();

    if (existingMembership) {
      // Reactivate if deactivated
      if (!existingMembership.is_active) {
        await this.db('tenant_memberships')
          .where({ id: existingMembership.id })
          .update({ is_active: true, role: input.role });
      }
      return { ...user, alreadyMember: true, role: input.role };
    }

    const membershipId = uuidv4();
    await this.db('tenant_memberships').insert({
      id: membershipId,
      tenant_id: ctx.tenantId,
      user_id: user.id,
      role: input.role,
    });

    this.logger.log(`User ${input.email} invited to tenant ${ctx.tenantId}`);
    return { ...user, membershipId, role: input.role };
  }

  async updateMembership(userId: string, input: UpdateMembershipRequest) {
    const ctx = requireTenantContext();
    const membership = await this.db('tenant_memberships')
      .where({ tenant_id: ctx.tenantId, user_id: userId })
      .first();
    if (!membership) throw new NotFoundException('User not in tenant');

    await this.db('tenant_memberships').where({ id: membership.id }).update({ role: input.role });

    return { message: 'Role updated' };
  }

  async remove(userId: string): Promise<void> {
    const ctx = requireTenantContext();
    const membership = await this.db('tenant_memberships')
      .where({ tenant_id: ctx.tenantId, user_id: userId })
      .first();
    if (!membership) throw new NotFoundException('User not in tenant');

    await this.db.transaction(async (trx) => {
      await trx('tenant_memberships')
        .where({ id: membership.id, tenant_id: ctx.tenantId })
        .update({ is_active: false });
      await trx('sessions')
        .where({ membership_id: membership.id, tenant_id: ctx.tenantId })
        .update({ expires_at: new Date() });
    });
    this.logger.log(`User ${userId} removed from tenant ${ctx.tenantId}`);
  }
}
