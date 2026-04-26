import { useEffect } from 'react';
import { useToastStore } from '@/store/toastStore';

const toneClasses: Record<string, string> = {
  success: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100',
  error: 'border-rose-400/30 bg-rose-500/15 text-rose-100',
  warning: 'border-amber-400/30 bg-amber-500/15 text-amber-100',
  info: 'border-cyan-400/30 bg-cyan-500/15 text-cyan-100',
};

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  useEffect(() => {
    if (toasts.length === 0) {
      return undefined;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        removeToast(toast.id);
      }, toast.durationMs)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts, removeToast]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 mx-auto flex max-w-xl flex-col gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur ${toneClasses[toast.type] ?? toneClasses.info}`}
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.message ? <p className="mt-1 text-xs opacity-90">{toast.message}</p> : null}
        </div>
      ))}
    </div>
  );
}
