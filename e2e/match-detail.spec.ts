import { expect, test } from '@playwright/test';

/**
 * Match-detail panel smoke (Acceptance #1, #10, #14).
 *
 * Opens a match → asserts the 3-tab panel → switches through Timeline / Lineups /
 * Stats → closes via Escape (a11y focus-restore path). Mirrors the open flow in
 * roadmap.spec.ts ([data-final="true"] → complementary "Match details").
 *
 * NOTE: Playwright browsers may be unavailable in the sandbox/CI image; this spec
 * runs under `npm run test:e2e` (not the unit `vitest` gate). Document, do not
 * fail the unit gate, when browsers cannot launch here.
 */
test.describe('match detail panel', () => {
  test('open → switch all three tabs → close via Escape', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'All' }).click();
    await page.locator('[data-final="true"]').click();

    const panel = page.getByRole('complementary', { name: 'Match details' });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-hidden', 'false');

    const tablist = panel.getByRole('tablist');
    await expect(tablist).toBeVisible();

    for (const name of [/timeline/i, /lineups/i, /stats/i]) {
      const tab = panel.getByRole('tab', { name });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(panel.getByRole('tabpanel')).toBeVisible();
    }

    await page.keyboard.press('Escape');
    await expect(panel).toHaveAttribute('aria-hidden', 'true');
  });
});
