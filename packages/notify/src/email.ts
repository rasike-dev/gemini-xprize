/**
 * Transactional email via the Resend HTTP API.
 *
 * Shared by the API (quote and invoice sends) and the worker (reminders and
 * summaries) so both use the same sender, templates, and failure behaviour.
 */

import { BRAND_EMAIL_FROM } from '@ledgerpilot/shared';

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always sent, as the fallback part. */
  text: string;
  /** Optional HTML body. */
  html?: string;
  replyTo?: string;
}

export interface SendResult {
  sent: boolean;
  /** True when there was no API key and the message was only logged. */
  simulated: boolean;
  id?: string;
}

function senderAddress(): string {
  return process.env.EMAIL_FROM ?? BRAND_EMAIL_FROM;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  // Local development has no key; log rather than fail so the whole flow is
  // still exercisable end to end.
  if (!apiKey) {
    console.log(
      `[email:dev] to=${message.to} subject="${message.subject}"\n${message.text}`,
    );
    return { sent: false, simulated: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: senderAddress(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { id?: string };
  return { sent: true, simulated: false, id: body.id };
}
