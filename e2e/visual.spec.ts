import { expect, test, type Locator, type Page } from '@playwright/test';
import { readScale, settle } from './_settle';

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
 * Standings overlay fits a narrow viewport (requirement 2026-06-23-1336 AC #4,
 * requirement 2026-06-24-1453 deterministic open).
 *
 * Determinism — the open mechanism. The `Open Group A standings` opener is a real
 * native `<button>` rendered ONLY by the always-on `GroupStandingsNode`
 * (`GroupTableNode.tsx:109-120`), living inside the scaled, VIRTUALIZED
 * `.react-flow__viewport` (`onlyRenderVisibleElements`). At the NARROW first-load
 * camera set by `setViewportSize({320|375|768})` the Group A node is virtualized
 * OUT of the render window — empirically, at 320px only ~8 nodes mount and ZERO
 * standings openers are attached — so it is not merely off-viewport, it is NEVER
 * MOUNTED. (Contrast `standings-overlay-focus.spec.ts`, which opens the same button
 * fine at the DEFAULT desktop viewport where the node IS in the window.) The fixed
 * open path therefore has THREE deterministic, TEST-ONLY steps (zero app change):
 *   1. FRAME the Group A node into the render window so its opener ATTACHES —
 *      `frameGroupAIntoView` widens the page to a desktop frame (where every
 *      column mounts) and presses the app's built-in `F` = fitView shortcut
 *      (`useBracketKeyboard`), a deterministic camera re-frame; first-load framing
 *      alone never surfaces it (a bare `focus()` cannot focus a detached node).
 *   2. KEYBOARD-activate it (`focus()` -> `toBeFocused()` -> `press('Enter')`), the
 *      transform-independent path `timeline-grid.spec.ts` uses — a native button
 *      fires `click` on Enter regardless of canvas transform, with no
 *      `toBeInViewport()`/mouse hit-test dependency. This sets `openGroup='A'` in
 *      React state, opening the dialog.
 *   3. RESTORE the target viewport so the compact/full split + every assertion run
 *      at the INTENDED width. `openGroup` is React state (camera-independent) so the
 *      dialog stays open across the resize, and `StandingsOverlay`'s `compact`
 *      flips reactively via `useMobileViewport`'s `matchMedia('max-width:640px')`
 *      listener — compact below 640 (320/375), full at 768.
 * The dialog itself (`StandingsOverlay`) renders OUTSIDE the scaled viewport, so
 * once open it is directly assertable.
 *
 * Once open (at the restored target width) we assert the dialog is visible, its
 * close button is in-viewport (the in-card `top-1.5 right-1.5` placement must not
 * push it off a 320px screen), and the document has no horizontal overflow — then
 * snapshot the structural overlay (flags masked).
 *
 * RED until StandingsOverlay is viewport-bounded + uses the compact column set on
 * mobile: today the 296px card + its close button can exceed a 320px viewport
 * (close button off-screen / horizontal overflow). The keyboard-open contract above
 * is the deterministic SETUP the implementer must keep satisfied.
 */

/**
 * A desktop frame at which EVERY group column — including the leftmost Group A —
 * is inside React Flow's render window (so its opener mounts under
 * `onlyRenderVisibleElements`). Wider than `MOBILE_MAX_WIDTH` so the overlay opens
 * non-compact here; the caller restores the narrow target before snapshotting.
 */
const FRAME_VIEWPORT = { width: 1440, height: 900 } as const;

/**
 * Deterministic, TEST-ONLY framing of the Group A standings node into the render
 * window so its opener ATTACHES (it is virtualized OUT at the narrow first-load
 * camera — see block comment). Widens the page to {@link FRAME_VIEWPORT} (where
 * every column mounts) and drives the app's built-in `F` = fitView shortcut
 * (`useBracketKeyboard`, a `window` keydown listener) to re-frame the whole graph.
 *
 * SELF-VERIFYING re-frame (no fire-and-forget). On a genuinely COLD first build the
 * single `F` press can race the initial camera frame / the `useBracketKeyboard`
 * effect's listener registration, so the `fitView` never lands and the Group A
 * opener never mounts. To close that race deterministically — and with NO fixed
 * timeout — this:
 *   1. FOCUSES the React Flow pane first (`.react-flow__pane`, the canvas's
 *      keyboard surface) so the `keydown` originates from inside the app and can
 *      never be dropped because focus sat on the body/an unfocusable node; the pane
 *      is also not an INPUT/contentEditable, so the handler's early-return guard
 *      (`useBracketKeyboard.ts:10`) can never swallow the press.
 *   2. POLLS until the opener is attached, RE-ISSUING `F` each interval and waiting
 *      for the viewport transform to come to rest between presses (`settle`). The
 *      poll predicate IS the success signal (opener attached after a settled
 *      re-frame), so a single missed press self-heals on the next interval instead
 *      of failing the gate. No pane *coordinate* click — that could land on a match
 *      card and open its detail panel, contaminating the snapshot; `focus()` moves
 *      keyboard focus without a hit-test.
 */
