import type { AuthUser } from '@/types/auth';

const AUTH_STORAGE_KEY = 'ai-pro-auth';

export function clearAuthStorage(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem('user');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('rememberMe');
}

export function readLegacyAuthCache(): { user: AuthUser | null; token: string | null } {
  const storedUser = localStorage.getItem('user');
  const storedToken = localStorage.getItem('accessToken');

  if (!storedUser || !storedToken) {
    return { user: null, token: null };
  }

  try {
    const parsedUser = JSON.parse(storedUser) as AuthUser;
    if (!parsedUser?.id || !parsedUser?.email) {
      throw new Error('Invalid cached user');
    }

    return { user: parsedUser, token: storedToken };
  } catch {
    clearAuthStorage();
    return { user: null, token: null };
  }
}
