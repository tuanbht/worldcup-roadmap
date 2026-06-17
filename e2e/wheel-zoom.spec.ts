import { expect, test, type Page } from '@playwright/test';

/**
 * Wheel-zoom interaction (Acceptance #2, #11).
 *
 * The canvas runs with `panOnScroll`, so a plain wheel PANS; zoom uses React
 * Flow's pinch/ctrl path. In @xyflow/system's panOnScroll handler, a wheel with
 * `ctrlKey: true` is treated as a pinch-zoom (verified in the system source:
 * `createPanOnScrollHandler` → `if (event.ctrlKey && zoomOnPinch)`), so this
 * spec dispatches ctrl+wheel and asserts the viewport transform scale, never a
 * pan offset. Real clamps under test: minZoom=0.2, maxZoom=1.8.
 *
 * Deterministic: we poll the transform until it stabilizes (two equal reads)
 * rather than using arbitrary timeouts.
 */

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.8;
const VIEWPORT = '.react-flow__viewport';

/** Parse the scale (a/d) out of the viewport's CSS transform matrix. */
async function readScale(page: Page): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return NaN;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 1;
    const m = new DOMMatrixReadOnly(t);
    return m.a; // uniform scale → a === d
  }, VIEWPORT);
}

/** Wait until the viewport transform settles (covers the 60ms+400ms fit). */
async function waitForStableScale(page: Page): Promise<number> {
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
  return last;
}

/** Dispatch a ctrl+wheel over the canvas centre — the RF zoom path. */
async function ctrlWheel(page: Page, deltaY: number, repeat: number): Promise<void> {
  const pane = page.locator('.react-flow__pane, .react-flow__renderer').first();
  const box = await pane.boundingBox();
  if (!box) throw new Error('canvas pane not found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (let i = 0; i < repeat; i += 1) {
    await page.mouse.move(cx, cy);
    await page.dispatchEvent(VIEWPORT, 'wheel', {
      deltaY,
      clientX: cx,
      clientY: cy,
      ctrlKey: true,
      bubbles: true,
    });
  }
}

test.describe('wheel zoom', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?view=bracket');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
    await waitForStableScale(page);
  });

  test('zooming in raises the scale and clamps at maxZoom (1.8)', async ({ page }) => {
    const start = await readScale(page);
    await ctrlWheel(page, -120, 4);
    const zoomed = await waitForStableScale(page);
    expect(zoomed).toBeGreaterThan(start);

    // Keep zooming hard — must never exceed the maxZoom clamp.
    await ctrlWheel(page, -240, 30);
    const clamped = await waitForStableScale(page);
    expect(clamped).toBeLessThanOrEqual(MAX_ZOOM + 1e-3);
    expect(clamped).toBeGreaterThan(MAX_ZOOM - 0.25);
  });

  test('zooming out lowers the scale and clamps at minZoom (0.2)', async ({ page }) => {
    await ctrlWheel(page, -120, 6); // zoom in first so there is room to fall
    const high = await waitForStableScale(page);

    await ctrlWheel(page, 240, 40);
    const low = await waitForStableScale(page);
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThanOrEqual(MIN_ZOOM - 1e-3);
    expect(low).toBeLessThan(MIN_ZOOM + 0.25);
  });

  test('a plain wheel (no ctrl) does not zoom under panOnScroll', async ({ page }) => {
    const before = await readScale(page);
    await page.mouse.move(400, 400);
    await page.dispatchEvent(VIEWPORT, 'wheel', {
      deltaY: -120,
      clientX: 400,
      clientY: 400,
      bubbles: true,
    });
    const after = await waitForStableScale(page);
    expect(Math.abs(after - before)).toBeLessThan(0.05);
  });
});
