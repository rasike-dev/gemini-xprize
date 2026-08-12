import { defineConfig, devices } from '@playwright/test';

const apiBase = process.env.E2E_API_URL ?? 'http://127.0.0.1:8080';
const webBase = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  reporter: process.env.CI ? 'github' : 'list',
  projects: [
    {
      name: 'api',
      testMatch: /inquiry-flow\.spec\.ts/,
      use: { baseURL: apiBase },
    },
    {
      name: 'ui',
      testMatch: /\.spec\.ts/,
      testIgnore: /inquiry-flow\.spec\.ts/,
      timeout: 120_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: webBase,
        navigationTimeout: 90_000,
      },
    },
  ],
});
