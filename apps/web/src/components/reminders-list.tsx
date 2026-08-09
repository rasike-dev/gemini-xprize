'use client';

import { formatMoney } from '@ledgerpilot/shared';
import { useToast } from '@/components/toast';
import { useAction } from '@/lib/use-action';
import type { ReminderRow } from '@/lib/types';

interface DispatchResult {
  sent: boolean;
  channel: 'EMAIL' | 'WHATSAPP' | 'NONE';
  whatsAppLink?: string;
  detail: string;
}

function daysOverdue(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const diff = Date.now() - new Date(dueDate).getTime();
  return diff > 0 ? Math.floor(diff / 864e5) : null;
}

/**
 * AI-drafted payment reminders waiting to go out.
 *
 * Email leaves the server directly. WhatsApp opens a wa.me link so the message
 * comes from the owner's own number, which is both what their customers expect
 * and why this needs no Meta approval.
 */
export function RemindersList({ reminders }: { reminders: ReminderRow[] }) {
  const action = useAction();
  const toast = useToast();

  async function send(reminder: ReminderRow) {
    await action.run(`send:${reminder.id}`, `/reminders/${reminder.id}/send`, {
      onSuccess: (data) => {
        const result = data as DispatchResult;
        if (result?.whatsAppLink) {
          window.open(result.whatsAppLink, '_blank', 'noopener');
          toast.info(result.detail);
        } else {
          toast.success(result?.detail ?? 'Reminder sent.');
        }
      },
    });
  }

  async function openWhatsApp(reminder: ReminderRow) {
    await action.run(
      `wa:${reminder.id}`,
      `/reminders/${reminder.id}/whatsapp-link`,
      {
        method: 'GET',
        refresh: false,
        onSuccess: (data) => {
          const url = (data as { url: string | null })?.url;
          if (!url) {
            toast.error(
              `${reminder.invoice.customer.name} has no phone number. Add one to send on WhatsApp.`,
            );
            return;
          }
          window.open(url, '_blank', 'noopener');
          toast.info('WhatsApp opened. Mark it sent once the message has gone.');
        },
      },
    );
  }

  function markSent(reminder: ReminderRow) {
    void action.run(`mark:${reminder.id}`, `/reminders/${reminder.id}/mark-sent`, {
      success: `Marked as sent. ${reminder.invoice.customer.name} will not be chased again for this.`,
    });
  }

  if (reminders.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400">
        No reminders drafted yet. They appear here once an invoice goes overdue and the payment
        follow-up agent runs.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {reminders.map((reminder) => {
        const invoice = reminder.invoice;
        const outstanding = invoice.totalMinor - invoice.paidMinor;
        const overdue = daysOverdue(invoice.dueDate);
        const pending = !reminder.sentAt;

        return (
          <li
            key={reminder.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{invoice.customer.name}</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {invoice.number} · {formatMoney(outstanding, invoice.currency)} outstanding
                  {overdue ? ` · ${overdue} days overdue` : ''}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  pending ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {pending ? 'Waiting to send' : `Sent ${new Date(reminder.sentAt!).toLocaleDateString()}`}
              </span>
            </div>

            {reminder.subject ? (
              <p className="mt-4 text-sm font-medium text-slate-700">{reminder.subject}</p>
            ) : null}
            <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
              {reminder.message}
            </p>

            {pending ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={action.busy}
                  onClick={() => void send(reminder)}
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
                >
                  {action.isPending(`send:${reminder.id}`) ? 'Sending…' : 'Send'}
                </button>

                {invoice.customer.phone ? (
                  <button
                    type="button"
                    disabled={action.busy}
                    onClick={() => void openWhatsApp(reminder)}
                    className="rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#1da851] disabled:opacity-60"
                  >
                    {action.isPending(`wa:${reminder.id}`) ? 'Opening…' : 'Send on WhatsApp'}
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={action.busy}
                  onClick={() => markSent(reminder)}
                  className="text-sm text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
                >
                  Mark as sent
                </button>
              </div>
            ) : null}

            <p className="mt-3 text-xs text-slate-400">
              Drafted by the payment follow-up agent ·{' '}
              {reminder.tone.toLowerCase().replaceAll('_', ' ')} tone ·{' '}
              {new Date(reminder.createdAt).toLocaleString()}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
