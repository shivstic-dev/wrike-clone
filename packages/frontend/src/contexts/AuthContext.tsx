import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import {
  setAccessToken,
  setTenantId,
  clearAuthState,
  setTokenRefreshCallback,
  setLogoutCallback,
  API_BASE_URL,
} from '../api/client';
import type { LoginRequest, LoginResponse, User } from '@wrike-clone/shared';
import toast from 'react-hot-toast';

interface AuthState {
  user: LoginResponse['user'] | null;
  tenant: LoginResponse['tenant'] | null;
  membership: LoginResponse['membership'] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
}

interface AuthContextValue extends AuthState {
  login: (input: LoginRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NOW = new Date().toISOString();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    tenant: null,
    membership: null,
    isAuthenticated: false,
    isLoading: true,
    mustChangePassword: false,
  });

  // G7: Try silent refresh on mount via httpOnly cookie
  useEffect(() => {
    const trySilentRefresh = async () => {
      try {
        const response = await fetch(API_BASE_URL + '/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });

        if (response.ok) {
          const data = await response.json();
          const { accessToken } = data;

          if (accessToken) {
            setAccessToken(accessToken);

            // Decode token to get user info
            try {
              const payload = JSON.parse(atob(accessToken.split('.')[1]));
              setTenantId(payload.tenantId);
              setState({
                user: {
                  id: payload.userId,
                  email: payload.email,
                  displayName: payload.email,
                  avatarUrl: null,
                  locale: 'en',
                  timezone: 'UTC',
                  isActive: true,
                  lastLoginAt: null,
                  tenantId: payload.tenantId,
                  createdAt: NOW,
                  updatedAt: NOW,
                  deletedAt: null,
                } as User,
                tenant: null,
                membership: {
                  id: payload.membershipId,
                  tenantId: payload.tenantId,
                  userId: payload.userId,
                  role: payload.role,
                  joinedAt: NOW,
                  isActive: true,
                } as LoginResponse['membership'],
                isAuthenticated: true,
                isLoading: false,
                mustChangePassword: false,
              });
              return;
            } catch {
              /* ignore decode errors */
            }
          }
        }
      } catch {
        /* silent refresh failed */
      }
      setState((prev) => ({ ...prev, isLoading: false }));
    };

    trySilentRefresh();
  }, []);

  // G7: Register callbacks for token refresh / logout from API client
  useEffect(() => {
    setTokenRefreshCallback((token: string) => {
      setAccessToken(token);
    });
    setLogoutCallback(() => {
      setState({
        user: null,
        tenant: null,
        membership: null,
        isAuthenticated: false,
        isLoading: false,
        mustChangePassword: false,
      });
    });
  }, []);

  const login = useCallback(async (input: LoginRequest) => {
    const response = await fetch(API_BASE_URL + '/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: 'Login failed' } }));
      throw new Error(err.error?.message || 'Login failed');
    }

    const data = await response.json();
    const { accessToken, user, tenant, membership, mustChangePassword } = data;

    // G7: Store access token in memory only
    setAccessToken(accessToken);
    setTenantId(user.tenantId);

    if (tenant?.slug) {
      localStorage.setItem('tenantSlug', tenant.slug);
    }

    setState({
      user,
      tenant,
      membership,
      isAuthenticated: true,
      isLoading: false,
      mustChangePassword: mustChangePassword === true,
    });

    toast.success('Welcome back, ' + (user.displayName || user.email));
  }, []);

  const logout = useCallback(async () => {
    try {
      // Clear the refresh cookie on the server
      await fetch(API_BASE_URL + '/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      /* ignore */
    }

    clearAuthState();
    localStorage.removeItem('tenantSlug');
    setState({
      user: null,
      tenant: null,
      membership: null,
      isAuthenticated: false,
      isLoading: false,
      mustChangePassword: false,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
