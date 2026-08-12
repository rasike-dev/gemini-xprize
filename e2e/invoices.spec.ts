import { test, expect } from '@playwright/test';
import { SEED, dismissToasts, expectPageHeading, gotoApp } from './fixtures/app';

test.describe('Invoices', () => {
  test('lists seeded invoices and records a partial payment on the overdue one', async ({ page }) => {
    await gotoApp(page, '/app/invoices');
    await expectPageHeading(page, 'Invoices');

    for (const number of SEED.invoices) {
      await expect(page.getByRole('cell', { name: number })).toBeVisible();
    }

    const overdueRow = page.getByRole('row', { name: /INV-1002/ });
    await overdueRow.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByRole('heading', { name: /Record a payment on INV-1002/i })).toBeVisible();

    await page.locator('input[name="amount"]').fill('10000');
    await page.locator('form').getByRole('button', { name: 'Record payment' }).click();

    await expect(page.getByText(/recorded against INV-1002/i)).toBeVisible({ timeout: 15_000 });
    await dismissToasts(page);
    await expect(overdueRow.getByRole('cell', { name: 'PARTIALLY PAID' })).toBeVisible();
  });
});
