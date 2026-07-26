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
 *
 * Uses `enterWith()` instead of `run()` to avoid AsyncLocalStorage context
 * loss when RxJS Observables schedule work across microtask boundaries.
 * `enterWith()` transitions the current async execution context to use the
 * new store value — all subsequent sync and async code (including await
 * chains in controllers/services) will see it. This is safe because each
 * HTTP request gets its own async execution context in Node.js.
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { tenantContext, TenantContextData } from '../tenant-context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // If middleware already established the AsyncLocalStorage context, pass through
    if (tenantContext.getStore()) {
      return next.handle();
    }

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

      // Use enterWith() instead of run() to avoid AsyncLocalStorage context loss.
      // enterWith() transitions the CURRENT async execution context — all
      // subsequent code (sync and async, including NestJS controller/service
      // await chains) will see this store. Unlike run(), it doesn't create a
      // scoped callback that RxJS Observables can escape from.
      tenantContext.enterWith(ctx);
    } else {
      this.logger.warn(
        `No tenantId found on req.user for ${request.method} ${request.url}. ` +
        `User present: ${!!user}, keys: ${user ? Object.keys(user).join(',') : 'N/A'}`,
      );
    }

    return next.handle();
  }
}
