'use client';

import { useState } from 'react';
import { Button, Field, Input, Modal, Textarea } from '@/components/form';
import { useAction } from '@/lib/use-action';
import type { CustomerRow } from '@/lib/types';

/**
 * Create or edit a customer. Phone matters more than email here: WhatsApp is how
 * most Sri Lankan SMBs actually reach their customers.
 */
export function CustomerFormModal({
  customer,
  onClose,
}: {
  customer?: CustomerRow;
  onClose: () => void;
}) {
  const action = useAction();
  const editing = !!customer;
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const notes = String(form.get('notes') ?? '').trim();

    if (!phone && !email) {
      setError('Add a phone number or an email address, otherwise we cannot contact them.');
      return;
    }

    const ok = await action.run(
      'save',
      editing ? `/customers/${customer.id}` : '/customers',
      {
        method: editing ? 'PATCH' : 'POST',
        // PATCH accepts null to clear a field; POST omits empty optional fields.
        body: editing
          ? { name, phone: phone || null, email: email || null, notes: notes || null }
          : {
              name,
              ...(phone ? { phone } : {}),
              ...(email ? { email } : {}),
              ...(notes ? { notes } : {}),
            },
        success: editing ? 'Customer updated.' : `${name} added.`,
      },
    );

    if (ok) onClose();
  }

  return (
    <Modal title={editing ? `Edit ${customer.name}` : 'Add a customer'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Name" required>
          <Input name="name" required maxLength={200} defaultValue={customer?.name} autoFocus />
        </Field>

        <Field label="Phone" hint="Include the country code so WhatsApp links work.">
          <Input name="phone" maxLength={40} defaultValue={customer?.phone ?? ''} placeholder="+94771234567" />
        </Field>

        <Field label="Email" hint="Quotes and reminders are emailed here when present.">
          <Input name="email" type="email" maxLength={200} defaultValue={customer?.email ?? ''} />
        </Field>

        <Field label="Notes">
          <Textarea name="notes" rows={3} maxLength={2000} defaultValue={customer?.notes ?? ''} />
        </Field>

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" pending={action.isPending('save')}>
            {editing ? 'Save changes' : 'Add customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
