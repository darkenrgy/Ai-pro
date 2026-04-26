export interface FileMetadata {
  fileId: string;
  fileName: string;
  sessionId: string;
  uploadedBy: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
  compressed: boolean;
  encrypted: boolean;
  contentType?: string;
  uploadedAt?: string;
  expiresAt?: string;
}

export interface FileUploadResult {
  success: boolean;
  message: string;
  fileId: string;
  fileName: string;
  originalSize: number;
  storedSize: number;
  compressed: boolean;
  encrypted: boolean;
  expiresAt: string;
}
