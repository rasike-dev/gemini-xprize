import { z } from 'zod';
import { lineItemSchema } from './schemas.js';

/**
 * Structured-output contracts for each agent. Gemini output is validated against
 * these before anything is written to the DB. This is our LLM-safety boundary:
 * malformed or hallucinated output is rejected, never persisted.
 */

const confidence = z.number().min(0).max(1);

/** Inquiry Agent: classify intent + extract who/what. */
export const inquiryResultSchema = z.object({
  intent: z.enum(['QUOTE_REQUEST', 'PAYMENT_QUERY', 'SUPPORT', 'OTHER']),
  customerName: z.string().nullable(),
  customerContact: z.string().nullable(),
  summary: z.string().max(500),
  confidence,
});
export type InquiryResult = z.infer<typeof inquiryResultSchema>;

/** Quote Agent: produce structured quote lines from free text. */
export const quoteResultSchema = z.object({
  currency: z.string().length(3),
  lines: z.array(lineItemSchema).min(1),
  notes: z.string().max(1000).nullable(),
  assumptions: z.array(z.string().max(280)).max(10),
  confidence,
});
export type QuoteResult = z.infer<typeof quoteResultSchema>;

/** Payment Follow-up Agent: draft a polite reminder message. */
export const reminderResultSchema = z.object({
  channel: z.enum(['WHATSAPP', 'EMAIL', 'SMS']),
  subject: z.string().max(200).nullable(),
  message: z.string().min(1).max(1200),
  tone: z.enum(['FRIENDLY', 'FIRM', 'FINAL_NOTICE']),
  confidence,
});
export type ReminderResult = z.infer<typeof reminderResultSchema>;

/** Cash-flow Agent: summarize sales/collections + warnings. */
export const cashflowResultSchema = z.object({
  periodLabel: z.string().max(80),
  headline: z.string().max(280),
  salesMinor: z.number().int().nonnegative(),
  collectedMinor: z.number().int().nonnegative(),
  overdueMinor: z.number().int().nonnegative(),
  warnings: z.array(z.string().max(280)).max(10),
  topCustomers: z.array(z.string().max(120)).max(5),
  confidence,
});
export type CashflowResult = z.infer<typeof cashflowResultSchema>;

/** Compliance Assistant: VAT / e-invoicing field validation. */
export const complianceResultSchema = z.object({
  ready: z.boolean(),
  missingFields: z.array(z.string().max(120)).max(20),
  warnings: z.array(z.string().max(280)).max(20),
  confidence,
});
export type ComplianceResult = z.infer<typeof complianceResultSchema>;

/** Support Agent: respond to invoice/payment status customer questions. */
export const supportResultSchema = z.object({
  response: z.string().min(1).max(1200),
  suggestedAction: z.string().max(280).nullable(),
  confidence,
});
export type SupportResult = z.infer<typeof supportResultSchema>;

/** Map agent type -> its output schema, for the worker's validation step. */
export const agentResultSchemas = {
  INQUIRY: inquiryResultSchema,
  QUOTE: quoteResultSchema,
  PAYMENT_FOLLOWUP: reminderResultSchema,
  CASHFLOW: cashflowResultSchema,
  COMPLIANCE: complianceResultSchema,
  SUPPORT: supportResultSchema,
} as const;
