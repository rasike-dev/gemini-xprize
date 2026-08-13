import type { Metadata } from 'next';
import { apiFetchSafe } from '@/lib/api';
import type { CustomerRow, QuoteRow, TenantProfile } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { QuotesTable } from '@/components/quotes-table';

export const metadata: Metadata = { title: 'Quotes — BizOpsMate AI' };

export default async function QuotesPage() {
  const [quotes, customers, tenant] = await Promise.all([
    apiFetchSafe<QuoteRow[]>('/quotes', []),
    apiFetchSafe<CustomerRow[]>('/customers', []),
    apiFetchSafe<TenantProfile | null>('/tenant', null),
  ]);

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="AI drafts these from inquiries; you approve before sending."
      />
      <QuotesTable
        quotes={quotes}
        customers={customers}
        currency={tenant?.currency ?? 'LKR'}
      />
    </div>
  );
}
