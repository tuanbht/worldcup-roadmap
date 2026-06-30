import { expect, test, type Page } from '@playwright/test';
import { settle } from './_settle';

/**
 * E2E for the radial "circle" bracket view (requirement 2026-06-30-1104; plan
 * Test Strategy 27-32 / Acceptance #1, #4, #5, #6, #7, #9, #11).
 *
 * Mirrors `visual.spec.ts`/`timeline-grid.spec.ts`: drive the LayoutToggle by its
 * accessible name (NOT a URL deep-link race), wait for `.react-flow__node` +
 * `settle()` before asserting/snapshotting, and keyboard-activate focus buttons
 * (canvas transform-independent). The suite SKIPS the `mobile` Playwright project
 * (self-driven viewport) exactly like `visual.spec.ts` [H5], and imports the
 * shared `settle()` from `./_settle`.
 *
 * Determinism: WC_PROVIDER=mock fixture, `timezoneId:'UTC'` (playwright.config),
 * masked flag <img>s, mobile width for the single snapshot (no desktop baseline →
 * dodges the known `roadmap-1024` AA drift in this ENV).
 *
 * NOTE: Playwright browsers may be unavailable in the sandbox/CI image; this spec
 * runs under `npm run test:e2e`, not the unit `vitest` gate. Document, do not fail
 * the unit gate, when browsers cannot launch here.
 */

const CIRCLE_TOGGLE = { name: 'Circle' } as const;
const GRID_TOGGLE = { name: 'Grid' } as const;
const FINAL_CENTER = '[data-final="true"]';
const BADGE_FLAG = 'button[aria-label^="Show matches for"]';

/** Mount the default route, wait for the first node + a stable transform. */
async function load(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
  await settle(page);
}

/** Switch to the Circle layout via the toggle's accessible name, then settle. */
async function switchToCircle(page: Page): Promise<void> {
  await page.getByRole('button', CIRCLE_TOGGLE).click();
  await expect(page.locator(FINAL_CENTER)).toBeAttached({ timeout: 10_000 });
  await settle(page);
}

test.describe('radial circle view', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'self-driven viewport; mobile project pins its own viewport',
    );
  });

  test('selecting Circle swaps the grid for the radial graph [Test 27 / Acceptance #1, #5]', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await load(page);
    // The grid's group cards are present before switching.
    await expect(page.getByText(/Group A.*MD\d/).first()).toBeAttached({ timeout: 10_000 });

    await switchToCircle(page);

    // ≥32 team-badge nodes on the outer ring + the center Final.
    await expect(async () => {
      expect(await page.locator('.react-flow__node').count()).toBeGreaterThanOrEqual(32);
    }).toPass({ timeout: 10_000 });
    await expect(page.locator(FINAL_CENTER)).toBeAttached();
    // The group stage is excluded from the circle view — the group cards are gone.
    await expect(page.getByText(/Group A.*MD\d/)).toHaveCount(0, { timeout: 10_000 });
  });

  test('?layout=circle persists across reload and back-to-grid restores the timeline [Test 28 / Acceptance #4]', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await load(page);

    await switchToCircle(page);
    // The URL now carries the layout choice.
    await expect(async () => {
      expect(new URL(page.url()).searchParams.get('layout')).toBe('circle');
    }).toPass({ timeout: 10_000 });

    // A reload keeps Circle (persistence): the center Final is still present.
    await page.reload();
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(FINAL_CENTER)).toBeAttached({ timeout: 10_000 });
    await settle(page);

    // Switching back to Grid restores the timeline + ?layout=grid.
    await page.getByRole('button', GRID_TOGGLE).click();
    await expect(page.getByText(/Group A.*MD\d/).first()).toBeAttached({ timeout: 10_000 });
    await expect(async () => {
      expect(new URL(page.url()).searchParams.get('layout')).toBe('grid');
    }).toPass({ timeout: 10_000 });
  });

  test('clicking a badge/dot opens the MatchDetailPanel [Test 29 / Acceptance #6]', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await load(page);
    await switchToCircle(page);

    // Click the center Final (a stable, on-screen target carrying a real matchId).
    await page.locator(FINAL_CENTER).click();

    const panel = page.getByRole('complementary', { name: 'Match details' });
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  test('team-focus lights the inward path and dims the rest; Esc clears [Test 30 / Acceptance #7]', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await load(page);
    await switchToCircle(page);

    // Keyboard-activate a badge's focus button (transform-independent).
    const flag = page.locator(BADGE_FLAG).first();
    await expect(flag).toBeAttached({ timeout: 10_000 });
    await flag.focus();
    await expect(flag).toBeFocused();
    await flag.press('Enter');

    // The inward path lights up (focus-on) and the rest dims (focus-dim), and a
    // radial edge on the path brightens.
    await expect(page.locator('[data-focus="on"]').first()).toBeAttached({ timeout: 10_000 });
    await expect(page.locator('[data-focus="dim"]').first()).toBeAttached({ timeout: 10_000 });
    await expect(page.locator('path.radial-edge--focus-on').first()).toBeAttached({
      timeout: 10_000,
    });

    // Esc clears the focus.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-focus="on"]')).toHaveCount(0, { timeout: 10_000 });
  });

  for (const width of [320, 375] as const) {
    test(`no horizontal overflow at ${width}px with Circle active [Test 31 / Acceptance #9]`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 });
      await load(page);
      await switchToCircle(page);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        scrollWidth,
        `circle view must not overflow horizontally at ${width}px`,
      ).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  test('mobile visual snapshot of the circle view [Test 32 / Acceptance #11]', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await load(page);
    await switchToCircle(page);

    await expect(page).toHaveScreenshot('radial-circle-375.png', {
      fullPage: false,
      animations: 'disabled',
      mask: [page.locator('img')],
      maxDiffPixelRatio: 0.02,
    });
  });
});
