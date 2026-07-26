/**
 * Tenant context middleware.
 * Extracts tenant information from the authenticated request and initializes
 * the AsyncLocalStorage context so services can access it without passing
 * it through every function call.
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';
import { loadAuthConfig } from '../../config/app.config';
import { tenantContext, TenantContextData } from '../tenant-context';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    let ctx: TenantContextData | undefined = undefined;

    // First check if req.user has already been set
    const reqUser = req.user as
      | { tenantId?: string; userId?: string; membershipId?: string; role?: string; permissions?: string[] }
      | undefined;

    if (reqUser?.tenantId) {
      ctx = {
        tenantId: reqUser.tenantId,
        userId: reqUser.userId || '',
        membershipId: reqUser.membershipId || '',
        role: reqUser.role || '',
        permissions: reqUser.permissions || [],
      };
    } else {
      // Decode Bearer token directly from Authorization header
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const config = loadAuthConfig();
          const payload = verify(token, config.jwtSecret) as any;
          if (payload && payload.tenantId) {
            ctx = {
              tenantId: payload.tenantId,
              userId: payload.sub || payload.userId || '',
              membershipId: payload.membershipId || '',
              role: payload.role || '',
              permissions: payload.permissions || [],
            };
            // Also attach user to req.user for AuthGuard & @CurrentUser()
            req.user = {
              userId: ctx.userId,
              tenantId: ctx.tenantId,
              membershipId: ctx.membershipId,
              email: payload.email || '',
              role: ctx.role,
              permissions: ctx.permissions,
            } as any;
          }
        } catch {
          // Token verification failed or unauthenticated route — proceed without context
        }
      }
    }

    if (ctx && ctx.tenantId) {
      (req as any).tenantContext = ctx;
      (req as any).__tenantId = ctx.tenantId;

      tenantContext.run(ctx, () => {
        next();
      });
    } else {
      next();
    }
  }
}
