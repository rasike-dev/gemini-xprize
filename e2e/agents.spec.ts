import { test, expect } from '@playwright/test';
import { expectPageHeading, gotoApp } from './fixtures/app';

test.describe('AI Agent Log', () => {
  test('lists inquiry and quote runs from the seeded tenant', async ({ page }) => {
    await gotoApp(page, '/app/agents');
    await expectPageHeading(page, 'AI Agent Log');

    await expect(page.getByRole('main').getByRole('cell', { name: 'INQUIRY', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('main').getByRole('cell', { name: 'QUOTE', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('main').getByRole('cell', { name: 'PAYMENT FOLLOWUP' }).first()).toBeVisible();
    await expect(page.getByText(/runs/i)).toBeVisible();
  });
});
