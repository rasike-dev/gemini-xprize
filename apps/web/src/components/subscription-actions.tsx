'use client';

import { Button } from '@/components/form';
import { useToast } from '@/components/toast';
import { useAction } from '@/lib/use-action';

/** Undoes a scheduled cancellation while the paid period is still running. */
export function ResumeSubscriptionButton() {
  const action = useAction();

  return (
    <Button
      variant="secondary"
      pending={action.isPending('resume')}
      onClick={() =>
        void action.run('resume', '/billing/resume', {
          success: 'Your subscription will carry on as normal.',
        })
      }
    >
      Keep my subscription
    </Button>
  );
}

/**
 * Asks the gateway to retry a failed recurring charge. Cheaper for the customer
 * than re-entering card details, and a card that failed once often works later.
 */
export function RetryPaymentButton() {
  const action = useAction();
  const toast = useToast();

  // The endpoint answers 200 whether or not the gateway accepted the retry, so
  // the outcome comes from the body rather than the status.
  function report(data: unknown) {
    const result = data as { ok?: boolean; message?: string } | null;
    const message = result?.message ?? 'We have asked for the payment to be retried.';
    if (result?.ok) toast.success(message);
    else toast.error(message);
  }

  return (
    <Button
      variant="secondary"
      pending={action.isPending('retry')}
      onClick={() => void action.run('retry', '/billing/retry-payment', { onSuccess: report })}
    >
      Try the payment again
    </Button>
  );
}
