import type { VideoCallState } from '@/types/video';
import { JoinRequestModal } from '@/components/session/video/JoinRequestModal';

interface ViewerPanelProps {
  open: boolean;
  state: VideoCallState;
  controllerName: string;
  retryAfterSeconds: number;
  onRequestJoin: () => void;
  roleLabel: string;
}

export function ViewerPanel({
  open,
  state,
  controllerName,
  retryAfterSeconds,
  onRequestJoin,
  roleLabel,
}: ViewerPanelProps) {
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Viewer Panel</p>
      <p className="text-xs text-slate-300">Current role: {roleLabel}</p>
      <JoinRequestModal
        open={open}
        state={state}
        controllerName={controllerName}
        retryAfterSeconds={retryAfterSeconds}
        onRequestJoin={onRequestJoin}
        showAction={false}
      />
    </div>
  );
}
