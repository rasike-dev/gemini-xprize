import { test, expect } from '@playwright/test';
import { expectPageHeading, gotoApp } from './fixtures/app';

test.describe('Reports', () => {
  test('loads monthly summary stats and export actions', async ({ page }) => {
    await gotoApp(page, '/app/reports');
    await expectPageHeading(page, 'Reports');

    await expect(page.getByRole('main').getByText('Revenue this month')).toBeVisible();
    await expect(page.getByRole('main').getByText('Overdue', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();
  });
});
