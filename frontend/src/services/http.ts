import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { clearAuthStorage } from '@/utils/storage';
import { refreshAuthSession } from '@/services/authSession';

const DEV_API_BASE_URL = '/api/v1';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? DEV_API_BASE_URL : '/api/v1'),
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const requestPath = config.url ?? '';
  const isAuthEndpoint = /\/auth\/(login|register|refresh)\/?$/i.test(requestPath);

  if (isAuthEndpoint) {
    if (config.headers?.Authorization) {
      delete config.headers.Authorization;
    }
    return config;
  }

  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const requestPath = originalRequest?.url ?? '';
    const isAuthEndpoint = /\/auth\/(login|register|refresh)\/?$/i.test(requestPath);
    const status = error.response?.status;

    if (isAuthEndpoint && !/\/auth\/refresh\/?$/i.test(requestPath)) {
      return Promise.reject(error);
    }

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      const refreshed = await refreshAuthSession();

      if (refreshed) {
        const token = useAuthStore.getState().token;
        if (token && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return api(originalRequest);
      }
    }

    // Only force sign-out on authorization failures.
    if (status === 401 || status === 403) {
      useAuthStore.getState().clearAuth();
      clearAuthStorage();
      window.dispatchEvent(new Event('ai-pro:unauthorized'));
    }

    return Promise.reject(error);
  }
);

export default api;
