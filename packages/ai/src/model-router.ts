import type { AgentType } from '@ledgerpilot/shared';

const FAST = process.env.GEMINI_MODEL_FAST ?? 'gemini-2.0-flash';
const PRO = process.env.GEMINI_MODEL_PRO ?? 'gemini-2.0-pro';

/**
 * Route each agent to the cheapest capable model. Classification/extraction/
 * drafting go to Flash; multi-step reasoning (cash-flow) goes to Pro.
 */
export function modelFor(agentType: AgentType): string {
  switch (agentType) {
    case 'CASHFLOW':
      return PRO;
    case 'INQUIRY':
    case 'QUOTE':
    case 'PAYMENT_FOLLOWUP':
    case 'COMPLIANCE':
    case 'SUPPORT':
    default:
      return FAST;
  }
}
