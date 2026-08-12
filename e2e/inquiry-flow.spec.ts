import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

/** Demo tenant from packages/db/src/seed.ts — matches org_demo_printpro. */
const DEMO_TENANT_ID = 'f7f7ecf3-f566-4df7-94f5-9f5504f9699c';

function deriveIntakeSecret(tenantId: string): string {
  const master = process.env.INTAKE_HMAC_SECRET ?? 'dev-intake-secret-change-me';
  return createHmac('sha256', master).update(`intake:${tenantId}`).digest('hex');
}

test('inquiry to agent-run pipeline creates inquiry and quote runs', async ({ request }) => {
  const body = {
    channel: 'WHATSAPP',
    from: '+94770002222',
    fromName: 'E2E Cafe',
    body: 'Please quote 30 printed menus with lamination',
    idempotencyKey: `e2e-${Date.now()}`,
  };
  const raw = JSON.stringify(body);
  const signature = createHmac('sha256', deriveIntakeSecret(DEMO_TENANT_ID))
    .update(raw)
    .digest('hex');

  const intake = await request.post('/api/intake', {
    headers: {
      'content-type': 'application/json',
      'x-ledgerpilot-org': 'org_demo_printpro',
      'x-ledgerpilot-signature': signature,
    },
    data: body,
  });
  expect(intake.ok()).toBeTruthy();

  let foundInquiry = false;
  let foundQuote = false;
  for (let i = 0; i < 15; i += 1) {
    const res = await request.get('/api/agent-runs', {
      headers: { 'x-dev-org-id': 'org_demo_printpro', 'x-dev-role': 'OWNER' },
    });
    expect(res.ok()).toBeTruthy();
    const runs = (await res.json()) as Array<{ agentType: string; status: string }>;
    foundInquiry = runs.some((r) => r.agentType === 'INQUIRY' && r.status === 'COMPLETED');
    foundQuote = runs.some((r) => r.agentType === 'QUOTE');
    if (foundInquiry && foundQuote) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  expect(foundInquiry).toBeTruthy();
  expect(foundQuote).toBeTruthy();
});
