'use client';

import { useState } from 'react';
import { QuoteStatus, formatMoney } from '@ledgerpilot/shared';
import { Badge } from '@/components/ui';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/form';
import {
  LineItemsEditor,
  emptyLine,
  toLinePayload,
  type DraftLine,
} from '@/components/line-items-editor';
import { useToast } from '@/components/toast';
import { useAction } from '@/lib/use-action';
import type { CustomerRow, QuoteRow } from '@/lib/types';

interface SendResponse {
  detail?: string;
  whatsAppLink?: string | null;
}

function NewQuoteModal({
  customers,
  currency,
  onClose,
}: {
  customers: CustomerRow[];
  currency: string;
  onClose: () => void;
}) {
  const action = useAction();
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const payload = toLinePayload(lines);
    if (payload.length === 0) {
      setError('Add at least one line with a description and a price.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const validUntil = String(form.get('validUntil') ?? '');

    const ok = await action.run('create', '/quotes', {
      body: {
        customerId: String(form.get('customerId') ?? ''),
        currency,
        lines: payload,
        // The API expects an ISO datetime; the date input gives a plain date.
        ...(validUntil ? { validUntil: new Date(`${validUntil}T23:59:59Z`).toISOString() } : {}),
        ...(String(form.get('notes') ?? '').trim()
          ? { notes: String(form.get('notes')).trim() }
          : {}),
      },
      success: 'Quote created as a draft.',
    });

    if (ok) onClose();
  }

  return (
    <Modal title="New quote" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Customer" required>
          <Select name="customerId" required defaultValue="">
            <option value="" disabled>
              Choose a customer
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="text-sm font-medium text-slate-700">Line items</span>
          <div className="mt-2">
            <LineItemsEditor lines={lines} onChange={setLines} currency={currency} />
          </div>
        </div>

        <Field label="Valid until">
          <Input type="date" name="validUntil" />
        </Field>

        <Field label="Notes" hint="Shown to the customer on the quote.">
          <Textarea name="notes" rows={2} maxLength={2000} />
        </Field>

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" pending={action.isPending('create')}>
            Create quote
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function QuotesTable({
  quotes,
  customers,
  currency,
}: {
  quotes: QuoteRow[];
  customers: CustomerRow[];
  currency: string;
}) {
  const [creating, setCreating] = useState(false);
  const action = useAction();
  const toast = useToast();

  async function send(quote: QuoteRow) {
    await action.run(`send:${quote.id}`, `/quotes/${quote.id}/send`, {
      onSuccess: (data) => {
        const response = data as SendResponse;
        if (response?.whatsAppLink) {
          // Opened straight away: the click that triggered this is the user
          // gesture the browser needs to allow it.
          window.open(response.whatsAppLink, '_blank', 'noopener');
        }
        toast.success(response?.detail ?? `Quote ${quote.number} sent.`);
      },
    });
  }

  function accept(quote: QuoteRow) {
    void action.run(`accept:${quote.id}`, `/quotes/${quote.id}/accept`, {
      success: `Accepted. An invoice has been raised from ${quote.number}.`,
    });
  }

  function reject(quote: QuoteRow) {
    void action.run(`reject:${quote.id}`, `/quotes/${quote.id}/reject`, {
      success: `${quote.number} marked as rejected.`,
    });
  }

  function remove(quote: QuoteRow) {
    if (!window.confirm(`Delete draft ${quote.number}?`)) return;
    void action.run(`delete:${quote.id}`, `/quotes/${quote.id}`, {
      method: 'DELETE',
      success: `${quote.number} deleted.`,
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)} disabled={customers.length === 0}>
          New quote
        </Button>
      </div>

      {customers.length === 0 ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add a customer first, then you can quote them.
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Number</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotes.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-center text-slate-400" colSpan={5}>
                  No quotes yet. The AI drafts these from inquiries, or you can create one.
                </td>
              </tr>
            ) : (
              quotes.map((quote) => {
                const isDraft = quote.status === QuoteStatus.DRAFT;
                const isSent = quote.status === QuoteStatus.SENT;

                return (
                  <tr key={quote.id}>
                    <td className="px-5 py-3 font-medium text-slate-800">{quote.number}</td>
                    <td className="px-5 py-3 text-slate-600">{quote.customer?.name}</td>
                    <td className="px-5 py-3 text-slate-800">
                      {formatMoney(quote.totalMinor, quote.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge status={quote.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {isDraft || isSent ? (
                          <button
                            type="button"
                            disabled={action.busy}
                            onClick={() => void send(quote)}
                            className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
                          >
                            {action.isPending(`send:${quote.id}`)
                              ? 'Sending…'
                              : isSent
                                ? 'Resend'
                                : 'Send'}
                          </button>
                        ) : null}

                        {isSent ? (
                          <>
                            <button
                              type="button"
                              disabled={action.busy}
                              onClick={() => accept(quote)}
                              className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {action.isPending(`accept:${quote.id}`) ? 'Accepting…' : 'Accepted'}
                            </button>
                            <button
                              type="button"
                              disabled={action.busy}
                              onClick={() => reject(quote)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                            >
                              Rejected
                            </button>
                          </>
                        ) : null}

                        {isDraft ? (
                          <button
                            type="button"
                            disabled={action.busy}
                            onClick={() => remove(quote)}
                            className="text-xs font-medium text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {creating ? (
        <NewQuoteModal
          customers={customers}
          currency={currency}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </>
  );
}
