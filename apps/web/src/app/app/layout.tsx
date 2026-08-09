import Link from 'next/link';
import { ReactNode } from 'react';
import { SubscriptionStatus } from '@ledgerpilot/shared';
import { Sidebar } from '@/components/sidebar';
import { apiFetchSafe } from '@/lib/api';
import type { SubscriptionSummary } from '@/lib/types';
import { clerkEnabled } from '@/lib/config';

/**
 * Persistent banner for anything the owner needs to act on: a trial running out,
 * or a lapsed subscription. Shown above every page because a customer who has
 * lost access should not have to visit the billing page to find out why.
 */
function SubscriptionBanner({ subscription }: { subscription: SubscriptionSummary | null }) {
  if (!subscription) return null;

  if (!subscription.active) {
    return (
      <div className="border-b border-rose-200 bg-rose-50 px-8 py-3">
        <p className="text-sm text-rose-900">
          {subscription.reason ?? 'Your subscription is not active.'}{' '}
          <Link href="/app/billing" className="font-semibold underline">
            Choose a plan
          </Link>
        </p>
      </div>
    );
  }

  const daysLeft = subscription.trialDaysRemaining;
  if (subscription.status === SubscriptionStatus.TRIALING && daysLeft != null && daysLeft <= 5) {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-8 py-3">
        <p className="text-sm text-amber-900">
          {daysLeft === 0
            ? 'Your free trial ends today.'
            : `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`}{' '}
          <Link href="/app/billing" className="font-semibold underline">
            Choose a plan to keep going
          </Link>
        </p>
      </div>
    );
  }

  return null;
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const subscription = await apiFetchSafe<SubscriptionSummary | null>(
    '/billing/subscription',
    null,
  );

  let accountControls: ReactNode = <span className="text-xs text-slate-400">dev mode (no Clerk)</span>;
  if (clerkEnabled) {
    const { OrganizationSwitcher, UserButton } = await import('@clerk/nextjs');
    accountControls = (
      <div className="flex items-center gap-4">
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/app"
          afterCreateOrganizationUrl="/onboarding"
        />
        <UserButton afterSignOutUrl="/" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-slate-200 bg-white px-8 py-3">
          {accountControls}
        </header>
        <SubscriptionBanner subscription={subscription} />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
