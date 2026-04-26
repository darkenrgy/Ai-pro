import api from './client';

const DEV_WEBSOCKET_URL = '/ws/chat';

export interface ChatMessageRequest {
  messageId?: string;
  receiverId: string;
  encryptedMessage: string;
  content?: string;
  moderationContent?: string;
  sessionId?: string;
}

export interface ChatMessageResponse {
  messageId: string;
  senderId: string;
  receiverId: string;
  encryptedMessage: string;
  timestamp: string;
  sessionId?: string;
  status: 'DELIVERED' | 'PENDING';
}

export interface ModeratedChatResponse {
  message: ChatMessageResponse;
  action: 'allow' | 'warn' | 'strong_warn' | 'block';
  riskScore: number;
  flagged: boolean;
  category: 'safe' | 'human_trafficking' | 'child_exploitation' | 'illegal_weapons';
  blockSession: boolean;
  userViolationCount: number;
  sessionViolationCount: number;
}

export const chatApi = {
  sendMessage: (data: ChatMessageRequest) =>
    api.post<ModeratedChatResponse>('/chat/send', data),
  getConnectedUsers: (sessionId: string) =>
    api.get<string[]>(`/chat/sessions/${sessionId}/connected-users`),
};

// SockJS requires an HTTP(S) endpoint URL, not ws://.
// In local dev, use the Vite proxy so the browser stays on the frontend origin.
export const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL ?? (import.meta.env.DEV ? DEV_WEBSOCKET_URL : '/ws/chat');
