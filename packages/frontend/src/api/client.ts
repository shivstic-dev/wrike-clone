import axios from 'axios';

// G7: Access token stored in-memory only (never persisted to localStorage)
let inMemoryAccessToken: string | null = null;
let inMemoryTenantId: string | null = null;

// Callback for when tokens change (used by AuthContext to sync state)
let onTokenRefreshed: ((token: string) => void) | null = null;
let onLogout: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setTenantId(id: string | null) {
  inMemoryTenantId = id;
}

export function getTenantId(): string | null {
  return inMemoryTenantId;
}

export function setTokenRefreshCallback(cb: (token: string) => void) {
  onTokenRefreshed = cb;
}

export function setLogoutCallback(cb: () => void) {
  onLogout = cb;
}

export function clearAuthState() {
  inMemoryAccessToken = null;
  inMemoryTenantId = null;
}

// Use VITE_API_URL in production (Vercel), default to '/api/v1' for Vite dev proxy
const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api/v1';

export { API_BASE_URL };

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // G7: Send cookies (httpOnly refresh token)
});

// Request interceptor: attach JWT from memory and tenant headers
apiClient.interceptors.request.use(
  (config) => {
    if (inMemoryAccessToken) {
      config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
    }

    if (inMemoryTenantId) {
      config.headers['X-Tenant-Id'] = inMemoryTenantId;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: handle 401 and attempt silent refresh via httpOnly cookie
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // G7: Refresh token is sent automatically via httpOnly cookie
        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );

        const { accessToken } = response.data;
        if (accessToken) {
          inMemoryAccessToken = accessToken;
          if (onTokenRefreshed) onTokenRefreshed(accessToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        }
      } catch {
        // Refresh failed — log out
        clearAuthState();
        if (onLogout) onLogout();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
