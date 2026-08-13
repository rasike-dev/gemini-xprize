import type { Metadata } from 'next';
import { apiFetchSafe } from '@/lib/api';
import type { SubscriptionSummary, TenantIntegration, TenantProfile } from '@/lib/types';
import { Card, PageHeader } from '@/components/ui';
import { SettingsForm } from '@/components/settings-form';
import { IntegrationDetails } from '@/components/integration-details';

export const metadata: Metadata = { title: 'Settings — BizOpsMate AI' };

export default async function SettingsPage() {
  const [tenant, subscription, integration] = await Promise.all([
    apiFetchSafe<TenantProfile | null>('/tenant', null),
    apiFetchSafe<SubscriptionSummary | null>('/billing/subscription', null),
    apiFetchSafe<TenantIntegration | null>('/tenant/integration', null),
  ]);

  if (!tenant) {
    return (
      <div>
        <PageHeader title="Settings" />
        <Card className="p-6">
          <p className="text-sm text-slate-500">
            We could not load your business profile. Please refresh and try again.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="Your business details, how invoices are presented, and how much the AI does on its own."
      />

      <SettingsForm
        tenant={tenant}
        autoSendAvailable={subscription?.plan.features.autoSend ?? false}
        planName={subscription?.plan.name ?? 'your'}
      />

      {integration ? (
        <div className="mt-8">
          <IntegrationDetails integration={integration} />
        </div>
      ) : null}
    </div>
  );
}
