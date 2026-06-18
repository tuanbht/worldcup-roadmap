import { expect, test, type Page } from '@playwright/test';

/**
 * Timeline-grid canvas smoke (requirement "Verification" / plan Acceptance #16).
 *
 * The default route renders ONE continuous timeline grid: a left DATE RAIL
 * (one "11 Jun"-style marker per day), A..L GROUP-HEADER columns across the top,
 * each group's matches in its column at the right day-row (labelled
 * "Group X · MD#"), and the knockout funnel descending to a centered Final on
 * the last day. This spec proves the FIRST day's group matches and the Final are
 * both reachable in the DOM after a load.
 *
 * The canvas uses `panOnScroll`, so a plain wheel PANS; only ctrl+wheel zooms
 * (the RF pinch path) — we reuse the helper shape from per-match-orientation.spec.ts.
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

test.describe('timeline-grid canvas', () => {
  test('a Jun-11 group match node and the Final node are both reachable', async ({ page }) => {
    await page.goto('/');
    // Canvas mounts.
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // Zoom out so the whole tall timeline is in the DOM, then back in.
    await ctrlWheel(page, 240, 6);
    await ctrlWheel(page, -120, 2);

    // The Jun-11 date marker (left rail guide for the first match-day).
    await expect(page.getByText('11 Jun').first()).toBeAttached({ timeout: 10_000 });

    // A Group A match card (first-column, first-day group match) is reachable.
    await expect(page.getByText(/Group A.*MD\d/).first()).toBeAttached({ timeout: 10_000 });

    // The Final node is reachable via its stable data attribute (center-bottom).
    await expect(page.locator('[data-final="true"]')).toBeAttached({ timeout: 10_000 });
  });
});
