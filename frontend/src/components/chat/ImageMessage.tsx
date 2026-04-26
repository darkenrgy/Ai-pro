import type { ChatMediaReference } from '@/types/chat';
import { useSecureMediaPreview } from '@/hooks/useSecureMediaPreview';

interface ImageMessageProps {
  media: ChatMediaReference;
  chatKey: CryptoKey;
}

export function ImageMessage({ media, chatKey }: ImageMessageProps) {
  const preview = useSecureMediaPreview({ media, chatKey });

  return (
    <div className="space-y-3">
      {!preview.objectUrl ? (
        <button
          type="button"
          onClick={() => {
            void preview.load();
          }}
          disabled={preview.loading}
          className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {preview.loading ? 'Decrypting image...' : 'Load encrypted image'}
        </button>
      ) : null}

      {preview.error ? <p className="text-xs text-rose-300">{preview.error}</p> : null}

      {preview.objectUrl ? (
        <a href={preview.objectUrl} target="_blank" rel="noreferrer" className="block">
          <img
            src={preview.objectUrl}
            alt={media.fileName}
            className="max-h-64 w-full rounded-2xl border border-white/10 object-contain"
          />
        </a>
      ) : null}
    </div>
  );
}
