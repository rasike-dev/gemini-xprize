import { isUnlimited } from '@ledgerpilot/shared';

/**
 * Usage against a plan limit. Turns amber near the limit and rose at it, so the
 * customer sees an upgrade coming rather than hitting a wall unannounced.
 */
export function UsageBar({
  label,
  used,
  limit,
  hint,
}: {
  label: string;
  used: number;
  limit: number;
  hint?: string;
}) {
  const unlimited = isUnlimited(limit);
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  const barColor = unlimited
    ? 'bg-brand'
    : pct >= 100
      ? 'bg-rose-500'
      : pct >= 80
        ? 'bg-amber-500'
        : 'bg-brand';

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-sm text-slate-500">
          {used.toLocaleString('en-US')}
          {unlimited ? '' : ` / ${limit.toLocaleString('en-US')}`}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: unlimited ? '12%' : `${Math.max(2, pct)}%` }}
        />
      </div>

      {hint ? <p className="mt-1.5 text-xs text-slate-400">{hint}</p> : null}
      {!unlimited && pct >= 80 ? (
        <p className={`mt-1.5 text-xs ${pct >= 100 ? 'text-rose-600' : 'text-amber-600'}`}>
          {pct >= 100 ? 'Limit reached — upgrade to carry on.' : `${100 - pct}% of your allowance left.`}
        </p>
      ) : null}
    </div>
  );
}
