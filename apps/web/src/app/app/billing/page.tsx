import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PLAN_ORDER,
  PlanTier,
  SubscriptionStatus,
  formatMoney,
  formatPlanPrice,
} from '@ledgerpilot/shared';
import { apiFetchSafe } from '@/lib/api';
import type { SubscriptionSummary, TenantProfile } from '@/lib/types';
import { Card, PageHeader } from '@/components/ui';
import { UsageBar } from '@/components/usage-bar';
import { UpgradeButton } from '@/components/upgrade-button';
import { CancelSubscriptionButton } from '@/components/cancel-subscription-button';
import { ResumeSubscriptionButton, RetryPaymentButton } from '@/components/subscription-actions';

export const metadata: Metadata = { title: 'Billing & plan — LedgerPilot AI' };

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  [SubscriptionStatus.TRIALING]: { label: 'Free trial', tone: 'bg-sky-100 text-sky-700' },
  [SubscriptionStatus.ACTIVE]: { label: 'Active', tone: 'bg-emerald-100 text-emerald-700' },
  [SubscriptionStatus.PAST_DUE]: { label: 'Payment needed', tone: 'bg-rose-100 text-rose-700' },
  [SubscriptionStatus.CANCELED]: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-600' },
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;

  const [subscription, tenant] = await Promise.all([
    apiFetchSafe<SubscriptionSummary | null>('/billing/subscription', null),
    apiFetchSafe<TenantProfile | null>('/tenant', null),
  ]);

  if (!subscription) {
    return (
      <div>
        <PageHeader title="Billing & plan" />
        <Card className="p-6">
          <p className="text-sm text-slate-500">
            We could not load your subscription just now. Please refresh, and if it keeps happening
            get in touch.
          </p>
        </Card>
      </div>
    );
  }

  const status = STATUS_COPY[subscription.status] ?? {
    label: subscription.status,
    tone: 'bg-slate-100 text-slate-600',
  };
  const { usage } = subscription;
  const onTrial = subscription.status === SubscriptionStatus.TRIALING;
  const pastDue = subscription.status === SubscriptionStatus.PAST_DUE;

  return (
    <div>
      <PageHeader
        title="Billing & plan"
        subtitle="Your subscription, what you have used, and your payment history."
      />

      {/* PayHere sends the browser back here; the notify callback is what actually
          grants access, and it can land a moment later. */}
      {payment === 'complete' ? (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-sm font-medium text-emerald-900">Thank you — your payment went through.</p>
          <p className="mt-1 text-sm text-emerald-800">
            Your plan updates as soon as PayHere confirms it, usually within a few seconds. Refresh
            this page if the details below still look old.
          </p>
        </div>
      ) : null}

      {payment === 'cancelled' ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm text-amber-900">
            The payment was cancelled and you have not been charged.
          </p>
        </div>
      ) : null}

      {!subscription.active && subscription.reason ? (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4">
          <p className="text-sm font-medium text-rose-900">{subscription.reason}</p>
          <p className="mt-1 text-sm text-rose-800">
            You can still view and export everything. Choose a plan below to start working again.
          </p>
          {/* A failed recurring charge is usually a temporary card problem, so
              offer the cheap fix before asking for card details again. */}
          {pastDue && subscription.nextBillingAt !== undefined ? (
            <div className="mt-3">
              <RetryPaymentButton />
            </div>
          ) : null}
        </div>
      ) : null}

      {subscription.cancelAtPeriodEnd && subscription.active ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm text-amber-900">
            Your subscription ends on{' '}
            <strong>{formatDate(subscription.currentPeriodEnd)}</strong>. Nothing more will be
            charged, and you keep full access until then.
          </p>
          <ResumeSubscriptionButton />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {subscription.plan.name} plan
                </h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>
                  {status.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {formatPlanPrice(subscription.plan.monthlyPriceMinor)} per month
              </p>
            </div>

            {subscription.status !== SubscriptionStatus.CANCELED &&
            subscription.active &&
            !subscription.cancelAtPeriodEnd ? (
              <CancelSubscriptionButton
                periodEnd={subscription.currentPeriodEnd}
                onTrial={onTrial}
                autoRenews={subscription.autoRenews}
              />
            ) : null}
          </div>

          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            {onTrial ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Trial ends</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">
                  {formatDate(subscription.trialEndsAt)}
                  {subscription.trialDaysRemaining != null ? (
                    <span
                      className={`ml-2 text-sm font-normal ${
                        subscription.trialDaysRemaining <= 3 ? 'text-rose-600' : 'text-slate-500'
                      }`}
                    >
                      {subscription.trialDaysRemaining === 0
                        ? 'today'
                        : `${subscription.trialDaysRemaining} day${subscription.trialDaysRemaining === 1 ? '' : 's'} left`}
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Paid until</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">
                  {formatDate(subscription.currentPeriodEnd)}
                </dd>
              </div>
            )}

            {subscription.autoRenews ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Renews on</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">
                  {formatDate(subscription.nextBillingAt)}
                  <span className="ml-2 text-sm font-normal text-slate-500">automatically</span>
                </dd>
              </div>
            ) : null}

            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Usage period began</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {formatDate(usage.periodStart)}
              </dd>
            </div>
          </dl>

          <div className="mt-8 space-y-5 border-t border-slate-100 pt-6">
            <h3 className="text-sm font-semibold text-slate-900">This period</h3>
            <UsageBar label="AI actions" used={usage.agentRuns} limit={usage.agentRunsLimit} />
            <UsageBar label="Customers" used={usage.customers} limit={usage.customersLimit} />
            <UsageBar label="Team members" used={usage.users} limit={usage.usersLimit} />
            <UsageBar
              label="AI tokens"
              used={usage.tokensUsed}
              limit={usage.tokenBudget}
              hint="Refreshes at the start of each period."
            />
          </div>
        </Card>

        <div className="space-y-6">
          {PLAN_ORDER.filter((tier) => tier !== subscription.plan.tier || !subscription.active).map(
            (tier) => {
              const plan = subscription.availablePlans.find((p) => p.tier === tier);
              if (!plan) return null;
              const isCurrent = tier === subscription.plan.tier;

              return (
                <Card key={tier} className="p-6">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                    <span className="text-sm text-slate-500">
                      {formatPlanPrice(plan.monthlyPriceMinor)}/mo
                    </span>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600">
                    {plan.highlights.slice(0, 5).map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden className="text-brand">
                          &#10003;
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5">
                    <UpgradeButton
                      plan={tier}
                      planName={plan.name}
                      label={isCurrent ? `Renew ${plan.name}` : `Switch to ${plan.name}`}
                      variant={tier === PlanTier.GROWTH ? 'primary' : 'secondary'}
                      defaults={{ name: tenant?.name }}
                    />
                  </div>
                </Card>
              );
            },
          )}

          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-900">Questions about billing?</h3>
            <p className="mt-2 text-sm text-slate-500">
              Read our <Link href="/refund-policy" className="text-brand underline">refund policy</Link>{' '}
              or get in touch and we will sort it out.
            </p>
          </Card>
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold text-slate-800">Payment history</h2>
      <Card>
        {subscription.payments.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">
            No payments yet. Nothing is charged during your free trial.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3">Reference</th>
                <th className="px-5 py-3">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscription.payments.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-3 text-slate-600">{formatDate(row.paidAt)}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{row.plan}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {row.interval === 'ANNUAL' ? 'Annual' : 'Monthly'}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-400">{row.orderId}</td>
                  <td className="px-5 py-3 text-slate-800">
                    {formatMoney(row.amountMinor, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
