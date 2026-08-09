import { formatMoney } from '@ledgerpilot/shared';
import { apiFetch } from '@/lib/api';
import { Badge, Card, PageHeader, StatCard } from '@/components/ui';

interface Summary {
  salesTodayMinor: number;
  revenueThisMonthMinor: number;
  overdueMinor: number;
  pendingInvoices: number;
  aiActionsThisMonth: number;
  customerCount: number;
}

interface AgentRun {
  id: string;
  agentType: string;
  status: string;
  decision: string | null;
  confidence: number | null;
  geminiModel: string | null;
  createdAt: string;
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function DashboardPage() {
  const [summary, runs] = await Promise.all([
    safe(apiFetch<Summary>('/dashboard/summary'), {
      salesTodayMinor: 0,
      revenueThisMonthMinor: 0,
      overdueMinor: 0,
      pendingInvoices: 0,
      aiActionsThisMonth: 0,
      customerCount: 0,
    }),
    safe(apiFetch<AgentRun[]>('/agent-runs'), []),
  ]);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your business at a glance, kept current by AI agents." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Revenue this month" value={formatMoney(summary.revenueThisMonthMinor)} />
        <StatCard label="Collected today" value={formatMoney(summary.salesTodayMinor)} />
        <StatCard
          label="Overdue"
          value={formatMoney(summary.overdueMinor)}
          hint={`${summary.pendingInvoices} pending invoice(s)`}
        />
        <StatCard label="AI actions this month" value={String(summary.aiActionsThisMonth)} />
        <StatCard label="Customers" value={String(summary.customerCount)} />
        <StatCard label="Pending invoices" value={String(summary.pendingInvoices)} />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-800">Recent AI activity</h2>
      <Card>
        <div className="divide-y divide-slate-100">
          {runs.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">
              No agent runs yet. Send an inquiry to the intake webhook to see agents work.
            </p>
          ) : (
            runs.slice(0, 8).map((run) => (
              <div key={run.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {run.agentType.replaceAll('_', ' ')} agent
                  </p>
                  <p className="text-xs text-slate-400">
                    {run.decision ?? '-'} · {run.geminiModel ?? 'n/a'} ·{' '}
                    {run.confidence != null ? `${Math.round(run.confidence * 100)}% conf` : ''}
                  </p>
                </div>
                <Badge status={run.status} />
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
