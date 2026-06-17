import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Runs against the mock provider for deterministic, offline runs.
 * Requires `npx playwright install` once to download browsers.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3217',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run build && WC_PROVIDER=mock PORT=3217 npm run start',
    url: 'http://localhost:3217/api/worldcup',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
