import { chromium, type FullConfig } from '@playwright/test';

/** Pre-compile dashboard routes so the first spec is not paying Next.js cold-start cost. */
export default async function globalSetup(config: FullConfig) {
  const webBase = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  const apiBase = process.env.E2E_API_URL ?? 'http://127.0.0.1:8080';

  const health = await fetch(`${apiBase}/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(
      `API is not reachable at ${apiBase}. Start it with DISABLE_AUTH=true before running Playwright.`,
    );
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(`${webBase}/app`, {
      waitUntil: 'domcontentloaded',
      timeout: config.projects.find((p) => p.name === 'ui')?.use?.navigationTimeout ?? 90_000,
    });
  } finally {
    await browser.close();
  }
}
