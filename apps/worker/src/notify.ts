/** Transactional email via Resend HTTP API. Falls back to console in dev. */
export async function sendEmail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'LedgerPilot AI <onboarding@resend.dev>';

  if (!apiKey) {
    console.log(`[email:dev] to=${opts.to} subject="${opts.subject}"\n${opts.text}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to: opts.to, subject: opts.subject, text: opts.text }),
  });
  if (!res.ok) {
    throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  }
}
