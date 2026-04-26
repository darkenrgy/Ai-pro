import api from '@/services/http';
import type { FileMetadata, FileUploadResult } from '@/types/file';

interface UploadFileOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export const fileService = {
  uploadFile: async (
    sessionId: string,
    file: File,
    description?: string,
    options?: UploadFileOptions
  ): Promise<FileUploadResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', sessionId);

    if (description) {
      formData.append('description', description);
    }

    const response = await api.post<FileUploadResult>('/file/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      signal: options?.signal,
      onUploadProgress: (event) => {
        if (!options?.onProgress || !event.total) {
          return;
        }

        const progress = Math.round((event.loaded / event.total) * 100);
        options.onProgress(progress);
      },
    });

    return response.data;
  },
  listSessionFiles: async (sessionId: string): Promise<FileMetadata[]> => {
    const response = await api.get<{ files: FileMetadata[] }>(`/file/session/${sessionId}`);
    return response.data.files ?? [];
  },
  getFileMetadata: async (fileId: string): Promise<FileMetadata> => {
    const response = await api.get<FileMetadata>(`/file/${fileId}/metadata`);
    return response.data;
  },
  downloadFile: async (fileId: string): Promise<Blob> => {
    const response = await api.get(`/file/${fileId}`, { responseType: 'blob' });
    return response.data as Blob;
  },
  deleteFile: (fileId: string) => api.delete(`/file/${fileId}`),
};
