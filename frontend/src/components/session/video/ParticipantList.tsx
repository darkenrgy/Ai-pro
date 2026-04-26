interface ParticipantListProps {
  approvedUserIds: string[];
  resolveUserName: (userId: string) => string;
}

export function ParticipantList({ approvedUserIds, resolveUserName }: ParticipantListProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Approved Participants</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {approvedUserIds.length === 0 ? <span className="text-xs text-slate-400">No approved users yet.</span> : null}
        {approvedUserIds.map((userId) => (
          <span key={userId} className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">
            {resolveUserName(userId)}
          </span>
        ))}
      </div>
    </div>
  );
}
