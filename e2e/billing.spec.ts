import { test, expect } from '@playwright/test';
import { expectPageHeading, gotoApp } from './fixtures/app';

test.describe('Billing & plan', () => {
  test('shows the active Growth subscription and usage bars', async ({ page }) => {
    await gotoApp(page, '/app/billing');
    await expectPageHeading(page, 'Billing & plan');

    await expect(page.getByRole('heading', { name: /Growth plan/i })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: /^Active$/ })).toBeVisible();
    await expect(page.getByRole('main').getByText('Customers', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByText('AI actions')).toBeVisible();
  });
});