async function frameGroupAIntoView(page: Page): Promise<void> {
  await page.setViewportSize(FRAME_VIEWPORT);

  const pane = page.locator('.react-flow__pane');
  const opener = page.getByRole('button', { name: 'Open Group A standings' });

  // Self-verifying re-frame: focus the pane, press F, let the camera settle, and
  // confirm the opener attached — re-issuing F (idempotent fitView) until it does.
  // The poll terminates on attachment, so a cold-start miss is retried, not fatal.
  await expect
    .poll(
      async () => {
        await pane.focus().catch(() => {});
        await page.keyboard.press('F');
        await settle(page);
        return opener.count();
      },
      {
        message:
          'the Group A standings opener must ATTACH after an F=fitView re-frame at the desktop frame (it is virtualized out at the narrow first-load camera)',
        timeout: 15_000,
        intervals: [200, 300, 400, 500],
      },
    )
    .toBeGreaterThan(0);
}

/**
 * Deterministically open the Group A standings overlay and return the open dialog
 * locator. Encodes the full open contract, in the order it must hold:
 *   1. opener ATTACHED — the Group A node is virtualized OUT of the render window at
 *      the narrow first-load camera (see block comment), so `framedReady` must frame
 *      the Group A region (camera move / fitView) first or this fails here.
 *      `frameGroupAIntoView` already polls the opener to attachment, so this
 *      `toBeAttached` is an explicit re-statement of that contract, not the wait.
 *   2. opener is a real native BUTTON (fires click on Enter/Space intrinsically) —
 *      pins WHY keyboard activation suffices, never a div-with-click-handler.
 *   3. KEYBOARD-activate (`focus()` -> `toBeFocused()` -> `press('Enter')`) — the
 *      transform-independent path from `standings-overlay-focus.spec.ts` /
 *      `timeline-grid.spec.ts`; no `toBeInViewport`/mouse hit-test, no fixed timeout.
 * Shared by all three breakpoints so the open contract is written (and tuned) once.
 *
 * NOTE: `framedReady` lets a caller hand in the framing step (here
 * `frameGroupAIntoView`) before the opener is reached; the default no-op leaves the
 * helper RED at step 1 if no framing is supplied.
 */
async function openGroupAStandings(
  page: Page,
  framedReady: () => Promise<void> = async () => {},
): Promise<Locator> {
  await framedReady();
  const opener = page.getByRole('button', { name: 'Open Group A standings' });
  await expect(
    opener,
    'the Group A standings opener must be ATTACHED (frame its node into the render window first; it is virtualized out at the narrow first-load camera)',
  ).toBeAttached({ timeout: 10_000 });
  await expect(opener).toHaveJSProperty('tagName', 'BUTTON');
  await opener.focus();
  await expect(opener).toBeFocused();
  await opener.press('Enter');
  return page.getByRole('dialog', { name: 'Group A standings' });
}

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

      // DETERMINISTIC open (requirement 2026-06-24-1453), test-only: frame the
      // virtualized-out Group A node in (widen + the app's built-in `F` fitView),
      // then keyboard-activate the native opener <button> — transform-independent,
      // no in-viewport/mouse hit-test dependency. Opens at the wide frame width.
      const dialog = await openGroupAStandings(page, () => frameGroupAIntoView(page));
      await expect(dialog).toBeVisible();

      // Restore the target viewport so the compact/full split + every assertion run
      // at the INTENDED width. `openGroup` is React state (camera-independent) so the
      // dialog stays open across the resize; `StandingsOverlay`'s `compact` flips via
      // `useMobileViewport`'s matchMedia listener (compact ≤640 → 320/375, full 768).
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await settle(page);

      // The dialog must be visible and bounded within the viewport.
      await expect(dialog).toBeVisible();

      // The close button must be reachable without scrolling (the in-card
      // `top-1.5 right-1.5` placement must not push it off a 320px screen).
      const closeBtn = dialog.getByRole('button', { name: 'Close standings' });
      await expect(closeBtn).toBeVisible();
      await expect(closeBtn).toBeInViewport();

      // requirement 1031 — vertical fit (AC #3): at 320×720 the open dialog must
      // also fit VERTICALLY. A density bump (larger header glyph + table font) that
      // net-grows the card so it clips top/bottom under the `grid place-items-center`
      // backdrop now fails loudly. Gated to the 320×720 case (the densest, named
      // acceptance width); the binary-fit overflow check below covers all widths.
      if (bp.width === 320 && bp.height === 720) {
        const VERTICAL_FIT_EPSILON = 1;
        const box = await dialog.boundingBox();
        expect(box, 'the open standings dialog should have a bounding box at 320px').not.toBeNull();
        expect(
          box!.y + box!.height,
          `the open dialog bottom (${box!.y + box!.height}px) must fit within the ${bp.height}px viewport at 320×720`,
        ).toBeLessThanOrEqual(bp.height + VERTICAL_FIT_EPSILON);
      }

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

