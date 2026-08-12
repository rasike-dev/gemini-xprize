import { test, expect } from '@playwright/test';
import { SEED, dismissToasts, expectPageHeading, gotoApp } from './fixtures/app';

test.describe('Quotes', () => {
  test('shows the seeded quote and can create a draft', async ({ page }) => {
    await gotoApp(page, '/app/quotes');
    await expectPageHeading(page, 'Quotes');

    await expect(page.getByRole('cell', { name: SEED.quoteNumber })).toBeVisible();
    await expect(page.getByRole('row', { name: SEED.quoteNumber }).getByRole('cell', { name: 'Acme Events' })).toBeVisible();

    await page.getByRole('button', { name: 'New quote' }).click();
    await expect(page.getByRole('heading', { name: 'New quote' })).toBeVisible();

    await page.locator('select[name="customerId"]').selectOption({ label: 'Acme Events' });
    await page.getByPlaceholder('What are you supplying?').fill('E2E test posters');
    await page.getByText('Unit price (LKR)').locator('..').locator('input').fill('2500');
    await page.getByRole('button', { name: 'Create quote' }).click();

    await expect(page.getByText('Quote created as a draft.')).toBeVisible({ timeout: 15_000 });
    await dismissToasts(page);
    await expect(page.getByText('DRAFT').first()).toBeVisible();
  });
});
