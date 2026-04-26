export interface ChatMessage {
  id: string;
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: ChatMessageType;
  media?: ChatMediaReference;
  localPreviewUrl?: string;
  status?: 'pending' | 'sent' | 'failed';
  timestamp: string;
  isOwn: boolean;
}

export type ChatMessageType = 'text' | 'image' | 'video' | 'audio' | 'file';

export interface ChatMediaReference {
  fileId: string;
  fileName: string;
  mimeType: string;
  mediaType: Exclude<ChatMessageType, 'text'>;
  sizeBytes: number;
  encrypted: boolean;
  compressed: boolean;
}

export interface EncryptedChatPayloadV2 {
  type: ChatMessageType;
  text?: string;
  media?: ChatMediaReference;
}

export interface ConnectedUser {
  id: string;
  name: string;
  email: string;
  online: boolean;
}

export type ModerationCategory = 'trafficking' | 'child_exploitation' | 'weapons' | 'none';
export type ModerationAction = 'allow' | 'warn' | 'block';
export type ModerationInputType = 'text' | 'image';

export interface ModerationResult {
  riskScore: number;
  flagged: boolean;
  category: ModerationCategory;
  action: ModerationAction;
  blockSession: boolean;
  detectedLanguage: string;
  userViolationCount: number;
  sessionViolationCount: number;
  matchedKeywords: string[];
  matchedPatterns: string[];
  risk_score: number;
  flagged_content: boolean;
  block_session: boolean;
  warning: boolean;
  blocked: boolean;
}

export interface ModerationInput {
  type: ModerationInputType;
  content: string;
  sessionId?: string;
  userId?: string;
  recordViolation?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface ModerationApiResponse {
  risk_score: number;
  flagged: boolean;
  category: ModerationCategory;
  action: ModerationAction;
  block_session: boolean;
  detected_language: string;
  user_violation_count: number;
  session_violation_count: number;
  matched_keywords: string[];
  matched_patterns: string[];
}
