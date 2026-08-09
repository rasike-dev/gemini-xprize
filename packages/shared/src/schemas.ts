import { z } from 'zod';
import {
  AgentType,
  IntakeChannel,
  InvoiceStatus,
  QuoteStatus,
} from './enums.js';

/** Money is stored in minor units (cents) to avoid float drift. */
export const moneySchema = z.number().int().nonnegative();

export const currencySchema = z.string().length(3).default('LKR');

export const lineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceMinor: moneySchema,
  taxRatePct: z.number().min(0).max(100).default(0),
});
export type LineItem = z.infer<typeof lineItemSchema>;

/** Raw inbound message from any channel (WhatsApp/email/web). */
export const intakeMessageSchema = z.object({
  channel: z.nativeEnum(IntakeChannel),
  from: z.string().min(1),
  fromName: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().min(1).max(8000),
  receivedAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type IntakeMessage = z.infer<typeof intakeMessageSchema>;

/** Enqueue payload placed on Cloud Tasks. tenantId is trusted (only the API enqueues). */
export const agentTaskSchema = z.object({
  agentRunId: z.string().uuid(),
  tenantId: z.string().min(1),
  agentType: z.nativeEnum(AgentType),
});
export type AgentTask = z.infer<typeof agentTaskSchema>;

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateCustomer = z.infer<typeof createCustomerSchema>;

/** Nullable rather than optional: clearing a phone or email is a real edit. */
export const updateCustomerSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().max(40).nullable().optional(),
    email: z.string().email().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update' });
export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;

export const createQuoteSchema = z.object({
  customerId: z.string().uuid(),
  currency: currencySchema,
  lines: z.array(lineItemSchema).min(1),
  validUntil: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateQuote = z.infer<typeof createQuoteSchema>;

/** Editing a draft quote replaces its line items wholesale. */
export const updateQuoteSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    currency: z.string().length(3).optional(),
    lines: z.array(lineItemSchema).min(1).optional(),
    validUntil: z.string().datetime().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update' });
export type UpdateQuote = z.infer<typeof updateQuoteSchema>;

/** Raise an invoice directly, without going through a quote. */
export const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  currency: currencySchema,
  lines: z.array(lineItemSchema).min(1),
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateInvoice = z.infer<typeof createInvoiceSchema>;

export const recordPaymentSchema = z.object({
  amountMinor: z.number().int().positive(),
  method: z.string().max(40).default('manual'),
  reference: z.string().max(120).optional(),
});
export type RecordPayment = z.infer<typeof recordPaymentSchema>;

export const quoteStatusSchema = z.nativeEnum(QuoteStatus);
export const invoiceStatusSchema = z.nativeEnum(InvoiceStatus);
