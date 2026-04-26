import { QRCodeSVG } from 'qrcode.react';
import type { SessionDto, UserNodeDto } from '@/types/session';
import { downloadBlob } from '@/utils/download';
import { sessionService } from '@/services/sessionService';

interface SecureAccessCardProps {
  session: SessionDto | null;
  node: UserNodeDto | null;
}

export function SecureAccessCard({ session, node }: SecureAccessCardProps) {
  const handleGenerate = async () => {
    if (!session || !node) {
      return;
    }

    const blob = await sessionService.generateSecureImage({
      sessionId: session.sessionId,
      parentId: node.nodeId,
      expiryTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      width: 540,
      height: 360,
    });

    downloadBlob(blob, `secure-access-${session.sessionId}.png`);
  };

  const qrValue = session && node ? `${window.location.origin}/join-session?sessionId=${session.sessionId}&parentNodeId=${node.nodeId}` : `${window.location.origin}/join-session`;

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Access</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Secure image and QR entry</h3>
        </div>
        <button
          onClick={handleGenerate}
          disabled={!session || !node}
          className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          Download PNG
        </button>
      </div>
      <div className="mt-5 flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 sm:flex-row sm:items-start">
        <div className="rounded-2xl bg-white p-3">
          <QRCodeSVG value={qrValue} size={160} bgColor="#ffffff" fgColor="#0f172a" />
        </div>
        <div className="space-y-3 text-sm text-slate-300">
          <p>Share the QR route for quick entry or generate the secure PNG with embedded metadata.</p>
          <p className="text-slate-400">The image expires after the configured window and can be consumed once by the backend.</p>
        </div>
      </div>
    </div>
  );
}
