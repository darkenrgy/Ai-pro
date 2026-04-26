interface MediaControlsProps {
  muted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  canShareScreen: boolean;
  modeLabel: string;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onEndSession: () => void;
}

export function MediaControls({
  muted,
  cameraOff,
  screenSharing,
  canShareScreen,
  modeLabel,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onEndSession,
}: MediaControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 p-3">
      <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-100">
        {modeLabel}
      </span>
      <button
        type="button"
        onClick={onToggleMute}
        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200"
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
      <button
        type="button"
        onClick={onToggleCamera}
        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200"
      >
        {cameraOff ? 'Camera On' : 'Camera Off'}
      </button>
      <button
        type="button"
        onClick={onToggleScreenShare}
        disabled={!canShareScreen}
        className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {screenSharing ? 'Stop Share' : 'Share Screen'}
      </button>
      <button
        type="button"
        onClick={onEndSession}
        className="ml-auto rounded-full border border-rose-400/30 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200"
      >
        End Session
      </button>
    </div>
  );
}
