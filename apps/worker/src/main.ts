import express from 'express';
import { agentTaskSchema } from '@ledgerpilot/shared';
import { processAgentRun } from './runner.js';
import { runCashflowSummaries, runOverdueScan } from './scheduler-jobs.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ledgerpilot-worker' });
});

/**
 * Cloud Tasks target. In production this Cloud Run service is private
 * (--no-allow-unauthenticated); Cloud Tasks calls it with an OIDC token and IAM
 * enforces the caller identity, so no app-level token check is required here.
 */
app.post('/tasks/agent-run', async (req, res) => {
  const parsed = agentTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_task', issues: parsed.error.issues });
    return;
  }
  try {
    await processAgentRun(parsed.data);
    res.json({ ok: true });
  } catch (err) {
    // Non-2xx tells Cloud Tasks to retry (backoff handled by the queue config).
    console.error('agent-run failed', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/jobs/overdue-scan', async (_req, res) => {
  try {
    res.json(await runOverdueScan());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/jobs/cashflow-summary', async (_req, res) => {
  try {
    res.json(await runCashflowSummaries());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const port = Number(process.env.WORKER_PORT ?? process.env.PORT ?? 8081);
app.listen(port, () => {
  console.log(`LedgerPilot worker listening on :${port}`);
});
