import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessage, ModerationResult } from '@/types/chat';
import type { ConnectedUser } from '@/types/chat';
import { ChatBox, MediaUploader } from '@/components/chat';

interface ChatPanelProps {
  participants: ConnectedUser[];
  selectedRecipientId: string;
  setSelectedRecipientId: Dispatch<SetStateAction<string>>;
  chatKey: CryptoKey | null;
  messages: ChatMessage[];
  draftMessage: string;
  setDraftMessage: Dispatch<SetStateAction<string>>;
  connectionState: 'locked' | 'connecting' | 'connected' | 'disconnected';
  permissionGranted: boolean;
  moderation: ModerationResult | null;
  sendingMedia: boolean;
  uploadProgress: number;
  uploadError: string;
  sendMessage: () => Promise<void>;
  sendMediaMessage: (file: Blob | File, fileName: string, mimeType: string, mediaType: 'image' | 'video' | 'audio' | 'file') => Promise<void>;
  cancelUpload: () => void;
}

export function ChatPanel({
  participants,
  selectedRecipientId,
  setSelectedRecipientId,
  chatKey,
  messages,
  draftMessage,
  setDraftMessage,
  connectionState,
  permissionGranted,
  moderation,
  sendingMedia,
  uploadProgress,
  uploadError,
  sendMessage,
  sendMediaMessage,
  cancelUpload,
}: ChatPanelProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Chat</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Encrypted message space</h3>
        </div>
        <div className="flex items-center gap-2">
          {permissionGranted && connectionState !== 'connected' ? (
            <div className="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-100">
              Fallback delivery active
            </div>
          ) : null}
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {connectionState}
          </div>
        </div>
      </div>

      {!permissionGranted ? (
        <div className="mt-5 rounded-3xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Chat access pending host approval. After approval, this panel connects automatically.
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Recipients</p>
          <div className="mt-3 space-y-2">
            {participants.length === 0 ? <p className="text-sm text-slate-400">No connected recipients yet.</p> : null}
            {participants.map((participant) => (
              <button
                key={participant.id}
                onClick={() => setSelectedRecipientId(participant.id)}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  selectedRecipientId === participant.id
                    ? 'border-cyan-400/50 bg-cyan-400/10 text-white'
                    : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-cyan-400/30 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{participant.name}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                      participant.online
                        ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-200'
                        : 'border border-slate-500/30 bg-slate-500/15 text-slate-300'
                    }`}
                  >
                    {participant.online ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">Node status: {participant.online ? 'Online' : 'Offline'}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-[32rem] flex-col rounded-3xl border border-white/10 bg-slate-950/60 p-4">
          {chatKey ? <ChatBox messages={messages} chatKey={chatKey} /> : <p className="text-sm text-slate-400">Initializing encryption key...</p>}

          <MediaUploader
            draftMessage={draftMessage}
            setDraftMessage={setDraftMessage}
            selectedRecipientId={selectedRecipientId}
            disabled={!permissionGranted || !chatKey}
            moderation={moderation}
            uploadProgress={uploadProgress}
            sending={sendingMedia}
            uploadError={uploadError}
            onSendText={sendMessage}
            onSendMedia={sendMediaMessage}
            onCancelUpload={cancelUpload}
          />
        </div>
      </div>
    </div>
  );
}
