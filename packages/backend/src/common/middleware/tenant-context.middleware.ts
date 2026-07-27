/**
 * Tenant context middleware.
 * Extracts tenant information from the authenticated request and initializes
 * the AsyncLocalStorage context so services can access it without passing
 * it through every function call.
 *
 * NOTE: Middleware runs BEFORE guards. req.user is NOT available here.
 * This middleware decodes the JWT directly from the Authorization header
 * to populate the AsyncLocalStorage context as early as possible.
 * If JWT decoding fails (invalid token, missing header), the interceptor
 * will set up the context as a fallback after guards run.
 */

import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';
import { loadAuthConfig } from '../../config/app.config';
import { TenantContextData } from '../tenant-context';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  use(req: Request, _res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token — proceed without context (login, health, public routes)
      next();
      return;
    }

    try {
      const token = authHeader.substring(7);
      const config = loadAuthConfig();
      const payload = verify(token, config.jwtSecret) as any;

      if (payload && payload.tenantId) {
        const ctx: TenantContextData = {
          tenantId: payload.tenantId,
          userId: payload.sub || payload.userId || '',
          membershipId: payload.membershipId || '',
          role: payload.role || '',
          permissions: payload.permissions || [],
        };

        // Attach user info to req.user for AuthGuard & @CurrentUser()
        req.user = {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          membershipId: ctx.membershipId,
          email: payload.email || '',
          role: ctx.role,
          permissions: ctx.permissions,
        } as any;

        (req as any).tenantContext = ctx;

        // The interceptor establishes the scoped tenant transaction after
        // guards run. Middleware only attaches decoded identity to this request.
        next();
      } else {
        this.logger.warn(`JWT payload missing tenantId for ${req.method} ${req.url}`);
        next();
      }
    } catch (err) {
      // Token verification failed — let the AuthGuard handle rejection.
      // The interceptor (which runs after guards) will set up context
      // if the guard lets the request through.
      this.logger.debug(
        `JWT decode skipped in middleware for ${req.method} ${req.url}: ${(err as Error).message}`,
      );
      next();
    }
  }
}
