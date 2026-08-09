'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import type { TenantIntegration } from '@/lib/types';

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [revealed, setRevealed] = useState(!secret);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <div className="flex items-center gap-3">
          {secret ? (
            <button
              type="button"
              onClick={() => setRevealed((current) => !current)}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void copy()}
            className="text-xs text-brand underline hover:text-brand-dark"
          >
            Copy
          </button>
        </div>
      </div>
      <p className="mt-1.5 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
        {revealed ? value : '•'.repeat(48)}
      </p>
    </div>
  );
}

/**
 * The tenant's inbound webhook details, for wiring up WhatsApp or email
 * forwarding. The signing secret is unique to this business, so a leak here
 * cannot be used against anyone else's account.
 */
export function IntegrationDetails({ integration }: { integration: TenantIntegration }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-900">Inbound message webhook</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        Point your WhatsApp or email forwarding here and LedgerPilot will read new inquiries
        automatically. Sign the request body with HMAC-SHA256 using the secret below and send the
        hex digest in the <code className="rounded bg-slate-100 px-1">x-ledgerpilot-signature</code>{' '}
        header.
      </p>

      <div className="mt-6 space-y-5">
        <CopyRow label="Endpoint" value={integration.intakeUrl || 'Set PUBLIC_API_URL on the API'} />
        <CopyRow label="x-ledgerpilot-org header" value={integration.orgHeader} />
        <CopyRow label="Signing secret" value={integration.signingSecret} secret />
      </div>

      <p className="mt-5 text-xs text-slate-400">
        Treat the signing secret like a password. Anyone holding it can post inquiries into this
        business.
      </p>
    </section>
  );
}
