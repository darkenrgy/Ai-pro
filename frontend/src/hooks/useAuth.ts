import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { readLegacyAuthCache } from '@/utils/storage';
import { isTokenExpired, getTokenExpiryMs } from '@/utils/jwt';
import { useToastStore } from '@/store/toastStore';
import { refreshAuthSession } from '@/services/authSession';

export function useAuth() {
  return useAuthStore();
}

export function useBootstrapAuth(): void {
  const setAuth = useAuthStore((state) => state.setAuth);
  const hydrated = useAuthStore((state) => state.hydrated);

  useEffect(() => {
    if (hydrated) {
      return;
    }

    if (localStorage.getItem('ai-pro-auth')) {
      return;
    }

    const cached = readLegacyAuthCache();
    if (cached.user && cached.token) {
      setAuth(cached.user, cached.token);
    }
  }, [hydrated, setAuth]);
}

export function useAuthGuards(): void {
  const token = useAuthStore((state) => state.token);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    const onUnauthorized = () => {
      clearAuth();
      useToastStore.getState().pushToast({
        title: 'Session ended',
        message: 'Authentication failed. Please sign in again.',
        type: 'warning',
        durationMs: 3500,
      });
    };

    window.addEventListener('ai-pro:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ai-pro:unauthorized', onUnauthorized);
  }, [clearAuth]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    if (isTokenExpired(token)) {
      if (refreshToken) {
        void refreshAuthSession().then((result) => {
          if (!result) {
            clearAuth();
            useToastStore.getState().pushToast({
              title: 'Session ended',
              message: 'Your secure session expired. Sign in again.',
              type: 'warning',
              durationMs: 4000,
            });
          }
        });
      } else {
        clearAuth();
        useToastStore.getState().pushToast({
          title: 'Token expired',
          message: 'Your secure session expired. Sign in again.',
          type: 'warning',
          durationMs: 4000,
        });
      }
      return undefined;
    }

    const expiryMs = getTokenExpiryMs(token);
    if (!expiryMs) {
      return undefined;
    }

    const timeoutMs = Math.max(0, expiryMs - Date.now());
    const timer = window.setTimeout(() => {
      if (refreshToken) {
        void refreshAuthSession().then((result) => {
          if (!result) {
            clearAuth();
            useToastStore.getState().pushToast({
              title: 'Token expired',
              message: 'Your secure session expired. Sign in again.',
              type: 'warning',
              durationMs: 4000,
            });
          }
        });
        return;
      }

      clearAuth();
      useToastStore.getState().pushToast({
        title: 'Token expired',
        message: 'Your secure session expired. Sign in again.',
        type: 'warning',
        durationMs: 4000,
      });
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [token, refreshToken, clearAuth]);
}
