import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Runs against the mock provider for deterministic, offline runs.
 * Requires `npx playwright install` once to download browsers.
 *
 * Two processes: the Vite preview server (static SPA) and the Hono API. The
 * in-browser `/api/worldcup` calls reach the API through Vite's `preview.proxy`
 * (vite preview ignores `server.proxy`, so the config defines both).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3217',
    trace: 'on-first-retry',
    // Pin zone + locale so kickoff text (rendered via the date-fns-tz façade
    // against its 'UTC' default) is byte-stable across machines/CI, keeping the
    // visual snapshots reproducible. Device descriptors (e.g. iPhone 13) do not
    // set timezoneId/locale, so these apply uniformly to every project.
    timezoneId: 'UTC',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    {
      command: 'npm run build && npm run preview',
      url: 'http://localhost:3217',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run start:api',
      url: 'http://localhost:8787/api/worldcup',
      env: { WC_PROVIDER: 'mock', PORT: '8787' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
