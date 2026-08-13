/**
 * HTML email templates.
 *
 * Written as inline-styled tables on purpose: email clients, and Outlook in
 * particular, do not support modern CSS layout. Everything the AI generated is
 * escaped before interpolation.
 */

import { formatMoney, BRAND_NAME } from '@ledgerpilot/shared';

const BRAND = '#0f766e';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Turns a plain-text body into escaped HTML paragraphs. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${TEXT};">${escapeHtml(
          block,
        ).replaceAll('\n', '<br />')}</p>`,
    )
    .join('');
}

interface LayoutOptions {
  businessName: string;
  heading?: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerNote?: string;
}

function layout({ businessName, heading, bodyHtml, cta, footerNote }: LayoutOptions): string {
  const safeName = escapeHtml(businessName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(heading ?? safeName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:24px 32px;border-bottom:1px solid ${BORDER};">
        <span style="font-size:16px;font-weight:700;color:${TEXT};">${safeName}</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        ${heading ? `<h1 style="margin:0 0 20px;font-size:20px;font-weight:600;color:${TEXT};">${escapeHtml(heading)}</h1>` : ''}
        ${bodyHtml}
        ${
          cta
            ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
                 <tr><td style="border-radius:8px;background-color:${BRAND};">
                   <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
                 </td></tr>
               </table>`
            : ''
        }
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;border-top:1px solid ${BORDER};background-color:#f8fafc;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
          ${footerNote ? `${escapeHtml(footerNote)}<br />` : ''}
          Sent by ${safeName} using ${BRAND_NAME}.
        </p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** Payment reminder for an overdue invoice. */
export function reminderEmail(input: {
  businessName: string;
  message: string;
  invoiceNumber: string;
  outstandingMinor: number;
  currency: string;
  dueDate?: Date | null;
  invoiceUrl?: string;
}): { html: string; text: string } {
  const amount = formatMoney(input.outstandingMinor, input.currency);
  const due = input.dueDate ? input.dueDate.toDateString() : null;

  const summary = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid ${BORDER};border-radius:8px;">
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid ${BORDER};font-size:13px;color:${MUTED};">Invoice</td>
      <td style="padding:14px 16px;border-bottom:1px solid ${BORDER};font-size:13px;font-weight:600;color:${TEXT};text-align:right;">${escapeHtml(input.invoiceNumber)}</td>
    </tr>
    <tr>
      <td style="padding:14px 16px;${due ? `border-bottom:1px solid ${BORDER};` : ''}font-size:13px;color:${MUTED};">Amount outstanding</td>
      <td style="padding:14px 16px;${due ? `border-bottom:1px solid ${BORDER};` : ''}font-size:13px;font-weight:600;color:${TEXT};text-align:right;">${escapeHtml(amount)}</td>
    </tr>
    ${
      due
        ? `<tr>
             <td style="padding:14px 16px;font-size:13px;color:${MUTED};">Was due</td>
             <td style="padding:14px 16px;font-size:13px;font-weight:600;color:${TEXT};text-align:right;">${escapeHtml(due)}</td>
           </tr>`
        : ''
    }
  </table>`;

  return {
    html: layout({
      businessName: input.businessName,
      heading: `Invoice ${input.invoiceNumber}`,
      bodyHtml: summary + paragraphs(input.message),
      cta: input.invoiceUrl ? { label: 'View invoice', url: input.invoiceUrl } : undefined,
      footerNote: 'If you have already paid, please ignore this message.',
    }),
    text: input.invoiceUrl ? `${input.message}\n\nView invoice: ${input.invoiceUrl}` : input.message,
  };
}

/** A quote sent to a customer for approval. */
export function quoteEmail(input: {
  businessName: string;
  customerName: string;
  quoteNumber: string;
  totalMinor: number;
  currency: string;
  validUntil?: Date | null;
  notes?: string | null;
}): { html: string; text: string; subject: string } {
  const amount = formatMoney(input.totalMinor, input.currency);
  const validity = input.validUntil
    ? `This quote is valid until ${input.validUntil.toDateString()}.`
    : '';

  const text = [
    `Dear ${input.customerName},`,
    '',
    `Thank you for your enquiry. Please find our quote ${input.quoteNumber} for ${amount}.`,
    input.notes ? `\n${input.notes}` : '',
    validity,
    '',
    'Please reply to this email to confirm and we will get started.',
    '',
    input.businessName,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return {
    subject: `Quote ${input.quoteNumber} from ${input.businessName} — ${amount}`,
    text,
    html: layout({
      businessName: input.businessName,
      heading: `Quote ${input.quoteNumber}`,
      bodyHtml:
        paragraphs(
          `Dear ${input.customerName},\n\nThank you for your enquiry. Please find our quote below.`,
        ) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid ${BORDER};border-radius:8px;">
           <tr>
             <td style="padding:16px;font-size:14px;color:${MUTED};">Total</td>
             <td style="padding:16px;font-size:18px;font-weight:700;color:${TEXT};text-align:right;">${escapeHtml(amount)}</td>
           </tr>
         </table>` +
        (input.notes ? paragraphs(input.notes) : '') +
        paragraphs(`${validity}\n\nPlease reply to this email to confirm and we will get started.`),
      footerNote: validity || undefined,
    }),
  };
}

/** Weekly cash-flow summary, sent to the business owner rather than a customer. */
export function cashflowSummaryEmail(input: {
  businessName: string;
  periodLabel: string;
  summary: string;
  salesMinor: number;
  collectedMinor: number;
  overdueMinor: number;
  currency: string;
  dashboardUrl?: string;
}): { html: string; text: string; subject: string } {
  const rows: Array<[string, number]> = [
    ['Sales', input.salesMinor],
    ['Collected', input.collectedMinor],
    ['Overdue', input.overdueMinor],
  ];

  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid ${BORDER};border-radius:8px;">
    ${rows
      .map(
        ([label, minor], index) =>
          `<tr>
             <td style="padding:14px 16px;${index < rows.length - 1 ? `border-bottom:1px solid ${BORDER};` : ''}font-size:13px;color:${MUTED};">${label}</td>
             <td style="padding:14px 16px;${index < rows.length - 1 ? `border-bottom:1px solid ${BORDER};` : ''}font-size:13px;font-weight:600;color:${TEXT};text-align:right;">${escapeHtml(formatMoney(minor, input.currency))}</td>
           </tr>`,
      )
      .join('')}
  </table>`;

  const text = [
    `${input.periodLabel}`,
    '',
    input.summary,
    '',
    `Sales: ${formatMoney(input.salesMinor, input.currency)}`,
    `Collected: ${formatMoney(input.collectedMinor, input.currency)}`,
    `Overdue: ${formatMoney(input.overdueMinor, input.currency)}`,
  ].join('\n');

  return {
    subject: `Your business summary — ${input.periodLabel}`,
    text,
    html: layout({
      businessName: input.businessName,
      heading: `Summary for ${input.periodLabel}`,
      bodyHtml: table + paragraphs(input.summary),
      cta: input.dashboardUrl
        ? { label: 'Open dashboard', url: input.dashboardUrl }
        : undefined,
    }),
  };
}
