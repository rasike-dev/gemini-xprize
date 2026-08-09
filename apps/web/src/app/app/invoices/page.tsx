import type { Metadata } from 'next';
import { apiFetchSafe } from '@/lib/api';
import type { CustomerRow, InvoiceRow, TenantProfile } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { InvoicesTable } from '@/components/invoices-table';

export const metadata: Metadata = { title: 'Invoices — LedgerPilot AI' };

export default async function InvoicesPage() {
  const [invoices, customers, tenant] = await Promise.all([
    apiFetchSafe<InvoiceRow[]>('/invoices', []),
    apiFetchSafe<CustomerRow[]>('/customers', []),
    apiFetchSafe<TenantProfile | null>('/tenant', null),
  ]);

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Created from accepted quotes; overdue ones trigger AI reminders."
      />
      <InvoicesTable
        invoices={invoices}
        customers={customers}
        currency={tenant?.currency ?? 'LKR'}
      />
    </div>
  );
}
