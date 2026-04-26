export interface AuthRole {
  id: string;
  name: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roles: AuthRole[];
  enabled?: boolean;
  image?: string;
}

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
  roles: AuthRole[];
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  image?: string;
}
