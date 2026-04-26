import type { VideoCallState } from '@/types/video';

interface JoinRequestModalProps {
  open: boolean;
  state: VideoCallState;
  controllerName: string;
  retryAfterSeconds: number;
  onRequestJoin: () => void;
  showAction?: boolean;
}

export function JoinRequestModal({
  open,
  state,
  controllerName,
  retryAfterSeconds,
  onRequestJoin,
  showAction = true,
}: JoinRequestModalProps) {
  if (!open) {
    return null;
  }

  const title = state === 'waiting'
    ? 'Waiting for approval'
    : state === 'rejected'
      ? 'Join request rejected'
      : state === 'approved'
        ? 'Approved'
        : state === 'connecting'
          ? 'Connecting'
          : state === 'connected'
            ? 'Connected'
        : 'Call available';

  const description = state === 'waiting'
    ? `Your request is pending with ${controllerName}.`
    : state === 'rejected'
      ? `Please retry in ${retryAfterSeconds}s.`
      : state === 'connecting'
        ? 'Setting up secure audio/video with the host...'
        : state === 'connected'
          ? 'Real-time audio/video is active.'
      : `Request approval from ${controllerName} to join.`;

  const canRequest = state === 'idle' || state === 'rejected';

  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-100">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-xs text-amber-200/90">{description}</p>
      {canRequest && showAction ? (
        <button
          type="button"
          onClick={onRequestJoin}
          className="mt-3 rounded-full bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-900"
        >
          Request to Join
        </button>
      ) : null}
    </div>
  );
}
