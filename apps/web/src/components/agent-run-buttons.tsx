'use client';

import { useState } from 'react';

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export function ApproveRunButton({ runId }: { runId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      await postJson(`/api/agent-runs/${runId}/approve`);
      window.location.reload();
    } catch (e) {
      setError((e as Error).message.slice(0, 100));
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => void onClick()}
        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
      >
        {loading ? 'Approving...' : 'Approve'}
      </button>
      {error ? <span className="text-[11px] text-rose-600">{error}</span> : null}
    </div>
  );
}

export function RetryRunButton({ runId }: { runId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      await postJson(`/api/agent-runs/${runId}/retry`);
      window.location.reload();
    } catch (e) {
      setError((e as Error).message.slice(0, 100));
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => void onClick()}
        className="rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
      >
        {loading ? 'Retrying...' : 'Retry'}
      </button>
      {error ? <span className="text-[11px] text-rose-600">{error}</span> : null}
    </div>
  );
}

export function TriggerInvoiceAgents({ invoiceId }: { invoiceId: string }) {
  const [busy, setBusy] = useState<'COMPLIANCE' | 'SUPPORT' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger(agentType: 'COMPLIANCE' | 'SUPPORT') {
    setBusy(agentType);
    setError(null);
    try {
      await postJson('/api/agent-runs/trigger', {
        agentType,
        subjectType: 'invoice',
        subjectId: invoiceId,
        inputJson:
          agentType === 'COMPLIANCE'
            ? { invoiceId }
            : {
                invoiceId,
                question: 'What is the current status and what should we do next?',
              },
      });
      window.location.reload();
    } catch (e) {
      setError((e as Error).message.slice(0, 100));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void trigger('COMPLIANCE')}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-60"
      >
        {busy === 'COMPLIANCE' ? 'Running...' : 'Run Compliance'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void trigger('SUPPORT')}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-60"
      >
        {busy === 'SUPPORT' ? 'Running...' : 'Run Support'}
      </button>
      {error ? <span className="text-[11px] text-rose-600">{error}</span> : null}
    </div>
  );
}
