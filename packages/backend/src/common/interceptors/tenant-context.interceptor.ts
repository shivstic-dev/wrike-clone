/**
 * Tenant context interceptor.
 *
 * Extracts tenant information from the authenticated request and initializes
 * the AsyncLocalStorage context so services can access it without passing
 * it through every function call.
 *
 * IMPORTANT: this must be an interceptor, not middleware. NestJS runs the
 * request lifecycle as middleware -> guards -> interceptors -> pipes ->
 * handler. AuthGuard (which decodes the JWT and sets req.user) is a guard,
 * so middleware always executes before req.user exists. Implementing this
 * as an interceptor instead means it runs after guards, once req.user has
 * actually been populated.
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { tenantContext, TenantContextData } from '../tenant-context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as
      | { tenantId?: string; userId?: string; membershipId?: string; role?: string; permissions?: string[] }
      | undefined;

    if (user?.tenantId) {
      const ctx: TenantContextData = {
        tenantId: user.tenantId,
        userId: user.userId || '',
        membershipId: user.membershipId || '',
        role: user.role || '',
        permissions: user.permissions || [],
      };

      // Attach to request as a fallback for any code that reads it directly.
      (request as unknown as { tenantContext: TenantContextData }).tenantContext = ctx;

      return new Observable((subscriber) => {
        tenantContext.run(ctx, () => {
          next.handle().subscribe(subscriber);
        });
      });
    }

    // Unauthenticated / public route (health check, login, etc.) — no tenant
    // context to establish; let the request proceed with an empty store.
    return next.handle();
  }
}
