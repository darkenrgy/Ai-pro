import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { ModerationResult } from '@/types/chat';
import { useMediaRecorder } from '@/hooks/useMediaRecorder';

export type UploadableMediaType = 'image' | 'video' | 'audio' | 'file';

interface MediaUploaderProps {
  draftMessage: string;
  setDraftMessage: (value: string) => void;
  selectedRecipientId: string;
  disabled: boolean;
  moderation: ModerationResult | null;
  uploadProgress: number;
  sending: boolean;
  uploadError: string;
  onSendText: () => Promise<void>;
  onSendMedia: (file: Blob | File, fileName: string, mimeType: string, mediaType: UploadableMediaType) => Promise<void>;
  onCancelUpload: () => void;
}

const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];
const SUPPORTED_AUDIO_TYPES = ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg'];

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const AUDIO_MAX_BYTES = 12 * 1024 * 1024;
const FILE_MAX_BYTES = 25 * 1024 * 1024;

function validateFile(file: File, mediaType: UploadableMediaType): string {
  if (mediaType === 'image') {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      return 'Unsupported image format.';
    }
    if (file.size > IMAGE_MAX_BYTES) {
      return 'Image is too large. Max 8MB.';
    }
  }

  if (mediaType === 'video') {
    if (!SUPPORTED_VIDEO_TYPES.includes(file.type)) {
      return 'Unsupported video format.';
    }
    if (file.size > VIDEO_MAX_BYTES) {
      return 'Video is too large. Max 20MB.';
    }
  }

  if (mediaType === 'audio') {
    if (!SUPPORTED_AUDIO_TYPES.includes(file.type)) {
      return 'Unsupported audio format.';
    }
    if (file.size > AUDIO_MAX_BYTES) {
      return 'Audio is too large. Max 12MB.';
    }
  }

  if (mediaType === 'file' && file.size > FILE_MAX_BYTES) {
    return 'File is too large. Max 25MB.';
  }

  return '';
}

export function MediaUploader({
  draftMessage,
  setDraftMessage,
  selectedRecipientId,
  disabled,
  moderation,
  uploadProgress,
  sending,
  uploadError,
  onSendText,
  onSendMedia,
  onCancelUpload,
}: MediaUploaderProps) {
  const [localError, setLocalError] = useState('');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState('');

  const clearPendingImage = () => {
    if (pendingImageUrl) {
      URL.revokeObjectURL(pendingImageUrl);
    }
    setPendingImage(null);
    setPendingImageUrl('');
  };

  useEffect(() => {
    return () => {
      if (pendingImageUrl) {
        URL.revokeObjectURL(pendingImageUrl);
      }
    };
  }, [pendingImageUrl]);

  const onFilePicked = async (file: File | null, mediaType: UploadableMediaType) => {
    if (!file) {
      return;
    }

    const validationError = validateFile(file, mediaType);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError('');

    if (mediaType === 'image') {
      clearPendingImage();
      setPendingImage(file);
      setPendingImageUrl(URL.createObjectURL(file));
      return;
    }

    await onSendMedia(file, file.name, file.type || 'application/octet-stream', mediaType);
  };

  const sendAudio = async (blob: Blob) => {
    const fileName = `recording-${Date.now()}.webm`;
    await onSendMedia(blob, fileName, blob.type || 'audio/webm', 'audio');
  };

  const audioRecorder = useMediaRecorder({
    onRecorded: sendAudio,
  });

  const canSendText = useMemo(() => {
    return !disabled && !!selectedRecipientId && !!draftMessage.trim() && !moderation?.blocked;
  }, [disabled, draftMessage, moderation?.blocked, selectedRecipientId]);

  const handleTextSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSendText) {
      return;
    }

    await onSendText();
  };

  return (
    <form onSubmit={handleTextSubmit} className="mt-4 space-y-3 border-t border-white/10 pt-4">
      <textarea
        value={draftMessage}
        onChange={(event) => setDraftMessage(event.target.value)}
        rows={3}
        placeholder="Write an encrypted message..."
        className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
      />

      {(localError || uploadError || audioRecorder.recordingError) ? (
        <p className="text-xs text-rose-300">{localError || uploadError || audioRecorder.recordingError}</p>
      ) : null}

      {pendingImageUrl ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-slate-400">Image preview</p>
          <img src={pendingImageUrl} alt="Pending upload" className="mt-2 max-h-48 rounded-xl border border-white/10 object-contain" />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (!pendingImage) {
                  return;
                }
                void onSendMedia(pendingImage, pendingImage.name, pendingImage.type || 'image/jpeg', 'image').then(() => {
                  clearPendingImage();
                });
              }}
              className="rounded-full bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950"
            >
              Send image
            </button>
            <button
              type="button"
              onClick={clearPendingImage}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {sending ? (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
          <button
            type="button"
            onClick={onCancelUpload}
            className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200"
          >
            Cancel upload
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/40">
          📎 File
          <input
            type="file"
            className="hidden"
            onChange={(event) => {
              void onFilePicked(event.target.files?.[0] ?? null, 'file');
              event.currentTarget.value = '';
            }}
          />
        </label>

        <label className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/40">
          Image
          <input
            type="file"
            accept={SUPPORTED_IMAGE_TYPES.join(',')}
            className="hidden"
            onChange={(event) => {
              void onFilePicked(event.target.files?.[0] ?? null, 'image');
              event.currentTarget.value = '';
            }}
          />
        </label>

        <label className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/40">
          🎥 Video
          <input
            type="file"
            accept={SUPPORTED_VIDEO_TYPES.join(',')}
            className="hidden"
            onChange={(event) => {
              void onFilePicked(event.target.files?.[0] ?? null, 'video');
              event.currentTarget.value = '';
            }}
          />
        </label>

        <button
          type="button"
          onClick={() => {
            if (audioRecorder.isRecording) {
              audioRecorder.stopRecording();
            } else {
              void audioRecorder.startRecording();
            }
          }}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            audioRecorder.isRecording
              ? 'border-rose-400/40 bg-rose-500/20 text-rose-100'
              : 'border-white/15 bg-white/5 text-slate-200 hover:border-cyan-400/40'
          }`}
        >
          {audioRecorder.isRecording ? 'Stop recording' : '🎤 Record audio'}
        </button>

        <button
          type="submit"
          disabled={!canSendText}
          className="ml-auto rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          Send
        </button>
      </div>
    </form>
  );
}
