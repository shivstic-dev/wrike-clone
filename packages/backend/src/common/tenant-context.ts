/**
 * Tenant context — stored per-request via CLS or a simple async local storage.
 * The middleware sets this for every authenticated request; services access it
 * to scope all queries to the current tenant.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { UnauthorizedException } from '@nestjs/common';
import type { Knex } from 'knex';

export interface TenantContextData {
  tenantId: string;
  userId: string;
  membershipId: string;
  role: string;
  permissions: string[];
  /** Request-scoped transaction used for all tenant queries. */
  database?: Knex.Transaction;
}

export const tenantContext = new AsyncLocalStorage<TenantContextData>();

export function getTenantContext(): TenantContextData | undefined {
  return tenantContext.getStore();
}

export function requireTenantContext(): TenantContextData {
  const ctx = tenantContext.getStore();
  if (!ctx) {
    throw new UnauthorizedException(
      'Tenant context not available. Ensure request is authenticated with a valid Authorization header.',
    );
  }
  return ctx;
}
