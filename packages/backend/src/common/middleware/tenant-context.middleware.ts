/**
 * Tenant context middleware.
 * Extracts tenant information from the authenticated request and initializes
 * the AsyncLocalStorage context so services can access it without passing
 * it through every function call.
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantContext, TenantContextData } from '../tenant-context';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const user = req.user as { tenantId?: string; userId?: string; membershipId?: string; role?: string; permissions?: string[] } | undefined;

    if (user?.tenantId) {
      const ctx: TenantContextData = {
        tenantId: user.tenantId,
        userId: user.userId || '',
        membershipId: user.membershipId || '',
        role: user.role || '',
        permissions: user.permissions || [],
      };

      // Set tenant context and also attach to request for fallback
      (req as any).tenantContext = ctx;
      
      tenantContext.run(ctx, () => {
        // Also set the Postgres session variable for RLS
        if (ctx.tenantId) {
          try {
            // This will be picked up by the database query runner
            (req as any).__tenantId = ctx.tenantId;
          } catch {
            // Non-critical; RLS falls back to NULL check
          }
        }
        next();
      });
    } else {
      // Unauthenticated request — run in empty context
      tenantContext.run(undefined as unknown as TenantContextData, next);
    }
  }
}
