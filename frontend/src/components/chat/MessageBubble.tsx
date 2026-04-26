import type { ChatMessage } from '@/types/chat';
import { ImageMessage } from '@/components/chat/ImageMessage';
import { VideoMessage } from '@/components/chat/VideoMessage';
import { AudioMessage } from '@/components/chat/AudioMessage';
import { FileMessage } from '@/components/chat/FileMessage';

interface MessageBubbleProps {
  message: ChatMessage;
  chatKey: CryptoKey;
}

export function MessageBubble({ message, chatKey }: MessageBubbleProps) {
  const baseClass = message.isOwn
    ? 'ml-auto bg-cyan-400/15 text-cyan-50'
    : 'bg-white/5 text-slate-100';

  return (
    <article className={`max-w-3xl rounded-3xl px-4 py-3 ${baseClass}`}>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
        <span>{message.senderName}</span>
        <span className="inline-flex items-center gap-2">
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
          {message.status === 'pending' ? <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] text-amber-100">Uploading...</span> : null}
          {message.status === 'failed' ? <span className="rounded-full bg-rose-400/20 px-2 py-0.5 text-[10px] text-rose-100">Failed</span> : null}
        </span>
      </div>

      {message.type === 'text' ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.content}</p>
      ) : null}

      {message.type !== 'text' && message.media ? (
        <div className="mt-3">
          {message.type === 'image' ? <ImageMessage media={message.media} chatKey={chatKey} /> : null}
          {message.type === 'video' ? <VideoMessage media={message.media} chatKey={chatKey} /> : null}
          {message.type === 'audio' ? <AudioMessage media={message.media} chatKey={chatKey} /> : null}
          {message.type === 'file' ? <FileMessage media={message.media} chatKey={chatKey} /> : null}
        </div>
      ) : null}

      {message.type !== 'text' && !message.media && message.localPreviewUrl ? (
        <div className="mt-3 space-y-2">
          {message.type === 'image' ? (
            <img src={message.localPreviewUrl} alt={message.content} className="max-h-56 w-full rounded-2xl border border-white/10 object-contain" />
          ) : null}
          {message.type === 'video' ? (
            <video src={message.localPreviewUrl} controls className="max-h-72 w-full rounded-2xl border border-white/10" />
          ) : null}
          {message.type === 'audio' ? (
            <audio src={message.localPreviewUrl} controls className="w-full" />
          ) : null}
          {message.type === 'file' ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">Preparing encrypted upload for {message.content}</div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
