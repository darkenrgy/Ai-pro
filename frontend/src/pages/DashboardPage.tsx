import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { sessionService } from '@/services/sessionService';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import type { SessionDto } from '@/types/session';

export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const hasRole = useAuthStore((state) => state.hasRole);
  const pushToast = useToastStore((state) => state.pushToast);
  const [sessionName, setSessionName] = useState('');
  const [description, setDescription] = useState('');
  const [expirationMinutes, setExpirationMinutes] = useState(60);
  const [hostedSessions, setHostedSessions] = useState<SessionDto[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState('');

  const loadHostedSessions = async () => {
    try {
      const response = await sessionService.getHostedSessions();
      setHostedSessions(response.data);
    } catch {
      setHostedSessions([]);
    }
  };

  const loadRecentSessions = async () => {
    try {
      const response = await sessionService.getRecentAccessibleSessions();
      setRecentSessions(response.data);
    } catch {
      setRecentSessions([]);
    }
  };

  useEffect(() => {
    void loadHostedSessions();
    void loadRecentSessions();
  }, []);

  const latestSession = hostedSessions.find((session) => session.active) ?? hostedSessions[0];

  const handleDeleteSession = async (session: SessionDto) => {
    if (deletingSessionId) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${session.active ? 'active' : 'closed'} session "${session.sessionName}"? This permanently removes the session, files, and participant data.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingSessionId(session.sessionId);

    try {
      await sessionService.deleteSession(session.sessionId);
      await loadHostedSessions();
      pushToast({
        title: 'Session deleted',
        message: `${session.sessionName} was removed successfully.`,
        type: 'success',
        durationMs: 3000,
      });
    } catch {
      pushToast({
        title: 'Unable to delete session',
        message: 'Please try again in a moment.',
        type: 'error',
        durationMs: 3000,
      });
    } finally {
      setDeletingSessionId('');
    }
  };

  const handleCreateSession = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await sessionService.createSession({
        sessionName,
        description,
        expirationMinutes,
      });
      navigate(`/session/${response.data.sessionId}`);
    } catch {
      setError('Unable to create the session. Check the server connection and your role.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="Dashboard" subtitle="Create temporary sessions, review access routes, and move into an encrypted workspace.">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Identity</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Welcome, {user?.name}</h2>
            <p className="mt-2 text-sm text-slate-300">{user?.email}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {user?.roles?.map((role) => (
                <span key={role.id} className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                  {role.name}
                </span>
              ))}
            </div>
          </div>

          {hasRole('HOST') && (
            <form onSubmit={handleCreateSession} className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Host tools</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Create a private session</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Session name</label>
                  <input
                    value={sessionName}
                    onChange={(event) => setSessionName(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
                    placeholder="Encrypted discussion room"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Description</label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
                    placeholder="Optional session notes"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Expiration</label>
                  <select
                    value={expirationMinutes}
                    onChange={(event) => setExpirationMinutes(Number(event.target.value))}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
                  >
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={120}>2 hours</option>
                    <option value={480}>8 hours</option>
                  </select>
                </div>
                {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {loading ? 'Creating session...' : 'Create session'}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Participant tools</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Join a session shared by a host</h3>
            <p className="mt-2 text-sm text-slate-300">Use a session ID, QR code, or access image from a host to join the session chain.</p>
            <Link to="/join-session" className="mt-4 inline-flex rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
              Join session
            </Link>

            <div className="mt-5 border-t border-white/10 pt-4">
              <h4 className="text-sm font-semibold text-white">Rejoin recent sessions</h4>
              <p className="mt-1 text-xs text-slate-400">Available only while your permission remains active and host has not removed access.</p>
              <div className="mt-3 space-y-2">
                {recentSessions.length === 0 ? <p className="text-sm text-slate-400">No recent accessible sessions.</p> : null}
                {recentSessions.slice(0, 5).map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    onClick={() => navigate(`/session/${session.sessionId}`)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{session.sessionName}</span>
                      <span className="text-[11px] uppercase tracking-[0.16em] text-emerald-300">Rejoin</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {hasRole('ADMIN') ? (
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Admin overview</p>
              <h3 className="mt-1 text-lg font-semibold text-white">System status</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-xs text-slate-400">Active sessions</p>
                  <p className="mt-1 text-lg font-semibold text-white">{hostedSessions.filter((session) => session.active).length}</p>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-xs text-slate-400">Known participants</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {hostedSessions.filter((session) => session.active).reduce((sum, session) => sum + (session.participantCount ?? 0), 0)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-xs text-slate-400">Moderation backend</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-300">Online</p>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Quick actions</p>
            <div className="mt-4 flex flex-col gap-3">
              <Link to="/join-session" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-white">
                Join with session ID or QR
              </Link>
              {latestSession ? (
                <Link to={`/session/${latestSession.sessionId}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-white">
                  Open latest session
                </Link>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Hosted sessions</p>
            <div className="mt-4 space-y-3">
              {hostedSessions.length === 0 ? <p className="text-sm text-slate-400">No hosted sessions yet.</p> : null}
              {hostedSessions.map((session) => (
                <div key={session.sessionId} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                  <button
                    type="button"
                    onClick={() => navigate(`/session/${session.sessionId}`)}
                    className="w-full text-left transition hover:text-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{session.sessionName}</p>
                        <p className="mt-1 text-xs text-slate-400">{session.participantCount ?? 0} participants</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${session.active ? 'bg-emerald-400/10 text-emerald-300' : 'bg-slate-500/10 text-slate-300'}`}>
                        {session.active ? 'Active' : 'Closed'}
                      </span>
                    </div>
                  </button>

                  <div className="mt-3 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => void handleDeleteSession(session)}
                      disabled={deletingSessionId === session.sessionId}
                      className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      {deletingSessionId === session.sessionId ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
