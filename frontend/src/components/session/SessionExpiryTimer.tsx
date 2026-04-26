import { useEffect, useMemo, useState } from 'react';

interface SessionExpiryTimerProps {
  expiryTime?: string;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) {
    return 'Expired';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export function SessionExpiryTimer({ expiryTime }: SessionExpiryTimerProps) {
  const expiryMs = useMemo(() => (expiryTime ? new Date(expiryTime).getTime() : null), [expiryTime]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiryMs) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [expiryMs]);

  if (!expiryMs) {
    return <span className="text-sm text-slate-400">No expiry set</span>;
  }

  const remaining = expiryMs - now;
  const soon = remaining > 0 && remaining < 5 * 60 * 1000;

  return <span className={soon ? 'text-sm font-semibold text-amber-300' : 'text-sm font-semibold text-white'}>{formatRemaining(remaining)}</span>;
}
