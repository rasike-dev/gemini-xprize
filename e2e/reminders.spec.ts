import { test, expect } from '@playwright/test';
import { expectPageHeading, gotoApp } from './fixtures/app';

test.describe('Reminders', () => {
  test('shows the seeded payment reminder for the overdue invoice', async ({ page }) => {
    await gotoApp(page, '/app/reminders');
    await expectPageHeading(page, 'Reminders');

    await expect(page.getByText('Silva Traders', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByText(/INV-1002/).first()).toBeVisible();
    await expect(page.getByText(/gentle reminder/i)).toBeVisible();
    await expect(page.getByText(/^Sent /)).toBeVisible();
  });
});
