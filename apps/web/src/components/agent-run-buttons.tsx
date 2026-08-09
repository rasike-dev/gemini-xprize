'use client';

import { useAction } from '@/lib/use-action';

export function ApproveRunButton({ runId }: { runId: string }) {
  const action = useAction();
  const key = `approve:${runId}`;

  return (
    <button
      type="button"
      disabled={action.busy}
      onClick={() =>
        void action.run(key, `/agent-runs/${runId}/approve`, {
          success: 'Approved. Any pending message has been sent.',
        })
      }
      className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
    >
      {action.isPending(key) ? 'Approving…' : 'Approve'}
    </button>
  );
}

export function RetryRunButton({ runId }: { runId: string }) {
  const action = useAction();
  const key = `retry:${runId}`;

  return (
    <button
      type="button"
      disabled={action.busy}
      onClick={() =>
        void action.run(key, `/agent-runs/${runId}/retry`, { success: 'Queued for another try.' })
      }
      className="rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-60"
    >
      {action.isPending(key) ? 'Retrying…' : 'Retry'}
    </button>
  );
}

const AGENT_INPUTS = {
  COMPLIANCE: (invoiceId: string) => ({ invoiceId }),
  SUPPORT: (invoiceId: string) => ({
    invoiceId,
    question: 'What is the current status and what should we do next?',
  }),
} as const;

export function TriggerInvoiceAgents({ invoiceId }: { invoiceId: string }) {
  const action = useAction();

  function trigger(agentType: keyof typeof AGENT_INPUTS) {
    void action.run(`${agentType}:${invoiceId}`, '/agent-runs', {
      body: {
        agentType,
        subjectType: 'invoice',
        subjectId: invoiceId,
        inputJson: AGENT_INPUTS[agentType](invoiceId),
      },
      success: `${agentType === 'COMPLIANCE' ? 'Compliance' : 'Support'} agent queued.`,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(AGENT_INPUTS) as (keyof typeof AGENT_INPUTS)[]).map((agentType) => {
        const key = `${agentType}:${invoiceId}`;
        const label = agentType === 'COMPLIANCE' ? 'Compliance' : 'Support';
        return (
          <button
            key={agentType}
            type="button"
            disabled={action.busy}
            onClick={() => trigger(agentType)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
          >
            {action.isPending(key) ? 'Running…' : `Run ${label}`}
          </button>
        );
      })}
    </div>
  );
}
