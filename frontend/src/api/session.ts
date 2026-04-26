import api from './client';

export interface CreateSessionRequest {
  sessionName: string;
  description?: string;
  expirationMinutes: number;
}

export interface SessionDto {
  sessionId: string;
  hostId: string;
  sessionName: string;
  description: string;
  active: boolean;
  expiryTime: string;
  createdAt: string;
  participantCount?: number;
}

export interface JoinSessionRequest {
  sessionId: string;
  parentNodeId: string;
}

export interface UserNodeDto {
  nodeId: string;
  userId: string;
  sessionId: string;
  parentId?: string;
  active: boolean;
  joinedAt: string;
  leftAt?: string;
  children?: UserNodeDto[];
}

export const sessionApi = {
  createSession: (data: CreateSessionRequest) =>
    api.post<SessionDto>('/session/create', data),
  joinSession: (data: JoinSessionRequest) =>
    api.post<UserNodeDto>('/session/join', data),
  getSessionDetails: (sessionId: string) =>
    api.get<SessionDto>(`/session/${sessionId}`),
  getUserSessionView: (sessionId: string) =>
    api.get<UserNodeDto>(`/session/${sessionId}/me`),
  getHostedSessions: () =>
    api.get<SessionDto[]>('/session/hosted'),
  getRecentAccessibleSessions: () =>
    api.get<SessionDto[]>('/session/recent'),
  closeSession: (sessionId: string) =>
    api.put(`/session/${sessionId}/close`),
  deleteSession: (sessionId: string) =>
    api.delete(`/session/${sessionId}`),
};
