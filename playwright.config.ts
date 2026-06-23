import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Runs against the mock provider for deterministic, offline runs.
 * Requires `npx playwright install` once to download browsers.
 *
 * A SINGLE process: the Vite preview server (static SPA). There is no backend —
 * the SPA fetches FIFA directly in the browser. The build is pinned to the mock
 * provider via `env: { VITE_FIFA_PROVIDER: 'mock' }` so Vite inlines it at BUILD
 * time and the browser never reaches live `api.fifa.com` during E2E.
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
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:3217',
    // Pin the static build to the mock provider so Vite inlines it at BUILD time
    // (a build only inlines VITE_* keys present in the build process's env).
    env: { VITE_FIFA_PROVIDER: 'mock' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
