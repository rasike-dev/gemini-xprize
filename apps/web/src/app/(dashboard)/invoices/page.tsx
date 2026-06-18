import { formatMoney } from '@ledgerpilot/shared';
import { apiFetchSafe } from '@/lib/api';
import { Badge, Card, PageHeader } from '@/components/ui';
import { TriggerInvoiceAgents } from '@/components/agent-run-buttons';

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

interface AgentRun {
  id: string;
  agentType: string;
  status: string;
  subjectId: string | null;
  outputJson?: unknown;
}

export default async function InvoicesPage() {
  const [invoices, runs] = await Promise.all([
    apiFetchSafe<Invoice[]>('/invoices', []),
    apiFetchSafe<AgentRun[]>('/agent-runs', []),
  ]);

  const byInvoice = new Map(
    runs.filter((r) => r.subjectId).map((r) => [`${r.agentType}:${r.subjectId}`, r] as const),
  );

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
              <th className="px-5 py-3">Agent Actions</th>
              <th className="px-5 py-3">Compliance</th>
              <th className="px-5 py-3">Support</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.length === 0 ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={9}>
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
                  <td className="px-5 py-3">
                    <TriggerInvoiceAgents invoiceId={inv.id} />
                  </td>
                  <td className="max-w-xs px-5 py-3 text-xs text-slate-500">
                    {(() => {
                      const run = byInvoice.get(`COMPLIANCE:${inv.id}`);
                      if (!run) return '-';
                      return `${run.status}`;
                    })()}
                  </td>
                  <td className="max-w-xs px-5 py-3 text-xs text-slate-500">
                    {(() => {
                      const run = byInvoice.get(`SUPPORT:${inv.id}`);
                      if (!run) return '-';
                      const text =
                        typeof run.outputJson === 'object' &&
                        run.outputJson != null &&
                        'response' in (run.outputJson as Record<string, unknown>)
                          ? String((run.outputJson as Record<string, unknown>).response)
                          : run.status;
                      return text.slice(0, 120);
                    })()}
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
