import { describe, expect, it } from 'vitest';
import { resolveLoginTenantSlug } from './LoginPage';

describe('resolveLoginTenantSlug', () => {
  it('uses the saved tenant when the tenant field is hidden', () => {
    expect(resolveLoginTenantSlug('', 'cankids-india')).toBe('cankids-india');
  });

  it('prefers a tenant entered by the user', () => {
    expect(resolveLoginTenantSlug('another-tenant', 'cankids-india')).toBe('another-tenant');
  });

  it('returns undefined when no tenant is available', () => {
    expect(resolveLoginTenantSlug('  ', '  ')).toBeUndefined();
  });
});
