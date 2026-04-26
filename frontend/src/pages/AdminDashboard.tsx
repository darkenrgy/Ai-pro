import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { sessionService } from '@/services/sessionService';
import { useAuthStore } from '@/store/authStore';

interface SystemStats {
  activeSessions: number;
  totalParticipants: number;
  systemHealth: 'online' | 'degraded' | 'offline';
}

export function AdminDashboard() {
  const user = useAuthStore((state) => state.user);
  const [stats, setStats] = useState<SystemStats>({
    activeSessions: 0,
    totalParticipants: 0,
    systemHealth: 'online',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await sessionService.getHostedSessions();
        const sessions = response.data;
        const activeSessions = sessions.filter((session) => session.active);

        setStats({
          activeSessions: activeSessions.length,
          totalParticipants: activeSessions.reduce((sum, s) => sum + (s.participantCount ?? 0), 0),
          systemHealth: 'online',
        });
      } catch {
        setStats((prev) => ({ ...prev, systemHealth: 'degraded' }));
      } finally {
        setLoading(false);
      }
    };

    void loadStats();
  }, []);

  return (
    <AppShell
      title="Administration"
      subtitle="System monitoring, security audit logs, and role management for privacy-first infrastructure."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">System</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Active sessions</h3>
          <p className="mt-3 text-4xl font-bold text-white">{stats.activeSessions}</p>
          <p className="mt-2 text-xs text-slate-400">Live encrypted workspaces</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Users</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Total participants</h3>
          <p className="mt-3 text-4xl font-bold text-white">{stats.totalParticipants}</p>
          <p className="mt-2 text-xs text-slate-400">All connected users</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Infrastructure</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Backend status</h3>
          <p className={`mt-3 text-lg font-bold ${stats.systemHealth === 'online' ? 'text-emerald-400' : stats.systemHealth === 'degraded' ? 'text-amber-400' : 'text-rose-400'}`}>
            {stats.systemHealth.charAt(0).toUpperCase() + stats.systemHealth.slice(1)}
          </p>
          <p className="mt-2 text-xs text-slate-400">WebSocket + STOMP broker</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Security</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Access control</h3>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-200">✓ JWT authentication</p>
              <p className="mt-1 text-xs text-emerald-100/70">All WebSocket and REST endpoints protected</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-200">✓ End-to-end encryption</p>
              <p className="mt-1 text-xs text-emerald-100/70">Client-side AES-GCM with session-derived keys</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-200">✓ Role-based access</p>
              <p className="mt-1 text-xs text-emerald-100/70">ADMIN, HOST, and PARTICIPANT permission levels</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Admin</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Account information</h3>
          <div className="mt-4 space-y-2">
            <div>
              <p className="text-xs text-slate-400">Name</p>
              <p className="mt-1 font-medium text-white">{user?.name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Email</p>
              <p className="mt-1 font-medium text-white">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Roles</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {user?.roles?.map((role) => (
                  <span key={role.id} className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                    {role.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading && <p className="mt-6 text-sm text-slate-300">Loading system status...</p>}
    </AppShell>
  );
}
