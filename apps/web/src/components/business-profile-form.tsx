'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input, Select } from '@/components/form';
import { lpCall } from '@/lib/client';

const CURRENCIES = ['LKR', 'USD', 'EUR', 'GBP', 'AUD'];

const COUNTRIES = [
  { code: 'LK', label: 'Sri Lanka' },
  { code: 'IN', label: 'India' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'SG', label: 'Singapore' },
];

/**
 * Onboarding step 2. Writes the business profile onto the tenant that was
 * provisioned when the Clerk organization was created, then sends the owner into
 * the app.
 */
export function BusinessProfileForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await lpCall('/tenant', {
      method: 'PATCH',
      body: {
        name: String(form.get('name') ?? '').trim(),
        currency: String(form.get('currency') ?? 'LKR'),
        countryCode: String(form.get('countryCode') ?? 'LK'),
        vatNumber: String(form.get('vatNumber') ?? '').trim() || null,
      },
    });

    if (!result.ok) {
      setError(result.error ?? 'Could not save your business details.');
      setPending(false);
      return;
    }

    router.push('/app');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <Field label="Business name" required hint="Shown on the quotes and invoices you send.">
        <Input name="name" required maxLength={120} placeholder="PrintPro Lanka (Pvt) Ltd" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Currency" required>
          <Select name="currency" defaultValue="LKR">
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Country" required>
          <Select name="countryCode" defaultValue="LK">
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
        hint="Optional. Needed for VAT-compliant invoices and the compliance agent."
      >
        <Input name="vatNumber" maxLength={40} placeholder="134567890-7000" />
      </Field>

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <Button type="submit" pending={pending} className="w-full">
        Finish setup
      </Button>
    </form>
  );
}
