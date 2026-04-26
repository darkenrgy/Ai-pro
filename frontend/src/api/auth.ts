import api from './client';

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string | null;
  tokenType: string;
  expiresIn: number;
  refreshExpiresIn?: number | null;
  userId: string;
  username: string;
  email: string;
  roles: Array<{ id: string; name: string }>;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  createdAt: string;
  roles: Array<{ id: string; name: string }>;
}

export const authApi = {
  login: (data: LoginRequest) => api.post<LoginResponse>('/auth/login', data),
  register: (data: RegisterRequest) => api.post<User>('/auth/register', data),
  refresh: (refreshToken: string) => api.post<LoginResponse>('/auth/refresh', { refreshToken }),
};
