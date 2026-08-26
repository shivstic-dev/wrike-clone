/**
 * Authentication service.
 * Handles user login, token generation, token refresh, and session management.
 * v1 uses local JWT auth only (no Keycloak/SSO). DEFAULT_TENANT_SLUG env var
 * allows single-tenant deployments to skip the tenant slug field on login.
 */

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Knex } from 'knex';
import { compare, hash } from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';
import { DATABASE_PROVIDER } from '../database/database.module';
import { loadAuthConfig, loadAppConfig } from '../config/app.config';
import { DEFAULT_ROLE_PERMISSIONS } from '@wrike-clone/shared';
import type { LoginRequest, LoginResponse, RefreshTokenRequest } from '@wrike-clone/shared';

const SALT_ROUNDS = 12;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AuthUserResult {
  id: string;
  email: string;
  displayName: string;
  tenantId: string;
  membershipId: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  /**
   * Authenticate a user with email + password.
   * If DEFAULT_TENANT_SLUG is set, the tenantSlug is resolved automatically.
   * Returns JWT tokens and user info on success.
   */
  async login(
    input: LoginRequest,
  ): Promise<LoginResponse & { user: AuthUserResult; mustChangePassword?: boolean }> {
    const config = loadAuthConfig();
    const appConfig = loadAppConfig();

    // Resolve tenant slug — use DEFAULT_TENANT_SLUG if set (single-tenant deployment)
    const tenantSlug = appConfig.defaultTenantSlug || input.tenantSlug;
    if (!tenantSlug) {
      throw new UnauthorizedException('Tenant slug is required');
    }

    // First, find the tenant by slug
    const tenant = await this.db('tenants').where({ slug: tenantSlug, deleted_at: null }).first();

    if (!tenant) {
      throw new UnauthorizedException('Invalid tenant or credentials');
    }

    // Find the user by email
    const user = await this.db('users')
      .where({ email: input.email, is_active: true, deleted_at: null })
      .first();

    if (!user) {
      throw new UnauthorizedException('Invalid tenant or credentials');
    }

    // Check brute-force lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new UnauthorizedException('Account temporarily locked. Try again in 15 minutes.');
    }

    // Verify password (compare with bcrypt hash)
    const passwordValid = await compare(input.password, user.password_hash || '');
    if (!passwordValid) {
      // Increment failed login counter
      const failedCount = (user.failed_login_attempts || 0) + 1;
      const updates: Record<string, unknown> = { failed_login_attempts: failedCount };
      if (failedCount >= MAX_FAILED_LOGINS) {
        updates['locked_until'] = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }
      await this.db('users').where({ id: user.id }).update(updates);
      throw new UnauthorizedException('Invalid tenant or credentials');
    }

    // Reset failed login counter on success
    await this.db('users').where({ id: user.id }).update({
      failed_login_attempts: 0,
      locked_until: null,
    });

    // Get tenant membership
    const membership = await this.db('tenant_memberships')
      .where({ tenant_id: tenant.id, user_id: user.id, is_active: true })
      .first();

    if (!membership) {
      throw new UnauthorizedException('User is not a member of this tenant');
    }

    // Check if user must change password
    const mustChangePassword = user.must_change_password === true;

    // Generate tokens
    const permissions =
      DEFAULT_ROLE_PERMISSIONS[membership.role] || DEFAULT_ROLE_PERMISSIONS['member'] || [];
    const payload = {
      sub: user.id,
      userId: user.id,
      tenantId: tenant.id,
      membershipId: membership.id,
      email: user.email,
      role: membership.role,
      permissions,
    };

    const accessToken = sign(payload, config.jwtSecret, {
      expiresIn: config.accessTokenTtlSec,
      algorithm: 'HS256',
      issuer: config.issuer,
      audience: config.audience,
    });

    const refreshToken = randomBytes(48).toString('base64url');

    // Store session
    await this.db('sessions').insert({
      id: uuidv4(),
      user_id: user.id,
      tenant_id: tenant.id,
      membership_id: membership.id,
      refresh_token: hashRefreshToken(refreshToken),
      expires_at: new Date(Date.now() + config.refreshTokenTtlSec * 1000),
    });

    // Update last login
    await this.db('users').where({ id: user.id }).update({ last_login_at: new Date() });

    this.logger.log(`User ${user.email} logged into tenant ${tenant.slug}`);

    return {
      accessToken,
      refreshToken,
      expiresIn: config.accessTokenTtlSec,
      mustChangePassword,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        tenantId: tenant.id,
        membershipId: membership.id,
        role: membership.role,
      },
      tenant: {
        ...tenant,
        settings:
          typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : tenant.settings,
      },
      membership: {
        id: membership.id,
        tenantId: membership.tenant_id,
        userId: membership.user_id,
        role: membership.role,
        joinedAt: membership.joined_at,
        isActive: membership.is_active,
      },
    } as any;
  }

  /**
   * Refresh an access token using a valid refresh token.
   */
  async refreshToken(
    input: RefreshTokenRequest,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const config = loadAuthConfig();
    const tokenHash = hashRefreshToken(input.refreshToken);
    return this.db.transaction(async (trx) => {
      const checkedAt = new Date();
      const candidate = await trx('sessions')
        .where({ refresh_token: tokenHash })
        .where('expires_at', '>', checkedAt)
        .first();
      if (!candidate) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // UserService.remove takes the same membership-first, session-second lock order.
      const membership = await trx('tenant_memberships')
        .where({
          id: candidate.membership_id,
          tenant_id: candidate.tenant_id,
          is_active: true,
        })
        .forUpdate()
        .first();
      if (!membership) {
        throw new UnauthorizedException('Membership no longer active');
      }

      const session = await trx('sessions')
        .where({
          id: candidate.id,
          refresh_token: tokenHash,
          tenant_id: candidate.tenant_id,
          membership_id: candidate.membership_id,
          user_id: candidate.user_id,
        })
        .where('expires_at', '>', checkedAt)
        .forUpdate()
        .first();
      if (!session) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const user = await trx('users')
        .where({ id: session.user_id, is_active: true, deleted_at: null })
        .first();
      if (
        !user ||
        user.is_active !== true ||
        user.deleted_at !== null ||
        membership.user_id !== user.id ||
        membership.tenant_id !== session.tenant_id
      ) {
        throw new UnauthorizedException('Account no longer active');
      }

      const permissions =
        DEFAULT_ROLE_PERMISSIONS[membership.role] || DEFAULT_ROLE_PERMISSIONS['member'] || [];
      const accessToken = sign(
        {
          sub: user.id,
          userId: user.id,
          tenantId: session.tenant_id,
          membershipId: session.membership_id,
          email: user.email,
          role: membership.role,
          permissions,
        },
        config.jwtSecret,
        {
          expiresIn: config.accessTokenTtlSec,
          algorithm: 'HS256',
          issuer: config.issuer,
          audience: config.audience,
        },
      );

      const refreshToken = randomBytes(48).toString('base64url');
      const updated = await trx('sessions')
        .where({
          id: session.id,
          refresh_token: tokenHash,
          tenant_id: session.tenant_id,
          membership_id: session.membership_id,
          user_id: session.user_id,
        })
        .where('expires_at', '>', checkedAt)
        .update({
          refresh_token: hashRefreshToken(refreshToken),
          expires_at: new Date(Date.now() + config.refreshTokenTtlSec * 1000),
        });
      if (updated !== 1) {
        throw new UnauthorizedException('Refresh token has already been used');
      }

      return { accessToken, refreshToken, expiresIn: config.accessTokenTtlSec };
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db('sessions')
      .where({ refresh_token: hashRefreshToken(refreshToken) })
      .del();
  }

  /**
   * Change password (forced or voluntary).
   * Validates current password, sets new one, and rotates all refresh tokens.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.db('users').where({ id: userId }).first();
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const passwordValid = await compare(currentPassword, user.password_hash || '');
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Prevent reusing temporary password as new password
    if (currentPassword === newPassword) {
      throw new UnauthorizedException('New password must be different from current password');
    }

    const newHash = await hash(newPassword, SALT_ROUNDS);

    await this.db.transaction(async (trx) => {
      await trx('users').where({ id: userId }).update({
        password_hash: newHash,
        must_change_password: false,
        password_changed_at: new Date(),
      });

      // Rotate all existing refresh tokens (invalidate old sessions)
      await trx('sessions').where({ user_id: userId }).update({ expires_at: new Date() });
    });

    this.logger.log(`Password changed for user ${user.email}`);
  }

  /**
   * Admin-reset a user's password (sets a temp password + must_change_password flag).
   */
  async adminResetPassword(userId: string, tempPassword: string, tenantId: string): Promise<void> {
    if (tempPassword.length < 12) {
      throw new UnauthorizedException('Temporary password must be at least 12 characters');
    }

    const user = await this.db('users')
      .join('tenant_memberships', 'users.id', 'tenant_memberships.user_id')
      .where({
        'users.id': userId,
        'tenant_memberships.tenant_id': tenantId,
        'tenant_memberships.is_active': true,
      })
      .select('users.*')
      .first();
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const newHash = await hash(tempPassword, SALT_ROUNDS);

    await this.db.transaction(async (trx) => {
      await trx('users').where({ id: userId }).update({
        password_hash: newHash,
        must_change_password: true,
        password_changed_at: null,
      });

      // Invalidate all existing sessions
      await trx('sessions').where({ user_id: userId }).update({ expires_at: new Date() });
    });

    this.logger.log(`Password reset for user ${user.email} by admin`);
  }

  /**
   * Register a new user (local auth only).
   * In production deployments, this is disabled behind ALLOW_PUBLIC_REGISTRATION=false.
   */
  async register(input: {
    email: string;
    password: string;
    displayName: string;
    tenantSlug: string;
  }): Promise<void> {
    const tenant = await this.db('tenants').where({ slug: input.tenantSlug }).first();
    if (!tenant) {
      throw new UnauthorizedException('Tenant not found');
    }

    const existing = await this.db('users').where({ email: input.email }).first();
    if (existing) {
      // Check if they're already a member of this tenant
      const membership = await this.db('tenant_memberships')
        .where({ tenant_id: tenant.id, user_id: existing.id })
        .first();
      if (membership) {
        throw new ConflictException('User already exists in this tenant');
      }
    }

    const passwordHash = await hash(input.password, SALT_ROUNDS);
    const userId = uuidv4();

    await this.db.transaction(async (trx) => {
      // Upsert user
      const existingUser = await trx('users').where({ email: input.email }).first();
      const finalUserId = existingUser?.id || userId;

      if (!existingUser) {
        await trx('users').insert({
          id: finalUserId,
          email: input.email,
          display_name: input.displayName,
          password_hash: passwordHash,
        });
      }

      // Create membership
      await trx('tenant_memberships').insert({
        id: uuidv4(),
        tenant_id: tenant.id,
        user_id: finalUserId,
        role: 'member',
      });
    });

    this.logger.log(`User ${input.email} registered in tenant ${input.tenantSlug}`);
  }
}
