import { test, expect } from '@playwright/test';
import { SEED, dismissToasts, expectPageHeading, gotoApp } from './fixtures/app';

test.describe('Customers', () => {
  test('lists seeded customers and supports add then delete', async ({ page }) => {
    const uniqueName = `E2E Customer ${Date.now()}`;

    await gotoApp(page, '/app/customers');
    await expectPageHeading(page, 'Customers');

    for (const name of SEED.customers) {
      await expect(page.getByRole('cell', { name })).toBeVisible();
    }

    await page.getByRole('button', { name: 'Add customer' }).first().click();
    await expect(page.getByRole('heading', { name: 'Add a customer' })).toBeVisible();

    const form = page.locator('form').filter({ has: page.locator('input[name="name"]') });
    await form.locator('input[name="name"]').fill(uniqueName);
    await form.locator('input[name="phone"]').fill('+94770001111');
    await form.getByRole('button', { name: 'Add customer' }).click();

    await expect(page.getByRole('cell', { name: uniqueName })).toBeVisible({ timeout: 15_000 });
    await dismissToasts(page);

    page.once('dialog', (dialog) => dialog.accept());
    const row = page.getByRole('row', { name: new RegExp(uniqueName) });
    await row.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('cell', { name: uniqueName })).toHaveCount(0, { timeout: 15_000 });
  });
});
