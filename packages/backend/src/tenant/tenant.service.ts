/**
 * Tenant service — multi-tenant organization management.
 */

import { Injectable, NotFoundException, ConflictException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { hash } from 'bcryptjs';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import type {
  BootstrapTenantInput,
  CreateTenantInput,
  UpdateTenantInput,
} from '@wrike-clone/shared';

const SALT_ROUNDS = 12;

const defaultTenantSettings = {
  defaultTimezone: 'UTC',
  defaultLocale: 'en',
  maxUsers: 100,
  maxStorageGb: 10,
  allowedAuthProviders: ['local'],
  enforceSso: false,
  sessionTimeoutMinutes: 480,
};

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async findAll() {
    const ctx = requireTenantContext();
    return this.db('tenants').where({ id: ctx.tenantId, deleted_at: null }).first();
  }

  async findById(id: string) {
    const tenant = await this.db('tenants').where({ id, deleted_at: null }).first();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findBySlug(slug: string) {
    return this.db('tenants').where({ slug, deleted_at: null }).first();
  }

  async create(input: CreateTenantInput) {
    const existing = await this.db('tenants').where({ slug: input.slug }).first();
    if (existing) throw new ConflictException('Tenant slug already exists');

    const id = uuidv4();
    const [tenant] = await this.db('tenants')
      .insert({
        id,
        name: input.name,
        slug: input.slug,
        domain: input.domain || null,
        settings: JSON.stringify(defaultTenantSettings),
      })
      .returning('*');

    this.logger.log(`Tenant created: ${input.slug}`);
    return tenant;
  }

  async bootstrap(input: BootstrapTenantInput) {
    const passwordHash = await hash(input.admin.password, SALT_ROUNDS);

    return this.db.transaction(async (trx) => {
      const existingTenant = await trx('tenants').where({ slug: input.tenant.slug }).first();
      if (existingTenant) throw new ConflictException('Tenant slug already exists');

      const normalizedEmail = input.admin.email.trim().toLowerCase();
      const existingUser = await trx('users')
        .whereRaw('LOWER(email) = ?', [normalizedEmail])
        .whereNull('deleted_at')
        .first();
      if (existingUser) throw new ConflictException('Administrator email already exists');

      const tenantId = uuidv4();
      const adminId = uuidv4();

      const [tenant] = await trx('tenants')
        .insert({
          id: tenantId,
          name: input.tenant.name,
          slug: input.tenant.slug,
          domain: input.tenant.domain || null,
          settings: JSON.stringify(defaultTenantSettings),
        })
        .returning('*');

      await trx('users').insert({
        id: adminId,
        email: normalizedEmail,
        display_name: input.admin.displayName,
        password_hash: passwordHash,
        password_changed_at: new Date(),
      });

      await trx('tenant_memberships').insert({
        id: uuidv4(),
        tenant_id: tenantId,
        user_id: adminId,
        role: 'admin',
      });

      this.logger.log(`Tenant bootstrapped: ${input.tenant.slug}`);
      return {
        tenant,
        admin: {
          id: adminId,
          email: normalizedEmail,
          displayName: input.admin.displayName,
          role: 'admin',
        },
      };
    });
  }

  async update(id: string, input: UpdateTenantInput) {
    const ctx = requireTenantContext();
    const tenant = await this.db('tenants').where({ id, deleted_at: null }).first();
    if (!tenant) throw new NotFoundException('Tenant not found');

    const updates: Record<string, unknown> = {};
    if (input.name) updates['name'] = input.name;
    if (input.settings) {
      const currentSettings =
        typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : tenant.settings;
      updates['settings'] = JSON.stringify({ ...currentSettings, ...input.settings });
    }

    const [updated] = await this.db('tenants').where({ id }).update(updates).returning('*');
    return updated;
  }
}
