import type { Metadata } from 'next';
import { apiFetchSafe } from '@/lib/api';
import type { CustomerRow } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { CustomersTable } from '@/components/customers-table';

export const metadata: Metadata = { title: 'Customers — LedgerPilot AI' };

export default async function CustomersPage() {
  const customers = await apiFetchSafe<CustomerRow[]>('/customers', []);

  return (
    <div>
      <PageHeader title="Customers" subtitle="People and businesses you work with." />
      <CustomersTable customers={customers} />
    </div>
  );
}
