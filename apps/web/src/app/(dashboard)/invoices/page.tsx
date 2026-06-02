import { formatMoney } from '@ledgerpilot/shared';
import { apiFetchSafe } from '@/lib/api';
import { Badge, Card, PageHeader } from '@/components/ui';

interface Invoice {
  id: string;
  number: string;
  status: string;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  dueDate: string | null;
  customer: { name: string };
}

export default async function InvoicesPage() {
  const invoices = await apiFetchSafe<Invoice[]>('/invoices', []);

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Created from accepted quotes; overdue ones trigger AI reminders." />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Number</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Outstanding</th>
              <th className="px-5 py-3">Due</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.length === 0 ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={6}>
                  No invoices yet.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{inv.number}</td>
                  <td className="px-5 py-3 text-slate-600">{inv.customer?.name}</td>
                  <td className="px-5 py-3 text-slate-800">
                    {formatMoney(inv.totalMinor, inv.currency)}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {formatMoney(inv.totalMinor - inv.paidMinor, inv.currency)}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-5 py-3">
                    <Badge status={inv.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
