import { test, expect } from '@playwright/test';
import { SEED, dismissToasts, expectPageHeading, gotoApp } from './fixtures/app';

test.describe('Settings', () => {
  test('updates the business name and persists after refresh', async ({ page }) => {
    const updatedName = `${SEED.businessName} E2E`;

    await gotoApp(page, '/app/settings');
    await expectPageHeading(page, 'Settings');

    await expect(page.locator('input[name="name"]')).toHaveValue(SEED.businessName);

    await page.locator('input[name="name"]').fill(updatedName);
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved.')).toBeVisible({ timeout: 15_000 });
    await dismissToasts(page);

    await page.reload();
    await expect(page.locator('input[name="name"]')).toHaveValue(updatedName);

    await page.locator('input[name="name"]').fill(SEED.businessName);
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved.')).toBeVisible({ timeout: 15_000 });
  });
});
