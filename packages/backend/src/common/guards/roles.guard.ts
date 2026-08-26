/**
 * Roles/Permissions guard.
 * Checks that the authenticated user has the required permissions.
 * v1: Resolves permissions fresh from the database + in-memory cache
 * (60s TTL) instead of trusting the permissions baked into the JWT.
 * This means role changes take effect within a minute, not a token lifetime.
 *
 * Use with the @Permissions() decorator on controllers/handlers.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Knex } from 'knex';
import { DATABASE_PROVIDER } from '../../database/database.module';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedUser } from './auth.guard';
import { DEFAULT_ROLE_PERMISSIONS } from '@wrike-clone/shared';

// In-memory permission cache with 60-second TTL
const permCache = new Map<string, { permissions: string[]; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permissions required — allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Resolve permissions fresh
    const permissions = await this.resolvePermissions(user);

    // Admin wildcard — has all permissions
    if (permissions.includes('*')) {
      // Also add the user's workspace-level roles to the request for downstream use
      (request as any).resolvedPermissions = permissions;
      return true;
    }

    const hasAll = requiredPermissions.every((p) => permissions.includes(p));
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }

    (request as any).resolvedPermissions = permissions;
    return true;
  }

  private async resolvePermissions(user: AuthenticatedUser): Promise<string[]> {
    const cacheKey = user.membershipId || `${user.tenantId}:${user.userId}`;

    // Check cache
    const cached = permCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    try {
      // Resolve from database — get the current role from tenant_memberships
      const membership = await this.db('tenant_memberships')
        .where({ user_id: user.userId, tenant_id: user.tenantId, is_active: true })
        .first();

      const role = membership?.role || 'member';
      const permissions =
        DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS['member'] || [];

      // Update cache
      permCache.set(cacheKey, {
        permissions,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return permissions;
    } catch (error) {
      // Authorization must fail closed when current membership cannot be
      // verified. Trusting stale JWT permissions here can preserve revoked
      // admin access during a database incident.
      this.logger.error(`Permission lookup failed for ${user.userId}: ${(error as Error).message}`);
      throw new ForbiddenException('Unable to verify current permissions');
    }
  }
}
