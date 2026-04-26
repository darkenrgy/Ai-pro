import type { ChatMediaReference } from '@/types/chat';
import { useSecureMediaPreview } from '@/hooks/useSecureMediaPreview';

interface FileMessageProps {
  media: ChatMediaReference;
  chatKey: CryptoKey;
}

export function FileMessage({ media, chatKey }: FileMessageProps) {
  const preview = useSecureMediaPreview({ media, chatKey });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <p className="text-sm font-medium text-slate-100">{media.fileName}</p>
        <p className="mt-1 text-xs text-slate-400">{Math.round(media.sizeBytes / 1024)} KB</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {!preview.objectUrl ? (
          <button
            type="button"
            onClick={() => {
              void preview.load();
            }}
            disabled={preview.loading}
            className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {preview.loading ? 'Decrypting file...' : 'Decrypt file'}
          </button>
        ) : null}

        {preview.objectUrl ? (
          <a
            href={preview.objectUrl}
            download={media.fileName}
            className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/20"
          >
            Download
          </a>
        ) : null}
      </div>

      {preview.error ? <p className="text-xs text-rose-300">{preview.error}</p> : null}
    </div>
  );
}
