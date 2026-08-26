import { createContext, useContext, useState, type ReactNode } from 'react';

interface TenantContextValue {
  tenantSlug: string;
  setTenantSlug: (slug: string) => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantSlug, setTenantSlug] = useState<string>(
    () => localStorage.getItem('tenantSlug') || '',
  );

  const handleSetSlug = (slug: string) => {
    localStorage.setItem('tenantSlug', slug);
    setTenantSlug(slug);
  };

  return (
    <TenantContext.Provider value={{ tenantSlug, setTenantSlug: handleSetSlug }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return ctx;
}
