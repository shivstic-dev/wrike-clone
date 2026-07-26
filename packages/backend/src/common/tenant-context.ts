/**
 * Tenant context — stored per-request via CLS or a simple async local storage.
 * The middleware sets this for every authenticated request; services access it
 * to scope all queries to the current tenant.
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContextData {
  tenantId: string;
  userId: string;
  membershipId: string;
  role: string;
  permissions: string[];
}

export const tenantContext = new AsyncLocalStorage<TenantContextData>();

export function getTenantContext(): TenantContextData | undefined {
  return tenantContext.getStore();
}

export function requireTenantContext(): TenantContextData {
  const ctx = tenantContext.getStore();
  if (!ctx) {
    // AsyncLocalStorage context can be lost in certain async patterns
    // Log warning but don't fail - services should handle gracefully
    throw new Error('Tenant context not available. Ensure TenantContextMiddleware is applied and request is authenticated.');
  }
  return ctx;
}
