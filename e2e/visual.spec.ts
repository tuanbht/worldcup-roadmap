import { expect, test, type Locator, type Page } from '@playwright/test';

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

/**
 * Mobile zoom floor (requirement 2026-06-23-1336). Mirrors `MOBILE_MIN_ZOOM` in
 * `src/features/roadmap/responsive.ts`; the authoritative unit assertion of the
 * exact constant lives in responsive.test.ts. ε absorbs sub-pixel transform noise.
 */
const MOBILE_MIN_ZOOM = 0.32;
const ZOOM_FLOOR_EPSILON = 1e-3;

/** Mobile widths named in the acceptance criteria. */
const MOBILE_BREAKPOINTS = [
  { label: '320', width: 320, height: 720 },
  { label: '375', width: 375, height: 812 },
  { label: '390', width: 390, height: 844 },
] as const;

/** Widths for the standings-overlay 320px-fit checks (AC #4 — incl. tablet 768). */
const STANDINGS_BREAKPOINTS = [
  { label: '320', width: 320, height: 720 },
  { label: '375', width: 375, height: 812 },
  { label: '768', width: 768, height: 1024 },
] as const;

const BREAKPOINTS = [
  { label: '320', width: 320, height: 720 },
  { label: '375', width: 375, height: 812 },
  { label: '640', width: 640, height: 900 },
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
    test.skip(
      testInfo.project.name === 'mobile',
      'self-driven viewport; mobile project pins its own viewport',
    );
  });

  for (const bp of BREAKPOINTS) {
    test(`no horizontal overflow at ${bp.label}px`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');
      await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
      await settle(page);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        scrollWidth,
        `document must not overflow horizontally at ${bp.label}px`,
      ).toBeLessThanOrEqual(clientWidth + 1);
    });

    test(`visual snapshot at ${bp.label}px`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');
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

/**
 * Mobile bottom-sheet open-panel visual regression (Acceptance criterion:
 * "mobile visual snapshot of the open Stats/panel sheet").
 *
 * What this pins: the STRUCTURAL mobile bottom-sheet layout — a near-full-height
 * sheet, a reachable close button, a compact sticky header, and no clipping at
 * the bottom edge. The inner content region is masked (see below), so the
 * snapshot is a layout contract, not a content contract. The three-region sticky
 * structure (compact header / sticky tabs / scroll content) is verified
 * deterministically by the unit suite (MatchDetailTabs.test.tsx).
 *
 * Determinism — which match opens. React Flow virtualises nodes, so "the first
 * group-stage card" is non-deterministic build-to-build (a different match means
 * a different header AND a different detail state). So we open via the
 * date-derived "go to current match" affordance, which always selects the same
 * `pickFocusMatchId` target. In the mock PREVIEW build (the E2E target:
 * `npm run build && npm run preview` with VITE_FIFA_PROVIDER=mock) that target
 * is the Round-of-32 "Argentina vs Mexico" fixture, which resolves to
 * `status: 'unavailable'` → the static PanelEmpty card ("Match detail not
 * available").
 *
 * Determinism — the captured pixels. The detail query is async even for the
 * mock, so the content region first flashes an `aria-busy` loading skeleton
 * (PanelSkeleton, with a motion pulse) before settling. We:
 *  1. Wait for the async detail query to reach its terminal state (the loading
 *     skeleton is gone AND a terminal content region is present) — capturing
 *     mid-transition is a flake source: the animated skeleton vs the resolved
 *     card differ in height and the skeleton pulses.
 *  2. Pin ONLY the STRUCTURAL sheet frame: sheet bounds, the absolute close
 *     button and the compact sticky header (region 1). The content region below
 *     the header (region 3 — here the PanelEmpty card, or a scrollable tabpanel
 *     for a populated match) is MASKED, because its pixels are async/animated.
 *     That inner content is already covered deterministically by the unit suite
 *     (MatchDetailTabs.test.tsx), so masking it here matches this block's
 *     documented intent (pin the layout, not the content) and removes the flake
 *     at its source rather than papering over it with a looser pixel threshold.
 */

/**
 * The content region below the sticky header — region 3 of the three-region
 * flex column. Two shapes are masked so the snapshot is stable whatever terminal
 * state the detail query reaches:
 *  - `unavailable` / skeleton / error / placeholder → the `px-6 pb-6` content
 *    card that sits directly below the header in those branches (the mock
 *    preview build's terminal state: PanelEmpty);
 *  - `ready` → the active (non-`hidden`) `[role="tabpanel"]` scroll region.
 * The sticky compact header (region 1) is NOT matched, so it stays pinned. A
 * mask locator that matches zero elements in a given state is a no-op for
 * Playwright, so passing both candidates is safe.
 */
function contentRegions(panel: Locator): Locator[] {
  return [
    panel.locator('[role="tabpanel"]:not([hidden])'),
    panel.locator('.overflow-hidden > div.px-6.pb-6'),
  ];
}
test.describe('mobile bottom-sheet open-panel layout', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'self-driven viewport; mobile project pins its own viewport',
    );
  });

  for (const bp of MOBILE_BREAKPOINTS) {
    test(`open panel snapshot at ${bp.label}px — sheet visible, no horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');

      // Wait for canvas to load and stabilise.
      await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
      await settle(page);

      // Open the detail panel via the DETERMINISTIC "go to current match"
      // affordance rather than "the first group-stage card". React Flow
      // virtualises nodes, so which card is rendered/first in the DOM varies
      // build-to-build — and a different match means a different header AND a
      // different detail state (ready vs unavailable), which is the real source
      // of the snapshot flake. The focus-match button centres the camera on the
      // single, date-derived "current" match (`pickFocusMatchId`) and selects
      // it, so the SAME match opens every run. (Its label is "Go to live match"
      // when a match is in play, else "Go to current match".)
      const focusCurrent = page.getByRole('button', { name: 'Go to current match' });
      const focusLive = page.getByRole('button', { name: 'Go to live match' });
      const focusBtn = (await focusLive.count()) > 0 ? focusLive : focusCurrent;
      await expect(focusBtn).toBeVisible({ timeout: 10_000 });
      await focusBtn.click();

      // The panel must be visible (aria-hidden=false).
      const panel = page.getByRole('complementary', { name: 'Match details' });
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('aria-hidden', 'false');

      // The close button must be in-viewport (reachable without scrolling).
      const closeBtn = panel.getByRole('button', { name: 'Close match details' });
      await expect(closeBtn).toBeVisible();
      await expect(closeBtn).toBeInViewport();

      // No horizontal overflow at this width.
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        scrollWidth,
        `document must not overflow horizontally at ${bp.label}px with panel open`,
      ).toBeLessThanOrEqual(clientWidth + 1);

      // Settle the detail query to its TERMINAL state before snapshotting.
      // Even in the mock build the detail query is async: the content region
      // first renders an `aria-busy` loading skeleton (PanelSkeleton, with a
      // motion pulse) and only then resolves. In the mock PREVIEW build this
      // match resolves to `status: 'unavailable'` → the static PanelEmpty card
      // (".overflow-hidden > div.px-6.pb-6"); a data-populated match would
      // instead resolve to `ready` with a scrollable tabpanel. Capturing during
      // that async transition is the real flake source: the animated skeleton vs
      // the resolved card differ in height AND the skeleton pulses. So we wait
      // for BOTH the skeleton to be gone AND a terminal content region to be
      // present — whichever of the two terminal shapes this match yields.
      const content = contentRegions(panel);
      const settledContent = panel
        .locator('[role="tabpanel"]:not([hidden]), .overflow-hidden > div.px-6.pb-6')
        .first();
      await expect(settledContent).toBeVisible({ timeout: 10_000 });
      await expect(panel.locator('[aria-busy="true"]')).toHaveCount(0);

      // Settle the resolved content region: pin any scrollable region to the top
      // (scrollTop = 0 — no carried-over scroll offset between runs) and wait
      // for fonts. This removes any residual paint/scroll variance there.
      await settledContent.evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.evaluate(() => document.fonts.ready);

      // The focus button centres the camera with a timed `setCenter`; wait for
      // the React Flow viewport transform to come to rest so the canvas strip
      // visible above the bottom-sheet (≈12dvh) is pixel-stable too.
      await settle(page);

      // Visual snapshot of the open bottom-sheet. We pin ONLY the structural
      // sheet frame (sheet bounds + absolute close button + compact sticky
      // header + sticky tabs row); the scrollable content region (region 3)
      // below the tabs is masked because its dynamic, animated rows settle
      // non-deterministically and are already covered by the unit suite. (Flag
      // <img>s in the header are masked too, as elsewhere.)
      await expect(page).toHaveScreenshot(`panel-open-${bp.label}.png`, {
        fullPage: false,
        animations: 'disabled',
        mask: [page.locator('img'), ...content],
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});

/**
 * Viewport-scale floor (requirement 2026-06-23-1336, AC #2 / plan L2).
 *
 * Raising the canvas `minZoom` to MOBILE_MIN_ZOOM on ≤640px is what keeps the
 * bracket legible (not unreadably tiny) on first-load framing at 320px. After
 * the initial fit settles, the live `.react-flow__viewport` scale must therefore
 * be at least the mobile floor (minus ε for sub-pixel transform noise). This is a
 * deterministic CI guard against a future silent revert of the floor to 0.2 — it
 * reuses the existing `readScale()`/`settle()` harness, so it adds no flake.
 *
 * RED until RoadmapCanvas wires `minZoom={mobileZoomFloor(...)}` from
 * useMobileViewport: the current hardcoded `minZoom={0.2}` lets the fit clamp
 * below the floor at 320px, so the post-settle scale stays under MOBILE_MIN_ZOOM.
 */
test.describe('mobile viewport-scale floor', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'self-driven viewport; mobile project pins its own viewport',
    );
  });

  test('post-load canvas scale is at least MOBILE_MIN_ZOOM at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
    await settle(page);

    const scale = await readScale(page);
    expect(
      scale,
      `post-load canvas scale (${scale}) must be >= MOBILE_MIN_ZOOM (${MOBILE_MIN_ZOOM}) at 320px`,
    ).toBeGreaterThanOrEqual(MOBILE_MIN_ZOOM - ZOOM_FLOOR_EPSILON);
  });
});

/**
 * Standings overlay fits a narrow viewport (requirement 2026-06-23-1336, AC #4).
 *
 * Determinism (plan L1): the `Open Group A standings` header button lives inside a
 * virtualized React Flow node, so it can be offscreen at first-load framing. We
 * mirror the hardened `panel-open` block: settle the RF transform, then assert the
 * trigger `toBeInViewport()` BEFORE clicking — never click a virtualized/offscreen
 * node. (The group-standings tables sit at the TOP of every column, so first-load
 * top-aligned framing renders Group A's header on-screen; if a future relayout
 * moves it, this in-viewport assertion fails loudly instead of flaking.)
 *
 * Once open we assert the dialog is visible, its close button is in-viewport (the
 * `-top-3 -right-3` bleed must not push it off a 320px screen), and the document
 * has no horizontal overflow — then snapshot the structural overlay (flags masked).
 *
 * RED until StandingsOverlay is viewport-bounded + uses the compact column set on
 * mobile: today the 296px card + its bleeding close button can exceed a 320px
 * viewport (close button off-screen / horizontal overflow).
 */
test.describe('mobile standings overlay layout', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'self-driven viewport; mobile project pins its own viewport',
    );
  });

  for (const bp of STANDINGS_BREAKPOINTS) {
    test(`standings overlay fits at ${bp.label}px — dialog + close button in viewport, no overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');

      await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
      await settle(page);

      // DETERMINISTIC open: the group-standings tables are the top row of every
      // column, so first-load top-aligned framing renders Group A's header. Assert
      // the opener is genuinely in-viewport BEFORE clicking (no virtualized flake).
      const opener = page.getByRole('button', { name: 'Open Group A standings' });
      await expect(opener).toBeVisible({ timeout: 10_000 });
      await expect(opener).toBeInViewport();
      await opener.click();

      // The dialog must be visible and bounded within the viewport.
      const dialog = page.getByRole('dialog', { name: 'Group A standings' });
      await expect(dialog).toBeVisible();

      // The close button must be reachable without scrolling (the -top-3 -right-3
      // bleed must not push it off a 320px screen).
      const closeBtn = dialog.getByRole('button', { name: 'Close standings' });
      await expect(closeBtn).toBeVisible();
      await expect(closeBtn).toBeInViewport();

      // No horizontal page overflow with the overlay open.
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        scrollWidth,
        `document must not overflow horizontally at ${bp.label}px with the standings overlay open`,
      ).toBeLessThanOrEqual(clientWidth + 1);

      await page.evaluate(() => document.fonts.ready);
      await settle(page);

      // Structural snapshot of the open overlay (flag <img>s masked, as elsewhere).
      await expect(page).toHaveScreenshot(`standings-open-${bp.label}.png`, {
        fullPage: false,
        animations: 'disabled',
        mask: [page.locator('img')],
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
