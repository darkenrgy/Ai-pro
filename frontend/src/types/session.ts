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
  participants?: UserNodeDto[];
}

export interface JoinSessionRequest {
  sessionId: string;
  parentNodeId: string;
  sharedSecret: string;
}

export interface ApprovePermissionRequest {
  sharedSecret: string;
}

export interface UserNodeDto {
  nodeId: string;
  userId: string;
  sessionId: string;
  parentId?: string;
  active: boolean;
  permissionGranted?: boolean;
  joinedAt: string;
  leftAt?: string;
  children?: UserNodeDto[];
}

export interface GenerateSecureImageRequest {
  sessionId: string;
  parentId: string;
  expiryTime: string;
  width?: number;
  height?: number;
}
