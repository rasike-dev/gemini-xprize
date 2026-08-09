'use client';

import { useState } from 'react';
import { Button, Modal } from '@/components/form';
import { useAction } from '@/lib/use-action';

export function CancelSubscriptionButton({
  periodEnd,
  onTrial,
  autoRenews = false,
}: {
  periodEnd: string | null;
  onTrial: boolean;
  /** True when the gateway would otherwise charge again on its own. */
  autoRenews?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = useAction();

  const until = periodEnd
    ? new Date(periodEnd).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  async function confirm() {
    const ok = await action.run('cancel', '/billing/cancel', {
      success: onTrial
        ? 'Your trial has been cancelled.'
        : `Cancelled. You keep full access until ${until ?? 'the end of your paid period'}.`,
    });
    if (ok) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-slate-400 underline transition hover:text-slate-600"
      >
        Cancel subscription
      </button>

      {open ? (
        <Modal title="Cancel your subscription" onClose={() => setOpen(false)}>
          <div className="space-y-4 text-sm leading-relaxed text-slate-600">
            {onTrial ? (
              <p>
                You are on a free trial, so there is nothing to refund. Cancelling now ends the trial
                and your account becomes read-only.
              </p>
            ) : (
              <p>
                You keep full access until{' '}
                <strong className="text-slate-900">{until ?? 'the end of your paid period'}</strong>,
                which you have already paid for. After that your account becomes read-only so you can
                still view and export your records.
              </p>
            )}
            {autoRenews ? (
              <p>We will stop the automatic renewal, so your card will not be charged again.</p>
            ) : null}
            <p>Nothing is deleted, and you can subscribe again at any time.</p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep my subscription
            </Button>
            <Button
              variant="danger"
              pending={action.isPending('cancel')}
              onClick={() => void confirm()}
            >
              Cancel subscription
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
