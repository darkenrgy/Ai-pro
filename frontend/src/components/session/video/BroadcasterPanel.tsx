import { ControllerDashboard } from '@/components/session/video/ControllerDashboard';

interface BroadcasterPanelProps {
  requestUserIds: string[];
  approvedUserIds: string[];
  resolveUserName: (userId: string) => string;
  highlightedRequesterId?: string;
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onAllowScreenShare: (userId: string, enabled: boolean) => void;
  onRemove: (userId: string) => void;
  roleByUserId: Record<string, string>;
  screenPermissionByUser: Record<string, boolean>;
}

export function BroadcasterPanel({
  requestUserIds,
  approvedUserIds,
  resolveUserName,
  highlightedRequesterId,
  onApprove,
  onReject,
  onPromote,
  onDemote,
  onAllowScreenShare,
  onRemove,
  roleByUserId,
  screenPermissionByUser,
}: BroadcasterPanelProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Broadcaster Controls</p>
      <ControllerDashboard
        requestUserIds={requestUserIds}
        approvedUserIds={approvedUserIds}
        resolveUserName={resolveUserName}
        highlightedRequesterId={highlightedRequesterId}
        onApprove={onApprove}
        onReject={onReject}
      />

      <div className="space-y-2">
        {approvedUserIds.map((userId) => (
          <div key={userId} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
            <span className="font-medium text-slate-100">{resolveUserName(userId)}</span>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase text-slate-300">
              {roleByUserId[userId] ?? 'speaker'}
            </span>
            <button type="button" onClick={() => onPromote(userId)} className="ml-auto rounded-full border border-emerald-300/30 px-2 py-1 text-[10px] font-semibold text-emerald-200">
              Promote
            </button>
            <button type="button" onClick={() => onDemote(userId)} className="rounded-full border border-amber-300/30 px-2 py-1 text-[10px] font-semibold text-amber-200">
              Viewer
            </button>
            <button
              type="button"
              onClick={() => onAllowScreenShare(userId, !screenPermissionByUser[userId])}
              className="rounded-full border border-cyan-300/30 px-2 py-1 text-[10px] font-semibold text-cyan-200"
            >
              {screenPermissionByUser[userId] ? 'Revoke Share' : 'Allow Share'}
            </button>
            <button type="button" onClick={() => onRemove(userId)} className="rounded-full border border-rose-300/30 px-2 py-1 text-[10px] font-semibold text-rose-200">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
