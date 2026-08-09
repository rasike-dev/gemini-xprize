/**
 * Boot-time configuration checks shared by the API and the worker.
 *
 * These exist because the failure modes they catch are silent. The AI layer falls
 * back to deterministic mocks when no credentials are present, so a production
 * deploy that forgot GEMINI_API_KEY looks completely healthy while quietly
 * serving fabricated quotes and reminders to paying customers.
 */
export function assertAiConfigIsSafe(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const hasVertex = !!process.env.VERTEX_PROJECT_ID;

  if (!hasGeminiKey && !hasVertex) {
    throw new Error(
      'No AI credentials configured. Set GEMINI_API_KEY or VERTEX_PROJECT_ID. ' +
        'Without them every agent silently returns mock output, which would look ' +
        'like success while sending fabricated figures to customers.',
    );
  }
}

/** Payments must be fully configured before we can take money. */
export function assertBillingConfigIsSafe(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = ['PAYHERE_MERCHANT_ID', 'PAYHERE_MERCHANT_SECRET', 'PAYHERE_NOTIFY_URL'].filter(
    (key) => !process.env[key],
  );

  // A warning rather than a hard failure: the app is still usable for trials
  // while a PayHere merchant application is being reviewed.
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[startup] PayHere is not fully configured (missing ${missing.join(', ')}). ` +
        'Customers can use their trial but cannot subscribe.',
    );
  }
  if (process.env.PAYHERE_SANDBOX !== 'false') {
    // eslint-disable-next-line no-console
    console.warn('[startup] PAYHERE_SANDBOX is not "false"; live payments will NOT be taken.');
  }

  // On PLUS we ask PayHere to charge cards on a schedule, so we must also be able
  // to stop it. Without these credentials a cancellation would go through on our
  // side while PayHere kept billing the customer.
  if (
    process.env.PAYHERE_MERCHANT_PLAN === 'PLUS' &&
    !(process.env.PAYHERE_APP_ID && process.env.PAYHERE_APP_SECRET)
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      '[startup] PAYHERE_MERCHANT_PLAN=PLUS but PAYHERE_APP_ID / PAYHERE_APP_SECRET are missing. ' +
        'Recurring charges cannot be cancelled or retried through the API.',
    );
  }
}