/**
 * Canvas standings row — full-row focus-team tap target, no mis-tap under zoom
 * (requirement 2026-06-24-1030; plan Test Strategy 7 / Acceptance #1, #2).
 *
 * The canvas standings rows live under `.react-flow__viewport { transform:
 * scale(zoom) }`. At the mobile zoom floor (0.32) on a 320px screen the BASELINE
 * per-flag focus button is only ~5.76px wide on-screen — far below the 44px touch
 * minimum — and the prior counter-scale attempt mis-tapped 3 of 4 rows. The fix
 * makes each row's focus-team control a single full-row-spanning <button> (the
 * <tr> is the sole `position: relative` containing block; an `absolute inset-0`
 * button resolves against it → ~94px-wide on-screen at 0.32, zero overlap).
 *
 * This block asserts BOTH halves of the contract on a REAL touch tap, on the
 * coarse-pointer `mobile` (iPhone 13) project ONLY (the inverse of the
 * self-driven-viewport skip the other blocks use):
 *   (a) WIDTH — the row button's live post-transform `boundingBox().width` is
 *       >= 44 - 0.5 CSS px. This is the primary RED signal (baseline ~5.76px) AND
 *       the guard that the `<tr>`-resolved `inset-0` actually stretched the button
 *       to full-row width in real Chromium (a Team-cell containing block would be
 *       ~12px → RED). No height assertion (accepted geometric limit at the floor).
 *   (b) TAP → CORRECT TEAM — tapping the TOP row and a MIDDLE row focuses THAT
 *       row's team each time, verified via the `role="status"` live region
 *       ("Showing matches for {team}", RoadmapCanvas.tsx:218-220), never a
 *       neighbour. This is the no-mis-tap pin the size-only test structurally
 *       could not make.
 *
 * Deterministic waits only; no new screenshot ⇒ no new snapshot baseline.
 *
 * NOTE: Playwright browsers may be unavailable in the sandbox/CI image; this spec
 * runs under `npm run test:e2e` (not the unit `vitest` gate). Document, do not
 * fail the unit gate, when browsers cannot launch here.
 */
/** Minimum on-screen tap-target width (CSS px); ε absorbs sub-pixel transform noise. */
const TAP_TARGET_MIN_WIDTH = 44;
const TAP_TARGET_EPSILON = 0.5;

/** Read a row button's OWN team name straight from its accessible name. */
async function teamFromButton(button: Locator): Promise<string> {
  const label = (await button.getAttribute('aria-label')) ?? '';
  return label.replace(/^Show matches for\s+/, '').trim();
}

