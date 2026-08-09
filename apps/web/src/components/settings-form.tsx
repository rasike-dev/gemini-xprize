'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input, Select } from '@/components/form';
import { useToast } from '@/components/toast';
import { UPGRADE_REQUIRED, lpCall } from '@/lib/client';
import type { TenantProfile } from '@/lib/types';

const CURRENCIES = ['LKR', 'USD', 'EUR', 'GBP', 'AUD'];

const COUNTRIES = [
  { code: 'LK', label: 'Sri Lanka' },
  { code: 'IN', label: 'India' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'SG', label: 'Singapore' },
];

export function SettingsForm({
  tenant,
  autoSendAvailable,
  planName,
}: {
  tenant: TenantProfile;
  autoSendAvailable: boolean;
  planName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [autoSend, setAutoSend] = useState(tenant.autoSend);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await lpCall('/tenant', {
      method: 'PATCH',
      body: {
        name: String(form.get('name') ?? '').trim(),
        currency: String(form.get('currency') ?? tenant.currency),
        countryCode: String(form.get('countryCode') ?? tenant.countryCode),
        vatNumber: String(form.get('vatNumber') ?? '').trim() || null,
        autoSend,
      },
    });

    setPending(false);

    if (!result.ok) {
      if (result.status === UPGRADE_REQUIRED) {
        toast.upgrade(result.error ?? 'That setting needs a different plan.');
        setAutoSend(tenant.autoSend);
      } else {
        toast.error(result.error ?? 'Could not save your settings.');
      }
      return;
    }

    toast.success('Settings saved.');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Business profile</h2>
        <p className="mt-1 text-sm text-slate-500">
          These details appear on the quotes and invoices you send.
        </p>

        <div className="mt-6 space-y-5">
          <Field label="Business name" required>
            <Input name="name" required maxLength={120} defaultValue={tenant.name} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Currency" hint="Used for all new quotes and invoices.">
              <Select name="currency" defaultValue={tenant.currency}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Country">
              <Select name="countryCode" defaultValue={tenant.countryCode}>
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="VAT / TIN number"
            hint="Printed on invoices and used by the compliance agent."
          >
            <Input name="vatNumber" maxLength={40} defaultValue={tenant.vatNumber ?? ''} />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">How much the AI does on its own</h2>
        <p className="mt-1 text-sm text-slate-500">
          By default every message waits for you to approve it.
        </p>

        <label className="mt-6 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={autoSend}
            disabled={!autoSendAvailable}
            onChange={(event) => setAutoSend(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30 disabled:opacity-40"
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              Send payment reminders automatically
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              Reminders go out by email without waiting for you. Anything the AI is unsure about still
              waits for your approval, whatever this is set to.
            </span>
            {!autoSendAvailable ? (
              <span className="mt-2 block text-sm text-amber-700">
                Not included in the {planName} plan.{' '}
                <Link href="/app/billing" className="font-semibold underline">
                  See plans
                </Link>
              </span>
            ) : null}
          </span>
        </label>
      </section>

      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
