import Link from 'next/link';
import { PLAN_ORDER, PLANS, PlanTier, TRIAL_DAYS, formatPlanPrice } from '@ledgerpilot/shared';

/**
 * Renders straight from the shared plan catalogue, so advertised limits can
 * never drift from the limits the API enforces.
 */
export function PricingTable({ ctaHref = '/sign-up' }: { ctaHref?: string }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {PLAN_ORDER.map((tier) => {
        const plan = PLANS[tier];
        const recommended = tier === PlanTier.GROWTH;

        return (
          <div
            key={tier}
            className={`relative flex flex-col rounded-2xl border bg-white p-8 ${
              recommended ? 'border-brand shadow-md' : 'border-slate-200 shadow-sm'
            }`}
          >
            {recommended ? (
              <span className="absolute -top-3 left-8 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </span>
            ) : null}

            <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
            <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-slate-500">{plan.blurb}</p>

            <div className="mt-6">
              <span className="text-3xl font-semibold text-slate-900">
                {formatPlanPrice(plan.monthlyPriceMinor)}
              </span>
              <span className="text-sm text-slate-500"> / month</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              or {formatPlanPrice(plan.annualPriceMinor)} per year — two months free
            </p>

            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-600">
              {plan.highlights.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span aria-hidden className="mt-0.5 font-semibold text-brand">
                    &#10003;
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Link
              href={ctaHref}
              className={`mt-8 rounded-lg px-5 py-3 text-center text-sm font-semibold transition ${
                recommended
                  ? 'bg-brand text-white hover:bg-brand-dark'
                  : 'border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              Start {TRIAL_DAYS}-day free trial
            </Link>
          </div>
        );
      })}
    </div>
  );
}
