interface WaitingScreenProps {
  controllerName: string;
  retryAfterSeconds: number;
  state: 'waiting' | 'rejected' | 'idle';
}

export function WaitingScreen({ controllerName, retryAfterSeconds, state }: WaitingScreenProps) {
  const title = state === 'rejected' ? 'Request denied' : 'Waiting for approval...';
  const message =
    state === 'rejected'
      ? `You can retry in ${retryAfterSeconds}s.`
      : `Your join request has been sent to ${controllerName}.`;

  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-amber-100">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-amber-200/90">{message}</p>
    </div>
  );
}
