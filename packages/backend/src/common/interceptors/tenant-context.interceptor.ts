/**
 * Establishes a request-scoped database transaction for authenticated HTTP
 * requests. The tenant setting and every service query then share one pooled
 * connection, which is required for Postgres RLS to enforce tenant isolation.
 */

import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import type { Knex } from 'knex';
import { from, lastValueFrom, Observable } from 'rxjs';
import { ROOT_DATABASE_PROVIDER } from '../../database/database.module';
import { tenantContext, TenantContextData } from '../tenant-context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  constructor(@Inject(ROOT_DATABASE_PROVIDER) private readonly rootDb: Knex) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const decoded = (request as unknown as { tenantContext?: TenantContextData }).tenantContext;
    const user = request.user as
      | {
          tenantId?: string;
          userId?: string;
          membershipId?: string;
          role?: string;
          permissions?: string[];
        }
      | undefined;

    const tenantId = user?.tenantId || decoded?.tenantId;
    if (!tenantId) {
      // Public routes such as health, login, registration and tenant lookup.
      return next.handle();
    }

    const requestContext: TenantContextData = {
      tenantId,
      userId: user?.userId || decoded?.userId || '',
      membershipId: user?.membershipId || decoded?.membershipId || '',
      role: user?.role || decoded?.role || '',
      permissions: user?.permissions || decoded?.permissions || [],
    };

    if (!requestContext.userId) {
      this.logger.warn(`Tenant context for ${request.method} ${request.url} is missing a user id`);
    }

    return from(
      this.rootDb.transaction(async (trx) => {
        const appRole = process.env['DB_APP_ROLE'];
        if (appRole) {
          await trx.raw(`select set_config('role', ?, true)`, [appRole]);
        }
        await trx.raw(`select set_config('app.current_tenant_id', ?, true)`, [
          requestContext.tenantId,
        ]);

        const scopedContext: TenantContextData = {
          ...requestContext,
          database: trx,
        };
        (request as unknown as { tenantContext: TenantContextData }).tenantContext = scopedContext;

        return tenantContext.run(scopedContext, () => lastValueFrom(next.handle()));
      }),
    );
  }
}
