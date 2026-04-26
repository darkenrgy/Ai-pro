import api from './client';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  image?: string;
  enabled?: boolean;
}

export const userApi = {
  getUserById: (id: string) => api.get<UserDto>(`/users/${id}`),
};