interface PermissionModalProps {
  open: boolean;
  requesterName: string;
  onApprove: () => void;
  onReject: () => void;
}

export function PermissionModal({ open, requesterName, onApprove, onReject }: PermissionModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
      <p className="font-semibold">Join request</p>
      <p className="mt-1 text-xs text-cyan-100/90">{requesterName} requested access to your live call.</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-900"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
