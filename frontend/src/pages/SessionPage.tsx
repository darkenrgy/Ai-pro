import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ChatPanel } from '@/components/session/ChatPanel';
import { FileVault } from '@/components/session/FileVault';
import { ModerationMeter } from '@/components/session/ModerationMeter';
import { ParticipantChain } from '@/components/session/ParticipantChain';
import { SecureAccessCard } from '@/components/session/SecureAccessCard';
import { SessionExpiryTimer } from '@/components/session/SessionExpiryTimer';
import { VideoCallContainer } from '@/components/session/video';
import { useSessionWorkspace } from '@/hooks/useSessionWorkspace';
import { sessionService } from '@/services/sessionService';
import { useToastStore } from '@/store/toastStore';

export function SessionPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const workspace = useSessionWorkspace(sessionId);
  const pushToast = useToastStore((state) => state.pushToast);
  const [leaving, setLeaving] = useState(false);
  const [approvalSecrets, setApprovalSecrets] = useState<Record<string, string>>({});
  const [approvingNodeId, setApprovingNodeId] = useState('');
  const [revokingNodeId, setRevokingNodeId] = useState('');

  const handleLeaveSession = async () => {
    if (!workspace.session?.sessionId || !workspace.selfNode?.nodeId || leaving) {
      return;
    }

    setLeaving(true);
    try {
      await sessionService.leaveSession(workspace.session.sessionId, workspace.selfNode.nodeId);
      pushToast({
        title: 'Left session',
        message: 'You have left the session successfully.',
        type: 'success',
        durationMs: 3000,
      });
      navigate('/dashboard');
    } catch {
      pushToast({
        title: 'Unable to leave session',
        message: 'Please try again in a moment.',
        type: 'error',
        durationMs: 3500,
      });
    } finally {
      setLeaving(false);
    }
  };

  if (workspace.loading && !workspace.session) {
    return (
      <AppShell title="Loading session" subtitle="Preparing the encrypted workspace.">
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-sm text-slate-300">Loading session data...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={workspace.session?.sessionName ?? 'Secure Session'}
      subtitle={workspace.session?.description || 'A zero-trust workspace with encrypted chat, chained participants, file exchange, and secure access imagery.'}
    >
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <SecureAccessCard session={workspace.session} node={workspace.selfNode} />
          <ParticipantChain node={workspace.selfNode} resolveUserName={workspace.resolveUserName} />
          <ModerationMeter
            result={workspace.moderation}
            warningCount={workspace.warningCount}
            violationCount={workspace.violationCount}
          />
          {workspace.session ? <FileVault sessionId={workspace.session.sessionId} /> : null}
        </div>

        <div className="space-y-6">
          <VideoCallContainer
            sessionId={workspace.session?.sessionId}
            permissionGranted={Boolean(workspace.selfNode?.permissionGranted)}
            participants={workspace.participants}
          />

          <ChatPanel
            participants={workspace.participants}
            selectedRecipientId={workspace.selectedRecipientId}
            setSelectedRecipientId={workspace.setSelectedRecipientId}
            chatKey={workspace.chatKey}
            messages={workspace.messages}
            draftMessage={workspace.draftMessage}
            setDraftMessage={workspace.setDraftMessage}
            connectionState={workspace.connectionState}
            permissionGranted={Boolean(workspace.selfNode?.permissionGranted)}
            moderation={workspace.moderation}
            sendingMedia={workspace.sendingMedia}
            uploadProgress={workspace.uploadProgress}
            uploadError={workspace.uploadError}
            sendMessage={workspace.sendMessage}
            sendMediaMessage={workspace.sendMediaMessage}
            cancelUpload={workspace.cancelUpload}
          />
          {workspace.pendingRequests.length > 0 ? (
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Pending access requests</p>
              <div className="mt-4 space-y-3">
                {workspace.pendingRequests.map((requestNode) => (
                  <div key={requestNode.nodeId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-200">{workspace.resolveUserName(requestNode.userId)}</p>
                    <p className="mt-1 text-xs text-slate-400">User ID: {requestNode.userId}</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="password"
                        value={approvalSecrets[requestNode.nodeId] ?? ''}
                        onChange={(event) =>
                          setApprovalSecrets((current) => ({ ...current, [requestNode.nodeId]: event.target.value }))
                        }
                        placeholder="Enter matching shared secret"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
                      />
                      <button
                        type="button"
                        disabled={approvingNodeId === requestNode.nodeId || !(approvalSecrets[requestNode.nodeId] ?? '').trim()}
                        onClick={() => {
                          const sharedSecret = (approvalSecrets[requestNode.nodeId] ?? '').trim();
                          if (!sharedSecret) {
                            return;
                          }
                          setApprovingNodeId(requestNode.nodeId);
                          void workspace
                            .approvePermission(requestNode.nodeId, sharedSecret)
                            .then(() => {
                              pushToast({
                                title: 'Access approved',
                                message: `${workspace.resolveUserName(requestNode.userId)} can now read and chat.`,
                                type: 'success',
                                durationMs: 2800,
                              });
                            })
                            .catch((requestError: unknown) => {
                              const message =
                                (requestError as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                                'Unable to approve request. Verify shared secret and your branch permissions.';
                              pushToast({
                                title: 'Approval failed',
                                message,
                                type: 'error',
                                durationMs: 3600,
                              });
                            })
                            .finally(() => setApprovingNodeId(''));
                        }}
                        className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        {approvingNodeId === requestNode.nodeId ? 'Approving...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Branch moderation</p>
            <p className="mt-2 text-sm text-slate-300">Remove users in your invited branch. Main host can remove any branch, which also removes its descendants.</p>
            <div className="mt-4 space-y-3">
              {workspace.revocableNodes.length === 0 ? <p className="text-sm text-slate-400">No descendant users to moderate.</p> : null}
              {workspace.revocableNodes.map((node) => (
                <div key={node.nodeId} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-slate-100">{workspace.resolveUserName(node.userId)}</p>
                    <p className="mt-1 text-xs text-slate-400">Node {node.nodeId}</p>
                  </div>
                  <button
                    type="button"
                    disabled={revokingNodeId === node.nodeId}
                    onClick={() => {
                      setRevokingNodeId(node.nodeId);
                      void workspace
                        .revokePermission(node.nodeId)
                        .then(() => {
                          pushToast({
                            title: 'Branch access removed',
                            message: `${workspace.resolveUserName(node.userId)} and descendants were removed from chat access.`,
                            type: 'warning',
                            durationMs: 3200,
                          });
                        })
                        .catch((requestError: unknown) => {
                          const message =
                            (requestError as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                            'Unable to remove this branch. You can only remove users from your own hierarchy.';
                          pushToast({
                            title: 'Remove access failed',
                            message,
                            type: 'error',
                            durationMs: 3600,
                          });
                        })
                        .finally(() => setRevokingNodeId(''));
                    }}
                    className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {revokingNodeId === node.nodeId ? 'Removing...' : 'Remove access'}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 text-sm text-slate-300">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Status</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="text-xs text-slate-400">Connection</p>
                <p className="mt-1 text-sm font-semibold text-white">{workspace.connectionState}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="text-xs text-slate-400">Participants</p>
                <p className="mt-1 text-sm font-semibold text-white">{workspace.participants.length}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="text-xs text-slate-400">Last activity</p>
                <p className="mt-1 text-sm font-semibold text-white">{workspace.lastActivity ? new Date(workspace.lastActivity).toLocaleTimeString() : 'Idle'}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="text-xs text-slate-400">Session expires in</p>
                <p className="mt-1"><SessionExpiryTimer expiryTime={workspace.session?.expiryTime} /></p>
              </div>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  void handleLeaveSession();
                }}
                disabled={leaving || !workspace.selfNode?.nodeId || !workspace.session?.sessionId}
                className="inline-flex items-center rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {leaving ? 'Leaving...' : 'Leave Session'}
              </button>
            </div>
            {workspace.error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{workspace.error}</p> : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
