'use client';

import { useState } from 'react';
import { InvoiceStatus, formatMoney } from '@ledgerpilot/shared';
import { Badge } from '@/components/ui';
import { Button, Field, Input, Modal, Select } from '@/components/form';
import {
  LineItemsEditor,
  emptyLine,
  toLinePayload,
  type DraftLine,
} from '@/components/line-items-editor';
import { TriggerInvoiceAgents } from '@/components/agent-run-buttons';
import { useToast } from '@/components/toast';
import { useAction } from '@/lib/use-action';
import type { CustomerRow, InvoiceRow } from '@/lib/types';

const PAYMENT_METHODS = ['Bank transfer', 'Cash', 'Cheque', 'Card', 'Other'];

function RecordPaymentModal({ invoice, onClose }: { invoice: InvoiceRow; onClose: () => void }) {
  const action = useAction();
  const outstanding = invoice.totalMinor - invoice.paidMinor;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));

    const ok = await action.run('pay', `/invoices/${invoice.id}/payments`, {
      body: {
        amountMinor: Math.round(amount * 100),
        method: String(form.get('method') ?? 'Bank transfer'),
        ...(String(form.get('reference') ?? '').trim()
          ? { reference: String(form.get('reference')).trim() }
          : {}),
      },
      success: `${formatMoney(Math.round(amount * 100), invoice.currency)} recorded against ${invoice.number}.`,
    });

    if (ok) onClose();
  }

  return (
    <Modal title={`Record a payment on ${invoice.number}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-5">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {formatMoney(outstanding, invoice.currency)} outstanding of{' '}
          {formatMoney(invoice.totalMinor, invoice.currency)}.
        </p>

        <Field label={`Amount received (${invoice.currency})`} required>
          <Input
            name="amount"
            type="number"
            min="0.01"
            max={(outstanding / 100).toFixed(2)}
            step="0.01"
            defaultValue={(outstanding / 100).toFixed(2)}
            required
            autoFocus
          />
        </Field>

        <Field label="Method">
          <Select name="method" defaultValue="Bank transfer">
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reference" hint="Slip number, cheque number or anything you want on record.">
          <Input name="reference" maxLength={200} />
        </Field>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" pending={action.isPending('pay')}>
            Record payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function NewInvoiceModal({
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
    const dueDate = String(form.get('dueDate') ?? '');

    const ok = await action.run('create', '/invoices', {
      body: {
        customerId: String(form.get('customerId') ?? ''),
        currency,
        lines: payload,
        ...(dueDate ? { dueDate: new Date(`${dueDate}T23:59:59Z`).toISOString() } : {}),
      },
      success: 'Invoice created.',
    });

    if (ok) onClose();
  }

  return (
    <Modal title="New invoice" onClose={onClose}>
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

        <Field label="Due date" hint="Defaults to 14 days from today.">
          <Input type="date" name="dueDate" />
        </Field>

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" pending={action.isPending('create')}>
            Create invoice
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function InvoicesTable({
  invoices,
  customers,
  currency,
}: {
  invoices: InvoiceRow[];
  customers: CustomerRow[];
  currency: string;
}) {
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const action = useAction();
  const toast = useToast();

  function voidInvoice(invoice: InvoiceRow) {
    if (!window.confirm(`Void ${invoice.number}? It will no longer be chased for payment.`)) return;
    void action.run(`void:${invoice.id}`, `/invoices/${invoice.id}/void`, {
      success: `${invoice.number} voided.`,
    });
  }

  async function copyShareLink(invoice: InvoiceRow) {
    const url = `${window.location.origin}/i/${invoice.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Customer link copied. Paste it into WhatsApp or email.');
    } catch {
      toast.error('Could not copy the link.');
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)} disabled={customers.length === 0}>
          New invoice
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Number</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Outstanding</th>
              <th className="px-5 py-3">Due</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Chase</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-center text-slate-400" colSpan={8}>
                  No invoices yet. Accept a quote or raise one directly.
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => {
                const outstanding = invoice.totalMinor - invoice.paidMinor;
                const settled =
                  invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.VOID;

                return (
                  <tr key={invoice.id}>
                    <td className="px-5 py-3 font-medium text-slate-800">{invoice.number}</td>
                    <td className="px-5 py-3 text-slate-600">{invoice.customer?.name}</td>
                    <td className="px-5 py-3 text-slate-800">
                      {formatMoney(invoice.totalMinor, invoice.currency)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {formatMoney(outstanding, invoice.currency)}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Badge status={invoice.status} />
                    </td>
                    <td className="px-5 py-3">
                      {settled ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <TriggerInvoiceAgents invoiceId={invoice.id} />
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {!settled ? (
                          <button
                            type="button"
                            onClick={() => setPaying(invoice)}
                            className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-emerald-700"
                          >
                            Record payment
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => void copyShareLink(invoice)}
                          className="text-xs font-medium text-brand underline hover:text-brand-dark"
                        >
                          Copy link
                        </button>

                        {invoice.pdfUrl ? (
                          <a
                            href={invoice.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-brand underline hover:text-brand-dark"
                          >
                            PDF
                          </a>
                        ) : null}

                        {invoice.paidMinor === 0 && invoice.status !== InvoiceStatus.VOID ? (
                          <button
                            type="button"
                            disabled={action.busy}
                            onClick={() => voidInvoice(invoice)}
                            className="text-xs font-medium text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
                          >
                            Void
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
        <NewInvoiceModal
          customers={customers}
          currency={currency}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {paying ? <RecordPaymentModal invoice={paying} onClose={() => setPaying(null)} /> : null}
    </>
  );
}
