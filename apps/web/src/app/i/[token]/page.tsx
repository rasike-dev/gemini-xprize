import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { formatMoney } from '@ledgerpilot/shared';
import { API_URL } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Your invoice',
  // A share link should never end up in a search index.
  robots: { index: false, follow: false },
};

interface PublicInvoice {
  number: string;
  status: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  dueDate: string | null;
  notes: string | null;
  pdfUrl: string | null;
  customer: { name: string };
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    totalMinor: number;
  }[];
}

async function fetchInvoice(token: string): Promise<PublicInvoice | null> {
  try {
    const res = await fetch(`${API_URL}/api/public/invoices/${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicInvoice;
  } catch {
    return null;
  }
}

/**
 * The customer-facing invoice view. No login: the share token in the URL is the
 * only credential, which is why the API rate-limits this route hard.
 */
export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invoice = await fetchInvoice(token);
  if (!invoice) notFound();

  const outstanding = invoice.totalMinor - invoice.paidMinor;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{invoice.number}</h1>
            <p className="mt-1 text-sm text-slate-500">For {invoice.customer.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Amount due</p>
            <p className="text-2xl font-semibold text-slate-900">
              {formatMoney(outstanding, invoice.currency)}
            </p>
            {invoice.dueDate ? (
              <p className="mt-1 text-sm text-slate-500">
                Due {new Date(invoice.dueDate).toLocaleDateString()}
              </p>
            ) : null}
          </div>
        </div>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-3 pr-4 text-slate-700">{line.description}</td>
                <td className="py-3 text-right text-slate-600">{line.quantity}</td>
                <td className="py-3 text-right text-slate-600">
                  {formatMoney(line.unitPriceMinor, invoice.currency)}
                </td>
                <td className="py-3 text-right text-slate-800">
                  {formatMoney(line.totalMinor, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-6 space-y-1.5 border-t border-slate-200 pt-4 text-sm">
          <div className="flex justify-between text-slate-500">
            <dt>Subtotal</dt>
            <dd>{formatMoney(invoice.subtotalMinor, invoice.currency)}</dd>
          </div>
          <div className="flex justify-between text-slate-500">
            <dt>Tax</dt>
            <dd>{formatMoney(invoice.taxMinor, invoice.currency)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-slate-900">
            <dt>Total</dt>
            <dd>{formatMoney(invoice.totalMinor, invoice.currency)}</dd>
          </div>
          {invoice.paidMinor > 0 ? (
            <div className="flex justify-between text-emerald-700">
              <dt>Already paid</dt>
              <dd>{formatMoney(invoice.paidMinor, invoice.currency)}</dd>
            </div>
          ) : null}
        </dl>

        {invoice.notes ? (
          <p className="mt-6 whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {invoice.notes}
          </p>
        ) : null}

        {invoice.pdfUrl ? (
          <a
            href={invoice.pdfUrl}
            className="mt-6 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
          >
            Download PDF
          </a>
        ) : null}
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-slate-400">
        Sent with BizOpsMate AI. Reply to the message this link came from if anything looks wrong.
      </p>
    </main>
  );
}
