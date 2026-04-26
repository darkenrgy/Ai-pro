import api from '@/services/http';
import type { ApprovePermissionRequest, CreateSessionRequest, GenerateSecureImageRequest, JoinSessionRequest, SessionDto, UserNodeDto } from '@/types/session';

export const sessionService = {
  createSession: (request: CreateSessionRequest) => api.post<SessionDto>('/session/create', request),
  joinSession: (request: JoinSessionRequest) => api.post<UserNodeDto>('/session/join', request),
  getSessionDetails: (sessionId: string) => api.get<SessionDto>(`/session/${sessionId}`),
  getUserSessionView: (sessionId: string) => api.get<UserNodeDto>(`/session/${sessionId}/me`),
  getHostedSessions: () => api.get<SessionDto[]>('/session/hosted'),
  getRecentAccessibleSessions: () => api.get<SessionDto[]>('/session/recent'),
  getPendingPermissions: (sessionId: string) => api.get<UserNodeDto[]>(`/session/${sessionId}/permissions/pending`),
  approvePermission: (sessionId: string, nodeId: string, request: ApprovePermissionRequest) =>
    api.put<UserNodeDto>(`/session/${sessionId}/permissions/${nodeId}/approve`, request),
  leaveSession: (sessionId: string, nodeId: string) => api.delete(`/session/${nodeId}`, { params: { sessionId } }),
  closeSession: (sessionId: string) => api.put(`/session/${sessionId}/close`),
  deleteSession: (sessionId: string) => api.delete(`/session/${sessionId}`),
  generateSecureImage: async (request: GenerateSecureImageRequest): Promise<Blob> => {
    const response = await api.post('/session/generate-image', request, { responseType: 'blob' });
    return response.data as Blob;
  },
};
