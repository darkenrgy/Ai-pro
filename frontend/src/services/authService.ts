import api from '@/services/http';
import { refreshAuthSession } from '@/services/authSession';
import type { AuthUser, LoginRequest, LoginResponse, RegisterRequest } from '@/types/auth';

export const authService = {
  login: async (request: LoginRequest): Promise<AuthUser> => {
    const response = await api.post<LoginResponse>('/auth/login', request);
    const payload = response.data;

    return {
      id: payload.userId,
      name: payload.username,
      email: payload.email,
      roles: payload.roles,
    };
  },
  loginWithResponse: (request: LoginRequest) => api.post<LoginResponse>('/auth/login', request),
  register: (request: RegisterRequest) => api.post<AuthUser>('/auth/register', request),
  refresh: () => refreshAuthSession(),
};