/** Escape a team name for safe use inside a RegExp (e.g. "Saudi Arabia"). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('canvas standings row — full-row focus-team target, no mis-tap under zoom', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile',
      'coarse-pointer/touch path only (iPhone 13); other projects drive their own viewport',
    );
  });

  test('top + middle row buttons are >=44px wide and tap the CORRECT team at 320px/0.32', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
    await settle(page);

    // Worst case: assert the settled scale is AT the mobile floor (densest rows).
    const scale = await readScale(page);
    expect(
      scale,
      `settled scale (${scale}) must be at the MOBILE_MIN_ZOOM floor (${MOBILE_MIN_ZOOM}) so the densest rows are exercised`,
    ).toBeGreaterThanOrEqual(MOBILE_MIN_ZOOM - ZOOM_FLOOR_EPSILON);
    expect(scale).toBeLessThanOrEqual(MOBILE_MIN_ZOOM + 0.05);

    // Scope under the group-standings region (the `<section aria-label="Group …
    // standings">` → role="region"). The standings tables are the TOP row of every
    // column, so first-load top-aligned framing renders Group A on-screen. Assert
    // it is genuinely in-viewport BEFORE interacting (never act on an offscreen,
    // virtualized node).
    const standings = page.getByRole('region', { name: /standings/ }).first();
    await expect(standings).toBeInViewport();

    // The row-spanning focus buttons, addressed by their stable accessible name
    // within the region (excludes the TeamRow match-card flags elsewhere).
    const rowButtons = standings.getByRole('button', { name: /^Show matches for/ });
    await expect(rowButtons.first()).toBeVisible({ timeout: 10_000 });
    expect(
      await rowButtons.count(),
      'a group standings table should expose at least 3 row focus buttons (top + middle reachable)',
    ).toBeGreaterThanOrEqual(3);

    const status = page.getByRole('status');

    // Indices 0 (TOP row) and 2 (a MIDDLE row) of the 4 mock rows. For each:
    // measure the on-screen width, read its OWN team from the aria-label, tap, and
    // assert the live region names THAT team (and not a neighbour). Focus is
    // cleared between taps (Esc) so the second assertion is independent.
    for (const rowIndex of [0, 2]) {
      const button = rowButtons.nth(rowIndex);
      await expect(button).toBeInViewport();

      const team = await teamFromButton(button);
      expect(team, `row ${rowIndex} should carry a team name in its aria-label`).not.toBe('');

      // (a) WIDTH — post-transform on-screen rect in CSS px (deviceScaleFactor: 3
      // does NOT inflate it). Baseline per-flag button ~5.76px → RED.
      const box = await button.boundingBox();
      expect(box, `row ${rowIndex} focus button should have a bounding box`).not.toBeNull();
      expect(
        box!.width,
        `row ${rowIndex} (${team}) focus button on-screen width (${box!.width}px) must be >= ${TAP_TARGET_MIN_WIDTH} - ${TAP_TARGET_EPSILON} CSS px at 320px/0.32`,
      ).toBeGreaterThanOrEqual(TAP_TARGET_MIN_WIDTH - TAP_TARGET_EPSILON);

      // (b) TAP → CORRECT TEAM — a coarse-pointer tap at the button centre.
      await button.click();
      await expect(status, `tapping row ${rowIndex} must focus ${team} (no mis-tap)`).toHaveText(
        new RegExp(`Showing matches for ${escapeRegExp(team)}`),
      );

      // Clear focus so the next row's assertion is independent of this one.
      await page.keyboard.press('Escape');
      await expect(status).toHaveText('');
    }
  });

  test('adjacent row buttons tile with ZERO vertical overlap at 320px/0.32 (the original mis-tap defect)', async ({
    page,
  }) => {
    // The original defect was a 44px-TALL hit box overlapping ~3 neighbours at the
    // floor, so a tap landed on the WRONG row's control. The row-as-target fix gives
    // each button its OWN `<tr>` band (`absolute inset-0`), so adjacent buttons must
    // NOT overlap vertically — a deterministic geometric pin (boundingBoxes only, no
    // timing). RED at baseline only via the width assertion alongside it; this
    // overlap pin documents the no-overlap guarantee the fix relies on.
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
    await settle(page);

    const scale = await readScale(page);
    expect(
      scale,
      `settled scale (${scale}) must be at the MOBILE_MIN_ZOOM floor so the densest rows are exercised`,
    ).toBeGreaterThanOrEqual(MOBILE_MIN_ZOOM - ZOOM_FLOOR_EPSILON);
    expect(scale).toBeLessThanOrEqual(MOBILE_MIN_ZOOM + 0.05);

    const standings = page.getByRole('region', { name: /standings/ }).first();
    await expect(standings).toBeInViewport();

    const rowButtons = standings.getByRole('button', { name: /^Show matches for/ });
    await expect(rowButtons.first()).toBeVisible({ timeout: 10_000 });
    const count = await rowButtons.count();
    expect(count, 'need at least 2 rows to compare adjacent bands').toBeGreaterThanOrEqual(2);

    // Each on-screen band must be at least the ≥44px-wide full-row target AND must
    // start at/below the previous band's bottom — i.e. no vertical overlap. We
    // compare consecutive in-viewport rows by their measured boxes only.
    let previousBottom = Number.NEGATIVE_INFINITY;
    let previousTeam = '';
    let compared = 0;
    for (let i = 0; i < count; i += 1) {
      const button = rowButtons.nth(i);
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      if (!box) continue;
      const team = await teamFromButton(button);

      expect(
        box.width,
        `row ${i} (${team}) on-screen width (${box.width}px) must be the full-row ≥44px target`,
      ).toBeGreaterThanOrEqual(TAP_TARGET_MIN_WIDTH - TAP_TARGET_EPSILON);

      if (previousBottom !== Number.NEGATIVE_INFINITY) {
        // This row's TOP must be at/after the previous row's BOTTOM (allowing a
        // sub-pixel ε): the two bands do not overlap, so a tap inside band N can
        // only hit row N. A negative gap is the exact original mis-tap defect.
        expect(
          box.y,
          `row ${i} (${team}) must not overlap the previous row (${previousTeam}): top ${box.y} >= prev bottom ${previousBottom}`,
        ).toBeGreaterThanOrEqual(previousBottom - TAP_TARGET_EPSILON);
        compared += 1;
      }
      previousBottom = box.y + box.height;
      previousTeam = team;
    }
    expect(compared, 'should have compared at least one adjacent row pair').toBeGreaterThanOrEqual(
      1,
    );
  });
});

/**
 * Match-card team row — full-row focus-team target, no mis-tap under zoom
 * (requirement 2026-06-24-1421; plan Test Strategy 7 / Acceptance #1, #2).
 *
 * Sibling of the standings block above: the MatchNode team rows ALSO live under
 * `.react-flow__viewport { transform: scale(zoom) }`, and at the 0.32 floor the
 * BASELINE per-flag focus button is only ~7px wide on-screen (the 22px glyph ×
 * 0.32) — far below the 44px touch minimum, and this control never even received
 * the 1336 coarse-pointer slop. The fix makes each TeamRow's focus-team control a
 * single full-row-spanning <button> (the grid <div> is the sole `position:
 * relative` containing block; an `absolute inset-0` button resolves against it →
 * ~75px-wide on-screen at 0.32, zero overlap between the two stacked rows).
 *
 * This block asserts the contract on a REAL touch tap, on the coarse-pointer
 * `mobile` (iPhone 13) project ONLY (the inverse self-driven-viewport skip),
 * scoped to a MatchNode card <article> (NOT the standings <section role=region>,
 * which shares the `Show matches for` accessible name):
 *   (a) WIDTH — a resolved-team row button's live post-transform
 *       `boundingBox().width` is >= 44 - 0.5 CSS px. Primary RED signal (baseline
 *       ~7px) AND the guard that the grid-<div>-resolved `inset-0` actually
 *       stretched to full-row width in real Chromium. No height assertion
 *       (accepted geometric limit: a 108px card × 0.32 ≈ 35px holds two rows).
 *   (b) TAP → CORRECT TEAM — tapping the HOME row and the AWAY row of one card
 *       focuses THAT row's team each time, via the `role="status"` live region
 *       ("Showing matches for {team}", RoadmapCanvas.tsx ~218-220), never the
 *       sibling. The no-mis-tap pin the size-only test structurally cannot make.
 *   (c) ZERO OVERLAP — the away row button's top >= the home button's bottom
 *       (sub-pixel ε), so a tap in one band cannot hit the other's control.
 *
 * Determinism (plan L1): MatchNode cards are virtualized React Flow nodes, so we
 * pick the FIRST in-viewport card <article> that exposes exactly TWO `Show
 * matches for` buttons (both teams resolved) and assert `toBeInViewport()` before
 * interacting — never act on an offscreen node. Deterministic waits only; no new
 * screenshot ⇒ no new snapshot baseline.
 *
 * NOTE: Playwright browsers may be unavailable in the sandbox/CI image; this spec
 * runs under `npm run test:e2e` (not the unit `vitest` gate). Document, do not
 * fail the unit gate, when browsers cannot launch here.
 */

