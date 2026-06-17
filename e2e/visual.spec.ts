import { expect, test, type Page } from '@playwright/test';

/**
 * Visual regression + responsive overflow (Acceptance #11).
 *
 * Each test drives its OWN viewport via `setViewportSize`, so it is meaningful
 * only on a desktop-style project. To avoid the Playwright project/viewport
 * matrix double-running these (the `mobile` project pins an iPhone-13 viewport),
 * we skip the mobile project — these specs own the viewport themselves.
 *
 * Determinism: WC_PROVIDER=mock fixture, wait for fonts + a stable viewport
 * transform (the 60ms+400ms fit) before asserting/snapshotting, and mask flag
 * <img>s so remote/loading flags never flake the screenshot.
 */

const VIEWPORT = '.react-flow__viewport';

const BREAKPOINTS = [
  { label: '320', width: 320, height: 720 },
  { label: '768', width: 768, height: 1024 },
  { label: '1024', width: 1024, height: 768 },
  { label: '1440', width: 1440, height: 900 },
] as const;

async function readScale(page: Page): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return 1;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 1;
    return new DOMMatrixReadOnly(t).a;
  }, VIEWPORT);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  let last = await readScale(page);
  await expect
    .poll(
      async () => {
        const next = await readScale(page);
        const stable = Math.abs(next - last) < 1e-4;
        last = next;
        return stable;
      },
      { timeout: 6000, intervals: [80, 120, 160, 200] },
    )
    .toBe(true);
}

test.describe('responsive layout', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'self-driven viewport; mobile project pins its own viewport');
  });

  for (const bp of BREAKPOINTS) {
    test(`no horizontal overflow at ${bp.label}px`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/?view=bracket');
      await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
      await settle(page);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `document must not overflow horizontally at ${bp.label}px`).toBeLessThanOrEqual(
        clientWidth + 1,
      );
    });

    test(`visual snapshot at ${bp.label}px`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/?view=bracket');
      await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
      await settle(page);

      await expect(page).toHaveScreenshot(`roadmap-${bp.label}.png`, {
        fullPage: false,
        animations: 'disabled',
        mask: [page.locator('img')],
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
