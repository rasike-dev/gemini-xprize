import type { AgentRunStatus } from '@ledgerpilot/shared';

export interface AgentOutcome {
  outputJson: unknown;
  decision: string;
  confidence: number;
  model: string;
  tokensUsed: number;
  costEstimate: number;
  /** COMPLETED for auto-confident runs; AWAITING_APPROVAL when a human must confirm. */
  status: Extract<AgentRunStatus, 'COMPLETED' | 'AWAITING_APPROVAL'>;
  subjectType?: string;
  subjectId?: string;
}

export interface AgentRunRow {
  id: string;
  tenantId: string;
  agentType: string;
  inquiryId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  inputJson: unknown;
}
