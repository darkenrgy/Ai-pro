import api from '@/services/http';

export interface UserProfileDto {
  id: string;
  name: string;
  email: string;
  image?: string;
  enabled?: boolean;
  deletionScheduledAt?: string;
}

export interface UserProfileUpdateRequest {
  name?: string;
  image?: string;
}

export interface UserPasswordUpdateRequest {
  currentPassword: string;
  newPassword: string;
}

export interface DeleteScheduleResponse {
  message: string;
  deletionAt: string;
  delayHours: number;
}

export const userService = {
  getUserById: (id: string) => api.get<UserProfileDto>(`/users/${id}`),
  getMe: () => api.get<UserProfileDto>('/users/me'),
  updateMe: (request: UserProfileUpdateRequest) => api.put<UserProfileDto>('/users/me', request),
  updatePassword: (request: UserPasswordUpdateRequest) => api.put('/users/me/password', request),
  scheduleDeleteMe: () => api.post<DeleteScheduleResponse>('/users/me/delete-schedule'),
};
