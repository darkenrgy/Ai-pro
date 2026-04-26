import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 text-slate-100">
      <div className="max-w-lg rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center shadow-glow backdrop-blur-xl">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-cyan-300">404</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">The route you requested does not exist in the secure workspace.</p>
        <Link to="/dashboard" className="mt-6 inline-flex rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
