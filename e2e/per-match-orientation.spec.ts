import { expect, test, type Page } from '@playwright/test';

/**
 * Continuous per-match canvas smoke (Acceptance #11).
 *
 * The default route renders ONE continuous canvas: a horizontal group band
 * (one card per group match, labelled "Group X · MD#") flowing into the vertical
 * knockout (Final at the bottom). This spec proves both phases are reachable in
 * the DOM after a load and a ctrl+wheel zoom.
 *
 * The canvas uses `panOnScroll`, so a plain wheel PANS; only ctrl+wheel zooms
 * (the RF pinch path) — we reuse the helper shape from wheel-zoom.spec.ts.
 *
 * NOTE: browsers may be unavailable in this sandbox; the spec is committed and
 * runs under `npm run test:e2e` locally / in CI. Document the gap if it cannot
 * execute here.
 */

const VIEWPORT = '.react-flow__viewport';

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

test.describe('per-match continuous canvas', () => {
  test('load + ctrl-wheel zoom: a group match card and the Final are both reachable', async ({
    page,
  }) => {
    await page.goto('/');
    // Canvas mounts.
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // Zoom out so the whole continuous canvas (tall) is in the DOM, then back in.
    await ctrlWheel(page, 240, 6);
    await ctrlWheel(page, -120, 2);

    // A group-stage match card renders a "Group X · MD#" label.
    const groupCard = page.getByText(/Group [A-L].*MD\d/).first();
    await expect(groupCard).toBeAttached({ timeout: 10_000 });

    // The Final node is reachable via its stable data attribute.
    const finalNode = page.locator('[data-final="true"]');
    await expect(finalNode).toBeAttached({ timeout: 10_000 });
  });
});
