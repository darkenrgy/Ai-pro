import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [selectedRole, setSelectedRole] = useState<'HOST' | 'ADMIN'>('HOST');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canUseAdminLogin = useMemo(
    () => String(import.meta.env.VITE_ENABLE_ADMIN_LOGIN).toLowerCase() === 'true',
    []
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await authService.loginWithResponse({ email, password, rememberMe });
      const payload = response.data;
      const hasSelectedRole = payload.roles.some((role) => role.name === selectedRole);

      if (!hasSelectedRole) {
        setError(`This account does not have ${selectedRole} access.`);
        return;
      }

      setAuth(
        {
          id: payload.userId,
          name: payload.username,
          email: payload.email,
          roles: payload.roles,
        },
        payload.accessToken,
        payload.refreshToken ?? null,
        rememberMe
      );
      navigate('/dashboard');
    } catch {
      setError('Unable to sign in. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-glow backdrop-blur-xl">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-cyan-300">AI-PRO</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Secure Login</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">Use your registered credentials to enter the protected workspace.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">Username</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
              placeholder="name@company.com"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 pr-12 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
                placeholder="••••••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400 focus:ring-cyan-400/50"
            />
            Keep me signed in
          </label>
          <div>
            <p className="mb-2 block text-sm font-medium text-slate-200">Select Role</p>
            <div className="flex items-center gap-6 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="login-role"
                  value="HOST"
                  checked={selectedRole === 'HOST'}
                  onChange={() => setSelectedRole('HOST')}
                  className="h-4 w-4 border-white/20 bg-slate-900 text-cyan-400 focus:ring-cyan-400/50"
                />
                User
              </label>
              {canUseAdminLogin ? (
                <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="radio"
                    name="login-role"
                    value="ADMIN"
                    checked={selectedRole === 'ADMIN'}
                    onChange={() => setSelectedRole('ADMIN')}
                    className="h-4 w-4 border-white/20 bg-slate-900 text-cyan-400 focus:ring-cyan-400/50"
                  />
                  Admin
                </label>
              ) : null}
            </div>
            {!canUseAdminLogin ? (
              <p className="mt-2 text-xs text-slate-400">Admin login is restricted to developer mode.</p>
            ) : null}
          </div>
          {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          Don't have account?{' '}
          <Link to="/register" className="font-medium text-cyan-300 hover:text-cyan-200">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
