import api from '@/services/http';

const DEV_WEBSOCKET_URL = '/ws/chat';

export interface ChatMessageRequest {
  messageId?: string;
  receiverId: string;
  encryptedMessage?: string;
  moderationContent?: string;
  type?: 'text' | 'image' | 'video' | 'audio' | 'file' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
  content?: string;
  sessionId?: string;
}

export interface ChatMessageResponseDto {
  messageId: string;
  senderId: string;
  receiverId: string;
  encryptedMessage: string;
  type?: 'text' | 'image' | 'video' | 'audio' | 'file';
  content?: string;
  timestamp: string;
  sessionId?: string;
  status: string;
}

export interface ChatSocketEnvelope {
  type: 'text' | 'image' | 'video' | 'audio' | 'file';
  content: string;
  senderId: string;
  receiverId: string;
  sessionId?: string;
  messageId?: string;
}

export const CHAT_WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL ?? (import.meta.env.DEV ? DEV_WEBSOCKET_URL : '/ws/chat');

export const chatService = {
  sendMessage: (request: ChatMessageRequest) => api.post('/chat/send', request),
  getConnectedUsers: (sessionId: string) => api.get<string[]>(`/chat/sessions/${sessionId}/connected-users`),
  getSessionMessages: (sessionId: string) => api.get<ChatMessageResponseDto[]>(`/chat/sessions/${sessionId}/messages`),
};
