import { expect, test } from '@playwright/test';

/**
 * Targeted geometry spec for the "go to current/live match" control
 * (`src/components/roadmap/FocusMatchButton.tsx`; req 2026-06-23-1518; plan
 * Acceptance #1, #2, #3). The control keeps ONE <button> with a stable
 * `aria-label` ("Go to live/current match") across breakpoints; only its shape
 * and anchoring change responsively:
 *
 *   - below md (< 768px): a ~48px (h-12 w-12) rounded-full bottom-right ICON
 *     BUBBLE — icon only, the text label visually hidden (sr-only);
 *   - at >= md: the unchanged top-center WIDE PILL with its visible label.
 *
 * We assert this via bounding-box geometry per Playwright project rather than a
 * shared full-page snapshot, per the pipeline concurrency guardrail (a concurrent
 * run is editing the shared roadmap/visual snapshots — this spec adds NO snapshot
 * and does not run `test:e2e:update`).
 *
 * The two configured projects pin the breakpoint:
 *   - `mobile`  → iPhone 13 (390px CSS width, < md) exercises the bubble;
 *   - `chromium`→ 1440px (>= md) exercises the desktop pill.
 *
 * Deterministic waits only (`toBeVisible`, `expect.poll`) — no fixed timeouts.
 *
 * RED until the GREEN stage adds the `max-md:` responsive overrides: today the
 * control is the top-center pill at EVERY width, so below md the box is wide /
 * top-anchored (not a ~48px bottom-right square) and the label stays visible.
 *
 * NOTE: Playwright browsers may be unavailable in the sandbox/CI image; this spec
 * runs under `npm run test:e2e` (not the unit `vitest` gate). Document, do not
 * fail the unit gate, when browsers cannot launch here.
 */

/**
 * The single control, addressed by its STABLE accessible name. Anchored so it
 * resolves ONLY the focus control and not the many "Show matches for X" standings
 * buttons that also contain the word "match".
 */
const CONTROL = { role: 'button' as const, name: /^Go to (live|current) match$/ };

/** Project name → which layout that viewport should render. */
function isMobileProject(projectName: string): boolean {
  return projectName === 'mobile';
}

test.describe('FocusMatchButton — responsive geometry [Acceptance #1, #2, #3]', () => {
  test('the control renders on the canvas with a stable accessible name', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    const control = page.getByRole(CONTROL.role, { name: CONTROL.name });
    await expect(control).toBeVisible({ timeout: 10_000 });
    // One stable control — never a per-breakpoint pair of buttons.
    await expect(page.getByRole(CONTROL.role, { name: CONTROL.name })).toHaveCount(1);
  });

  test('below md it is a ~48px bottom-right icon bubble; at >=md a wide top-center pill', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    const control = page.getByRole(CONTROL.role, { name: CONTROL.name });
    await expect(control).toBeVisible({ timeout: 10_000 });

    const viewport = page.viewportSize();
    expect(viewport, 'a viewport size should be configured for this project').not.toBeNull();
    const { width: vw, height: vh } = viewport!;

    const box = await control.boundingBox();
    expect(box, 'the control should have a measurable bounding box').not.toBeNull();
    const { x, y, width, height } = box!;

    if (isMobileProject(testInfo.project.name)) {
      // AC #1: ~48px (h-12 w-12) square. Allow a small tolerance for borders.
      expect(width).toBeGreaterThanOrEqual(44);
      expect(width).toBeLessThanOrEqual(56);
      expect(height).toBeGreaterThanOrEqual(44);
      expect(height).toBeLessThanOrEqual(56);
      // Roughly circular: width ≈ height (a pill would be far wider than tall).
      expect(Math.abs(width - height)).toBeLessThanOrEqual(6);

      // Anchored bottom-RIGHT: the box hugs the right and bottom edges. xyflow's
      // 15px panel margin plus the safe-area inset (0px in the notch-less emulator)
      // leave a small gap, so allow up to ~40px of clearance from each edge.
      const rightGap = vw - (x + width);
      const bottomGap = vh - (y + height);
      expect(rightGap, 'bubble should hug the right edge').toBeGreaterThanOrEqual(0);
      expect(rightGap, 'bubble should not drift far from the right edge').toBeLessThanOrEqual(40);
      expect(bottomGap, 'bubble should hug the bottom edge').toBeGreaterThanOrEqual(0);
      expect(bottomGap, 'bubble should not drift far from the bottom edge').toBeLessThanOrEqual(40);

      // AC #1: icon only — the label is visually hidden via `sr-only` (a ~1×1
      // clipped box) yet kept in the DOM for assistive tech (not display:none, not
      // removed). `toBeHidden()` is the wrong check here: an sr-only element has a
      // non-empty 1×1 box and visibility:visible, so Playwright reports it visible.
      const label = page.getByText(/^(Current|Live) match$/);
      await expect(label).toBeAttached();
      const labelBox = await label.boundingBox();
      expect(labelBox, 'sr-only label kept in the DOM for assistive tech').not.toBeNull();
      expect(
        Math.max(labelBox!.width, labelBox!.height),
        'label visually clipped (sr-only), not rendered as on-screen text',
      ).toBeLessThanOrEqual(2);
    } else {
      // AC #3: unchanged top-center WIDE PILL — clearly wider than tall, label visible.
      expect(width, 'desktop pill should be a wide control').toBeGreaterThan(90);
      expect(width, 'a pill is wider than it is tall').toBeGreaterThan(height);

      // Horizontally centred in the canvas.
      const center = x + width / 2;
      expect(Math.abs(center - vw / 2), 'pill should be horizontally centred').toBeLessThanOrEqual(
        60,
      );
      // Top-anchored: it sits in the UPPER half of the viewport (the canvas starts
      // below the app header), in clear contrast to the bottom-anchored mobile
      // bubble. An exact pixel bound would be brittle to header height changes.
      expect(y + height, 'pill should sit in the upper half of the viewport').toBeLessThan(vh / 2);

      // AC #3: the label text is visible in the pill.
      await expect(page.getByText(/^(Current|Live) match$/)).toBeVisible();
    }
  });
});
