import { Link } from 'react-router-dom';

const features = [
  'Role-based access with JWT-backed auth',
  'Client-side encrypted chat with STOMP',
  'Secure PNG access flow and QR entry',
  'Private file vault with compression support',
  'On-device moderation with warning thresholds',
];

export function LandingPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl items-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-glow backdrop-blur-xl sm:p-10">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-cyan-300">AI-PRO Secure Mesh</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Privacy-first communication for high-trust teams.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            A privacy-first platform for encrypted chat, temporary sessions, secure access images, and self-hosted moderation.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
              Sign in
            </Link>
            <Link to="/register" className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white">
              Create account
            </Link>
            <Link to="/dashboard" className="rounded-full border border-white/10 bg-transparent px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/5 hover:text-white">
              Open dashboard
            </Link>
          </div>
        </section>

        <aside className="rounded-[2rem] border border-cyan-400/20 bg-slate-950/80 p-8 shadow-glow">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Capabilities</p>
          <div className="mt-6 space-y-4">
            {features.map((feature) => (
              <div key={feature} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-200">
                {feature}
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/15 to-amber-300/10 p-5 text-sm text-slate-300">
            Server-side JWT, Redis-backed temporary state, and secure image validation are already available on the backend.
          </div>
        </aside>
      </div>
    </div>
  );
}
