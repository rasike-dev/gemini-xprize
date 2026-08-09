'use client';

import { useState } from 'react';
import {
  BillingInterval,
  PlanTier,
  PAYHERE_LITE_MAX_PAYMENT_MINOR,
  formatPlanPrice,
  priceMinorFor,
} from '@ledgerpilot/shared';
import { Button, Field, Input, Modal } from '@/components/form';
import { useToast } from '@/components/toast';
import { lpCall } from '@/lib/client';

interface CheckoutForm {
  action: string;
  fields: Record<string, string>;
  orderId: string;
  amountFormatted: string;
}

/**
 * Hands the browser off to PayHere.
 *
 * PayHere's checkout expects a form POST, and the signing hash must be computed
 * server-side with the merchant secret, so we ask the API for the exact fields to
 * post and then submit them from a form built here. The customer never sees our
 * secret and we never trust the browser with the amount.
 */
function submitToPayHere(checkout: CheckoutForm) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = checkout.action;

  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

export function UpgradeButton({
  plan,
  planName,
  label = 'Upgrade',
  variant = 'primary',
  defaults,
}: {
  plan: PlanTier;
  planName: string;
  label?: string;
  variant?: 'primary' | 'secondary';
  defaults?: { name?: string; email?: string; phone?: string };
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>(BillingInterval.MONTHLY);
  const toast = useToast();

  const amountMinor = priceMinorFor(plan, interval);
  // PayHere's LITE tier caps a single payment, so annual is not always offerable.
  const annualBlocked = priceMinorFor(plan, BillingInterval.ANNUAL) > PAYHERE_LITE_MAX_PAYMENT_MINOR;

  async function startCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get('name') ?? '').trim();
    const [firstName, ...rest] = fullName.split(/\s+/);

    const origin = window.location.origin;
    const result = await lpCall<CheckoutForm>('/billing/payhere/checkout', {
      method: 'POST',
      body: {
        plan,
        interval,
        returnUrl: `${origin}/app/billing?payment=complete`,
        cancelUrl: `${origin}/app/billing?payment=cancelled`,
        customer: {
          firstName: firstName || 'Customer',
          lastName: rest.join(' ') || '-',
          email: String(form.get('email') ?? '').trim(),
          phone: String(form.get('phone') ?? '').trim(),
        },
      },
    });

    if (!result.ok || !result.data) {
      toast.error(result.error ?? 'Could not start the payment.');
      setPending(false);
      return;
    }

    submitToPayHere(result.data);
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>

      {open ? (
        <Modal title={`Subscribe to ${planName}`} onClose={() => setOpen(false)}>
          <form onSubmit={startCheckout} className="space-y-5">
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Billing period</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {[BillingInterval.MONTHLY, BillingInterval.ANNUAL].map((option) => {
                  const disabled = option === BillingInterval.ANNUAL && annualBlocked;
                  const selected = interval === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={disabled}
                      onClick={() => setInterval(option)}
                      className={`rounded-lg border px-4 py-3 text-left transition ${
                        selected
                          ? 'border-brand bg-brand/5'
                          : 'border-slate-300 hover:border-slate-400'
                      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                    >
                      <span className="block text-sm font-semibold text-slate-900">
                        {option === BillingInterval.ANNUAL ? 'Annual' : 'Monthly'}
                      </span>
                      <span className="block text-sm text-slate-500">
                        {formatPlanPrice(priceMinorFor(plan, option))}
                      </span>
                      {option === BillingInterval.ANNUAL ? (
                        <span className="mt-1 block text-xs text-brand">
                          {disabled ? 'Not available for this plan' : 'Two months free'}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <Field label="Your name" required>
              <Input name="name" required defaultValue={defaults?.name} placeholder="Nuwan Perera" />
            </Field>

            <Field label="Email" required hint="Your receipt is sent here.">
              <Input name="email" type="email" required defaultValue={defaults?.email} />
            </Field>

            <Field label="Phone" required hint="Required by PayHere for card verification.">
              <Input name="phone" required defaultValue={defaults?.phone} placeholder="+94771234567" />
            </Field>

            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              You will pay <strong className="text-slate-900">{formatPlanPrice(amountMinor)}</strong>{' '}
              now, and this covers{' '}
              {interval === BillingInterval.ANNUAL ? '12 months' : '1 month'} of the {planName} plan.
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" pending={pending}>
                Continue to PayHere
              </Button>
            </div>

            <p className="text-xs text-slate-400">
              You will be taken to PayHere to enter your card details. We never see or store your
              card number.
            </p>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
