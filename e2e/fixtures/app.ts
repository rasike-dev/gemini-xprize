import { expect, type Page } from '@playwright/test';

/** Matches the demo tenant seeded in packages/db/src/seed.ts */
export const SEED = {
  businessName: 'PrintPro Lanka (Pvt) Ltd',
  customers: ['Acme Events', 'Silva Traders'],
  quoteNumber: 'Q-1001',
  invoices: ['INV-1001', 'INV-1002'],
} as const;

export async function expectPageHeading(page: Page, title: string) {
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

export async function gotoApp(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('aside')).toContainText('LedgerPilot AI', { timeout: 30_000 });
}

export async function navigateSidebar(page: Page, label: string) {
  await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
}

export async function dismissToasts(page: Page) {
  const dismissButtons = page.getByRole('button', { name: 'Dismiss' });
  const count = await dismissButtons.count();
  for (let i = 0; i < count; i += 1) {
    await dismissButtons.nth(i).click();
  }
}
