import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import type { LoginResponse } from '@/types/auth';

const DEV_API_BASE_URL = '/api/v1';

const authClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? DEV_API_BASE_URL : '/api/v1'),
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshInFlight: Promise<LoginResponse | null> | null = null;

async function requestRefresh(refreshToken: string): Promise<LoginResponse> {
  try {
    const response = await authClient.post<LoginResponse>('/auth/refresh', { refreshToken });
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status !== 404) {
      throw error;
    }

    const fallbackResponse = await authClient.post<LoginResponse>('/auth/refresh-token', { refreshToken });
    return fallbackResponse.data;
  }
}

export async function refreshAuthSession(): Promise<LoginResponse | null> {
  const { refreshToken, user } = useAuthStore.getState();

  if (!refreshToken || !user) {
    return null;
  }

  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = requestRefresh(refreshToken)
    .then((payload) => {
      useAuthStore.getState().setAuth(
        {
          id: payload.userId,
          name: payload.username,
          email: payload.email,
          roles: payload.roles,
        },
        payload.accessToken,
        payload.refreshToken ?? refreshToken,
        true
      );
      return payload;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}