/**
 * The first in-viewport MatchNode card (an <article>) that exposes EXACTLY TWO
 * row focus buttons (both teams resolved). Returns the card locator and its two
 * row buttons in DOM order (home first, away second). Skips the test loudly if no
 * such card is framed at first-load 320px (a relayout regression, not a flake).
 */
async function firstResolvedMatchCard(page: Page): Promise<{
  card: Locator;
  rowButtons: Locator;
} | null> {
  const articles = page.getByRole('article');
  const total = await articles.count();
  for (let i = 0; i < total; i += 1) {
    const card = articles.nth(i);
    if (!(await card.isVisible())) continue;
    const rowButtons = card.getByRole('button', { name: /^Show matches for/ });
    if ((await rowButtons.count()) !== 2) continue;
    // BOTH row buttons (home + away) must be on-screen so the width + tap
    // assertions can actually run against this card (never act on an offscreen,
    // virtualized node). A card framed at the viewport edge with a clipped row is
    // skipped in favour of a fully-on-screen one.
    const home = rowButtons.nth(0);
    const away = rowButtons.nth(1);
    const homeRatio = await home.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight ? 1 : 0;
    });
    const awayRatio = await away.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight ? 1 : 0;
    });
    if (homeRatio === 1 && awayRatio === 1) {
      return { card, rowButtons };
    }
  }
  // No fully on-screen resolved card at the first-load 320px frame: a relayout
  // regression, NOT a flake. Return null so the caller skips LOUDLY rather than
  // failing — a hard failure here is indistinguishable from real infra breakage.
  return null;
}

