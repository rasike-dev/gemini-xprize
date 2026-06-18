import { z, type ZodType } from 'zod';
import {
  complianceResultSchema,
  inquiryResultSchema,
  quoteResultSchema,
  reminderResultSchema,
} from '@ledgerpilot/shared';

const supportResultSchema = z.object({
  response: z.string().min(1).max(1200),
  suggestedAction: z.string().max(280).nullable(),
  confidence: z.number().min(0).max(1),
});

export interface EvalFixture<T> {
  name: string;
  minConfidence: number;
  schema: ZodType<T>;
  output: T;
}

export const evalFixtures: EvalFixture<unknown>[] = [
  {
    name: 'inquiry_classification_quote_request',
    minConfidence: 0.75,
    schema: inquiryResultSchema,
    output: {
      intent: 'QUOTE_REQUEST',
      customerName: 'Acme Events',
      customerContact: '+94771234567',
      summary: 'Customer asks quote for printed T-shirts',
      confidence: 0.9,
    },
  },
  {
    name: 'quote_generation_simple',
    minConfidence: 0.7,
    schema: quoteResultSchema,
    output: {
      currency: 'LKR',
      lines: [
        {
          description: 'Printed T-shirt',
          quantity: 20,
          unitPriceMinor: 200000,
          taxRatePct: 18,
        },
      ],
      notes: null,
      assumptions: ['single-side print'],
      confidence: 0.82,
    },
  },
  {
    name: 'payment_followup_draft',
    minConfidence: 0.75,
    schema: reminderResultSchema,
    output: {
      channel: 'EMAIL',
      subject: 'Reminder: Invoice INV-1002',
      message: 'Friendly reminder that invoice INV-1002 is overdue.',
      tone: 'FRIENDLY',
      confidence: 0.88,
    },
  },
  {
    name: 'compliance_readiness_check',
    minConfidence: 0.7,
    schema: complianceResultSchema,
    output: {
      ready: false,
      missingFields: ['supplier VAT/TIN'],
      warnings: ['Missing VAT number'],
      confidence: 0.79,
    },
  },
  {
    name: 'support_status_answer',
    minConfidence: 0.7,
    schema: supportResultSchema,
    output: {
      response: 'Invoice INV-1001 is paid in full.',
      suggestedAction: null,
      confidence: 0.86,
    },
  },
];
