import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { BRAND_LOGO_DATA_URI } from '@/assets/brandBase64';

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function AppShell({ title, subtitle, children, actions }: AppShellProps) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="min-h-screen text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              src={BRAND_LOGO_DATA_URI}
              alt="Dark Enrgy logo"
              className="h-10 w-10 rounded-full border border-white/20 object-cover shadow-[0_0_0_2px_rgba(15,23,42,0.8)]"
            />
            <div>
              <Link to="/dashboard" className="text-lg font-semibold tracking-tight text-white">
                AI-PRO Secure Mesh
              </Link>
              <p className="text-sm text-slate-400">Privacy-first communication workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-white">{user.name}</p>
                <p className="text-xs text-slate-400">{user.roles[0]?.name ?? 'Member'}</p>
              </div>
            ) : null}
            {actions}
            {user ? (
              <Link
                to="/settings"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white"
              >
                Settings
              </Link>
            ) : null}
            {user ? (
              <button
                onClick={handleLogout}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-6 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
              {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">{subtitle}</p> : null}
            </div>
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}