/**
 * Load the mock canvas at 320px, wait for nodes + the settled transform, and
 * assert the live `.react-flow__viewport` scale is AT the MOBILE_MIN_ZOOM floor
 * (densest rows — the worst case for the ≥44px target). Shared by the match-card
 * block's two tests so the scale-settle guard is written (and tuned) exactly
 * once; ε and the [floor, floor+0.05] window are NOT relaxed. Returns nothing —
 * each test then locates its own card.
 */
async function gotoMobileFloor(page: Page): Promise<void> {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
  await settle(page);

  const scale = await readScale(page);
  expect(
    scale,
    `settled scale (${scale}) must be at the MOBILE_MIN_ZOOM floor (${MOBILE_MIN_ZOOM}) so the densest rows are exercised`,
  ).toBeGreaterThanOrEqual(MOBILE_MIN_ZOOM - ZOOM_FLOOR_EPSILON);
  expect(
    scale,
    `settled scale (${scale}) must sit at the floor (<= ${MOBILE_MIN_ZOOM + 0.05}), not zoomed-in`,
  ).toBeLessThanOrEqual(MOBILE_MIN_ZOOM + 0.05);
}

test.describe('match-card team row — full-row focus-team target, no mis-tap under zoom', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile',
      'coarse-pointer/touch path only (iPhone 13); other projects drive their own viewport',
    );
  });

  test('home + away row buttons are >=44px wide and tap the CORRECT team at 320px/0.32', async ({
    page,
  }) => {
    await gotoMobileFloor(page);

    // Pick the first in-viewport match card whose BOTH teams are resolved (two row
    // buttons), scoped to the <article> so the standings region's identically-named
    // buttons are never matched.
    const found = await firstResolvedMatchCard(page);
    test.skip(
      found === null,
      'no fully on-screen resolved match card at 320px first-load (relayout regression, not a flake)',
    );
    const { card, rowButtons } = found!;
    await expect(card).toBeInViewport();
    expect(await rowButtons.count(), 'a resolved match card exposes two row focus buttons').toBe(2);

    const status = page.getByRole('status');

    // Read both rows' own team names up front so each tap can assert the live
    // region names THAT row's team AND explicitly NOT the sibling's (the negative
    // half of the no-mis-tap pin). The two teams must be distinct, else the
    // "not the sibling" assertion would be vacuous on this card.
    const homeTeam = await teamFromButton(rowButtons.nth(0));
    const awayTeam = await teamFromButton(rowButtons.nth(1));
    expect(homeTeam, 'home row should carry a team name in its aria-label').not.toBe('');
    expect(awayTeam, 'away row should carry a team name in its aria-label').not.toBe('');
    expect(
      awayTeam,
      'the chosen card must have two DISTINCT teams for the no-mis-tap pin',
    ).not.toBe(homeTeam);

    // Index 0 = HOME row, index 1 = AWAY row. For each: measure the on-screen
    // width, tap, and assert the live region names THAT team and not the sibling.
    // Focus is cleared between taps (Esc) so the second assertion is independent.
    // `firstResolvedMatchCard` already guaranteed both row buttons are fully
    // on-screen, so we measure/tap directly — the WIDTH assertion is the primary
    // RED signal (baseline ~7px), never gated behind a flakier viewport-ratio probe.
    for (const rowIndex of [0, 1]) {
      const button = rowButtons.nth(rowIndex);
      const team = rowIndex === 0 ? homeTeam : awayTeam;
      const sibling = rowIndex === 0 ? awayTeam : homeTeam;
      const rowName = rowIndex === 0 ? 'home' : 'away';

      // (a) WIDTH — post-transform on-screen rect in CSS px (deviceScaleFactor: 3
      // does NOT inflate it). Baseline per-flag button ~7px → RED.
      const box = await button.boundingBox();
      expect(box, `${rowName} row focus button should have a bounding box`).not.toBeNull();
      expect(
        box!.width,
        `${rowName} row (${team}) focus button on-screen width (${box!.width}px) must be >= ${TAP_TARGET_MIN_WIDTH} - ${TAP_TARGET_EPSILON} CSS px at 320px/0.32`,
      ).toBeGreaterThanOrEqual(TAP_TARGET_MIN_WIDTH - TAP_TARGET_EPSILON);

      // (b) TAP → CORRECT TEAM — a coarse-pointer tap at the button centre focuses
      // THIS row's team and NOT the sibling's (no mis-tap, both halves pinned).
      await button.click();
      await expect(status, `tapping the ${rowName} row must focus ${team} (no mis-tap)`).toHaveText(
        new RegExp(`Showing matches for ${escapeRegExp(team)}`),
      );
      await expect(
        status,
        `tapping the ${rowName} row must NOT focus the sibling ${sibling}`,
      ).not.toHaveText(new RegExp(`Showing matches for ${escapeRegExp(sibling)}`));

      // Clear focus so the next row's assertion is independent of this one.
      await page.keyboard.press('Escape');
      await expect(status).toHaveText('');
    }
  });

  test('the two stacked row buttons tile with ZERO vertical overlap at 320px/0.32', async ({
    page,
  }) => {
    // The 1030 mis-tap defect was a hit box overlapping a neighbour so a tap landed
    // on the WRONG row's control. The row-as-target fix gives each button its OWN
    // grid-<div> band (`absolute inset-0`), so the home and away buttons must NOT
    // overlap vertically — a deterministic geometric pin (boundingBoxes only, no
    // timing). The away row's top must be at/after the home row's bottom.
    await gotoMobileFloor(page);

    const found = await firstResolvedMatchCard(page);
    test.skip(
      found === null,
      'no fully on-screen resolved match card at 320px first-load (relayout regression, not a flake)',
    );
    const { card, rowButtons } = found!;
    await expect(card).toBeInViewport();

    const homeBox = await rowButtons.nth(0).boundingBox();
    const awayBox = await rowButtons.nth(1).boundingBox();
    expect(homeBox, 'home row button should have a bounding box').not.toBeNull();
    expect(awayBox, 'away row button should have a bounding box').not.toBeNull();

    // Both bands are the full-row ≥44px-wide target.
    expect(
      homeBox!.width,
      `home row on-screen width (${homeBox!.width}px) must be the full-row ≥44px target`,
    ).toBeGreaterThanOrEqual(TAP_TARGET_MIN_WIDTH - TAP_TARGET_EPSILON);
    expect(
      awayBox!.width,
      `away row on-screen width (${awayBox!.width}px) must be the full-row ≥44px target`,
    ).toBeGreaterThanOrEqual(TAP_TARGET_MIN_WIDTH - TAP_TARGET_EPSILON);

    // The away band's TOP must be at/after the home band's BOTTOM (sub-pixel ε): a
    // tap inside the home band can only hit the home control. A negative gap is the
    // exact 1030 mis-tap defect.
    expect(
      awayBox!.y,
      `away row top (${awayBox!.y}) must not overlap the home row bottom (${homeBox!.y + homeBox!.height})`,
    ).toBeGreaterThanOrEqual(homeBox!.y + homeBox!.height - TAP_TARGET_EPSILON);
  });
});
