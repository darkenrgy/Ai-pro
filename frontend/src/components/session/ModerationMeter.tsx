import type { ModerationResult } from '@/types/chat';

interface ModerationMeterProps {
  result: ModerationResult | null;
  warningCount: number;
  violationCount: number;
}

export function ModerationMeter({ result, warningCount, violationCount }: ModerationMeterProps) {
  const riskLabel = result ? Math.round(result.riskScore) : 0;

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Moderation</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Local warning engine</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
          {riskLabel}/100 risk
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white/5 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Warnings</p>
          <p className="mt-1 text-xl font-semibold text-amber-300">{warningCount}</p>
        </div>
        <div className="rounded-2xl bg-white/5 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Blocks</p>
          <p className="mt-1 text-xl font-semibold text-rose-300">{violationCount}</p>
        </div>
        <div className="rounded-2xl bg-white/5 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">State</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">
            {result?.blocked ? 'Blocked' : result?.warning ? 'Caution' : 'Clear'}
          </p>
        </div>
      </div>
      {result ? (
        <div className="mt-4 space-y-2 text-sm text-slate-300">
          <p>Category: {result.category}</p>
          <p>Action: {result.action}</p>
          <p>Session block: {result.blockSession ? 'Yes' : 'No'}</p>
          <p>Language: {result.detectedLanguage}</p>
          {result.matchedKeywords.length > 0 ? <p>Keywords: {result.matchedKeywords.join(', ')}</p> : null}
          {result.matchedPatterns.length > 0 ? <p>Patterns: {result.matchedPatterns.join(', ')}</p> : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-400">Type a draft to activate the on-device moderation model.</p>
      )}
    </div>
  );
}
