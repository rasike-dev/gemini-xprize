import type { Metadata } from 'next';
import { apiFetchSafe } from '@/lib/api';
import type { ReminderRow } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { RemindersList } from '@/components/reminders-list';

export const metadata: Metadata = { title: 'Reminders — LedgerPilot AI' };

export default async function RemindersPage() {
  const reminders = await apiFetchSafe<ReminderRow[]>('/reminders', []);
  const waiting = reminders.filter((reminder) => !reminder.sentAt).length;

  return (
    <div>
      <PageHeader
        title="Payment reminders"
        subtitle="Drafted by AI from your overdue invoices. Read it, then send by email or WhatsApp."
      />

      {waiting > 0 ? (
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {waiting} {waiting === 1 ? 'reminder is' : 'reminders are'} waiting to go out.
        </p>
      ) : null}

      <RemindersList reminders={reminders} />
    </div>
  );
}
