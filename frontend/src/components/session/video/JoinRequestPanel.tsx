interface JoinRequestPanelProps {
  requestUserIds: string[];
  resolveUserName: (userId: string) => string;
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
}

export function JoinRequestPanel({ requestUserIds, resolveUserName, onApprove, onReject }: JoinRequestPanelProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Join Requests</p>
      {requestUserIds.length === 0 ? <p className="mt-2 text-xs text-slate-400">No pending requests.</p> : null}
      <div className="mt-2 space-y-2">
        {requestUserIds.map((userId) => (
          <div key={userId} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2">
            <span className="text-xs text-slate-200">{resolveUserName(userId)}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onApprove(userId)}
                className="rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-slate-900"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => onReject(userId)}
                className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-200"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
