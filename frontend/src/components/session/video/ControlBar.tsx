interface ControlBarProps {
  muted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onEndCall: () => void;
  disabled?: boolean;
}

export function ControlBar({
  muted,
  cameraOff,
  screenSharing,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onEndCall,
  disabled = false,
}: ControlBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 p-3">
      <button
        type="button"
        onClick={onToggleMute}
        disabled={disabled}
        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
      <button
        type="button"
        onClick={onToggleCamera}
        disabled={disabled}
        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cameraOff ? 'Camera On' : 'Camera Off'}
      </button>
      <button
        type="button"
        onClick={onToggleScreenShare}
        disabled={disabled}
        className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {screenSharing ? 'Stop Share' : 'Share Screen'}
      </button>
      <button
        type="button"
        onClick={onEndCall}
        className="ml-auto rounded-full border border-rose-400/30 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200"
      >
        End Call
      </button>
    </div>
  );
}
