import { formatMoney } from '@ledgerpilot/shared';
import { apiFetchSafe } from '@/lib/api';
import { Badge, Card, PageHeader } from '@/components/ui';

interface Quote {
  id: string;
  number: string;
  status: string;
  currency: string;
  totalMinor: number;
  customer: { name: string };
  createdAt: string;
}

export default async function QuotesPage() {
  const quotes = await apiFetchSafe<Quote[]>('/quotes', []);

  return (
    <div>
      <PageHeader title="Quotes" subtitle="AI drafts these from inquiries; you approve before sending." />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Number</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotes.length === 0 ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={4}>
                  No quotes yet.
                </td>
              </tr>
            ) : (
              quotes.map((q) => (
                <tr key={q.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{q.number}</td>
                  <td className="px-5 py-3 text-slate-600">{q.customer?.name}</td>
                  <td className="px-5 py-3 text-slate-800">{formatMoney(q.totalMinor, q.currency)}</td>
                  <td className="px-5 py-3">
                    <Badge status={q.status} />
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
