import { test, expect } from '@playwright/test';
import { gotoApp, navigateSidebar } from './fixtures/app';

const ROUTES: Array<{ link: string; heading: string }> = [
  { link: 'Dashboard', heading: 'Dashboard' },
  { link: 'Customers', heading: 'Customers' },
  { link: 'Quotes', heading: 'Quotes' },
  { link: 'Invoices', heading: 'Invoices' },
  { link: 'Reminders', heading: 'Reminders' },
  { link: 'AI Agent Log', heading: 'AI Agent Log' },
  { link: 'Reports', heading: 'Reports' },
  { link: 'Billing & plan', heading: 'Billing & plan' },
  { link: 'Settings', heading: 'Settings' },
];

test.describe('Sidebar navigation', () => {
  test('every dashboard menu item loads without error', async ({ page }) => {
    await gotoApp(page, '/app');

    for (const route of ROUTES) {
      await navigateSidebar(page, route.link);
      await expect(page.getByRole('heading', { name: route.heading, level: 1 })).toBeVisible();
    }
  });
});
