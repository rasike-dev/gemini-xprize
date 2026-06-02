import { apiFetchSafe } from '@/lib/api';
import { Badge, Card, PageHeader } from '@/components/ui';

interface AgentRun {
  id: string;
  agentType: string;
  status: string;
  decision: string | null;
  confidence: number | null;
  geminiModel: string | null;
  tokensUsed: number;
  costEstimate: number;
  humanApproved: boolean;
  createdAt: string;
}

export default async function AgentsPage() {
  const runs = await apiFetchSafe<AgentRun[]>('/agent-runs', []);
  const totalTokens = runs.reduce((a, r) => a + r.tokensUsed, 0);
  const totalCost = runs.reduce((a, r) => a + r.costEstimate, 0);

  return (
    <div>
      <PageHeader
        title="AI Agent Log"
        subtitle="Every AI decision is auditable: input, decision, confidence, model, tokens, cost, and approval."
      />

      <div className="mb-4 flex gap-6 text-sm text-slate-500">
        <span>{runs.length} runs</span>
        <span>{totalTokens.toLocaleString()} tokens</span>
        <span>${totalCost.toFixed(4)} estimated cost</span>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Agent</th>
              <th className="px-5 py-3">Decision</th>
              <th className="px-5 py-3">Confidence</th>
              <th className="px-5 py-3">Model</th>
              <th className="px-5 py-3">Tokens</th>
              <th className="px-5 py-3">Cost</th>
              <th className="px-5 py-3">Approved</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.length === 0 ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={8}>
                  No agent runs yet.
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {r.agentType.replaceAll('_', ' ')}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{r.decision ?? '-'}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '-'}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{r.geminiModel ?? '-'}</td>
                  <td className="px-5 py-3 text-slate-500">{r.tokensUsed.toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-500">${r.costEstimate.toFixed(5)}</td>
                  <td className="px-5 py-3 text-slate-500">{r.humanApproved ? 'Yes' : '-'}</td>
                  <td className="px-5 py-3">
                    <Badge status={r.status} />
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
