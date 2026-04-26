import type { ChatMediaReference } from '@/types/chat';
import { useSecureMediaPreview } from '@/hooks/useSecureMediaPreview';

interface VideoMessageProps {
  media: ChatMediaReference;
  chatKey: CryptoKey;
}

export function VideoMessage({ media, chatKey }: VideoMessageProps) {
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
          {preview.loading ? 'Decrypting video...' : 'Load encrypted video'}
        </button>
      ) : null}

      {preview.error ? <p className="text-xs text-rose-300">{preview.error}</p> : null}

      {preview.objectUrl ? (
        <video src={preview.objectUrl} controls className="max-h-80 w-full rounded-2xl border border-white/10" />
      ) : null}
    </div>
  );
}
