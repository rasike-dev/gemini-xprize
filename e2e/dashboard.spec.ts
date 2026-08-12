import { test, expect } from '@playwright/test';
import { SEED, expectPageHeading, gotoApp } from './fixtures/app';

test.describe('Dashboard', () => {
  test('loads stats and recent agent activity from the seeded tenant', async ({ page }) => {
    await gotoApp(page, '/app');
    await expectPageHeading(page, 'Dashboard');

    await expect(page.getByRole('main').getByText('Revenue this month')).toBeVisible();
    await expect(page.getByRole('main').getByText('Customers', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').locator('.grid').getByText('2', { exact: true })).toBeVisible();

    await expect(page.getByText('Recent AI activity')).toBeVisible();
    await expect(page.getByRole('main').getByText(/INQUIRY agent/i).first()).toBeVisible();
    await expect(page.getByRole('main').getByText(/QUOTE agent/i).first()).toBeVisible();
  });
});
