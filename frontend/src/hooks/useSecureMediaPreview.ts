import { useCallback, useEffect, useState } from 'react';
import { fileService } from '@/services/fileService';
import { decryptFile } from '@/utils/mediaCrypto';
import { decompressFile } from '@/utils/compression';
import type { ChatMediaReference } from '@/types/chat';

interface UseSecureMediaPreviewOptions {
  media: ChatMediaReference;
  chatKey: CryptoKey;
}

export function useSecureMediaPreview({ media, chatKey }: UseSecureMediaPreviewOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [objectUrl, setObjectUrl] = useState('');
  const [resolvedBlob, setResolvedBlob] = useState<Blob | null>(null);

  const load = useCallback(async () => {
    if (loading || objectUrl) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const encryptedBlob = await fileService.downloadFile(media.fileId);
      const decryptedBlob = await decryptFile(encryptedBlob, chatKey);

      let finalBlob: Blob = decryptedBlob;
      if (media.compressed && media.mediaType === 'file') {
        const unpacked = await decompressFile(decryptedBlob);
        if (unpacked.length > 0) {
          finalBlob = unpacked[0];
        }
      }

      const nextObjectUrl = URL.createObjectURL(finalBlob);
      setResolvedBlob(finalBlob);
      setObjectUrl(nextObjectUrl);
    } catch {
      setError('Unable to load encrypted media. Retry in a moment.');
    } finally {
      setLoading(false);
    }
  }, [chatKey, loading, media, objectUrl]);

  const reset = useCallback(() => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }

    setObjectUrl('');
    setResolvedBlob(null);
    setError('');
  }, [objectUrl]);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  return {
    loading,
    error,
    objectUrl,
    resolvedBlob,
    load,
    reset,
  };
}
