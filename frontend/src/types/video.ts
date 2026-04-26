export type VideoCallState = 'idle' | 'waiting' | 'approved' | 'rejected' | 'connecting' | 'connected' | 'ended';
export type VideoSessionMode = 'call' | 'stream';
export type VideoParticipantRole = 'viewer' | 'speaker';

export type VideoSignalType =
  | 'call-started'
  | 'stream-started'
  | 'join-request'
  | 'controller-state'
  | 'state-updated'
  | 'waiting'
  | 'approved'
  | 'rejected'
  | 'user-joined'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'media-updated'
  | 'removed-user'
  | 'end-call'
  | 'end-stream';

export interface VideoSignalMessage {
  type: VideoSignalType;
  sessionId: string;
  fromUserId?: string;
  targetUserId?: string;
  affectedUserId?: string;
  controllerId?: string;
  mode?: VideoSessionMode;
  role?: VideoParticipantRole;
  sdp?: string;
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
  pendingRequestUserIds?: string[];
  approvedUserIds?: string[];
  activeParticipantUserIds?: string[];
  allowedScreenShareUserIds?: string[];
  participantRoles?: Record<string, VideoParticipantRole>;
  mediaType?: string;
  enabled?: boolean;
  state?: VideoCallState | string;
  retryAfterSeconds?: number;
  message?: string;
  timestamp?: string;
}

export interface VideoSignalRequest {
  sessionId: string;
  targetUserId?: string;
  sdp?: string;
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
  mode?: VideoSessionMode;
  role?: VideoParticipantRole;
  mediaType?: string;
  enabled?: boolean;
}
