import { expect, test, type Page } from '@playwright/test';

/**
 * Canvas interaction model — fixed wheel-zoom + drag-pan + pinch (no toggle).
 *
 * The Zoom/Pan mode toggle and its `localStorage` preference were removed
 * (requirement: remove-zoom-pan-mode-toggle). The canvas now always uses the
 * standard interaction: a plain mouse wheel zooms cursor-centered + clamped,
 * drag pans, ⌘/Ctrl+wheel and pinch also zoom. There is no mode switch and no
 * persisted `wc-roadmap:interaction-mode` key.
 *
 * We assert the REAL viewport transform matrix (scale via a/d, translate via
 * e/f) and poll until it stabilises (two equal reads) — never an arbitrary
 * timeout. Clamps under test: minZoom=0.2, maxZoom=1.8.
 *
 * Sandbox note: Playwright browsers may be unavailable in-sandbox; this spec is
 * committed and runs under `npm run test:e2e` (`npx playwright install` once).
 */

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.8;
const VIEWPORT = '.react-flow__viewport';
const LEGACY_STORAGE_KEY = 'wc-roadmap:interaction-mode';

interface Transform {
  scale: number;
  x: number;
  y: number;
}

/** Parse scale (a/d) and translate (e/f) out of the viewport transform matrix. */
async function readTransform(page: Page): Promise<Transform> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { scale: NaN, x: NaN, y: NaN };
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return { scale: 1, x: 0, y: 0 };
    const m = new DOMMatrixReadOnly(t);
    return { scale: m.a, x: m.e, y: m.f }; // uniform scale → a === d
  }, VIEWPORT);
}

async function readScale(page: Page): Promise<number> {
  return (await readTransform(page)).scale;
}

/** Wait until the viewport transform settles (covers the 60ms+400ms fit). */
async function waitForStableTransform(page: Page): Promise<Transform> {
  let last = await readTransform(page);
  await expect
    .poll(
      async () => {
        const next = await readTransform(page);
        const stable =
          Math.abs(next.scale - last.scale) < 1e-4 &&
          Math.abs(next.x - last.x) < 1e-2 &&
          Math.abs(next.y - last.y) < 1e-2;
        last = next;
        return stable;
      },
      { timeout: 6000, intervals: [80, 120, 160, 200] },
    )
    .toBe(true);
  return last;
}

async function waitForStableScale(page: Page): Promise<number> {
  return (await waitForStableTransform(page)).scale;
}

/** Centre of the canvas pane in viewport coordinates. */
async function paneCenter(page: Page): Promise<{ x: number; y: number }> {
  const pane = page.locator('.react-flow__pane, .react-flow__renderer').first();
  const box = await pane.boundingBox();
  if (!box) throw new Error('canvas pane not found');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Dispatch repeated wheel events over the canvas centre. */
async function wheel(
  page: Page,
  deltaY: number,
  repeat: number,
  opts: { ctrlKey?: boolean } = {},
): Promise<void> {
  const { x, y } = await paneCenter(page);
  for (let i = 0; i < repeat; i += 1) {
    await page.mouse.move(x, y);
    await page.dispatchEvent(VIEWPORT, 'wheel', {
      deltaY,
      clientX: x,
      clientY: y,
      ctrlKey: opts.ctrlKey ?? false,
      bubbles: true,
    });
  }
}

/** Plain wheel — no modifier. Always zooms now (no pan mode). */
function plainWheel(page: Page, deltaY: number, repeat: number): Promise<void> {
  return wheel(page, deltaY, repeat, { ctrlKey: false });
}

/** ⌘/Ctrl+wheel — also zooms. */
function ctrlWheel(page: Page, deltaY: number, repeat: number): Promise<void> {
  return wheel(page, deltaY, repeat, { ctrlKey: true });
}

async function waitForCanvasReady(page: Page): Promise<void> {
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
  await waitForStableScale(page);
}

async function gotoCanvas(page: Page): Promise<void> {
  await page.goto('/');
  await waitForCanvasReady(page);
}

test.describe('canvas interaction model', () => {
  test.beforeEach(async ({ page }) => {
    await gotoCanvas(page);
  });

  test.describe('no Zoom/Pan toggle or hint', () => {
    test('renders neither the mode toggle nor the "Scroll to zoom" hint', async ({ page }) => {
      await expect(page.getByRole('tab', { name: /^zoom$/i })).toHaveCount(0);
      await expect(page.getByRole('tab', { name: /^pan$/i })).toHaveCount(0);
      await expect(page.getByRole('radio', { name: /^zoom$/i })).toHaveCount(0);
      await expect(page.getByRole('radio', { name: /^pan$/i })).toHaveCount(0);
      await expect(page.getByText(/scroll to zoom/i)).toHaveCount(0);
    });

    test('does not persist an interaction-mode preference', async ({ page }) => {
      const stored = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        LEGACY_STORAGE_KEY,
      );
      expect(stored).toBeNull();
    });
  });

  test.describe('wheel-zoom (always active)', () => {
    test('a plain wheel zooms in and clamps at maxZoom (1.8)', async ({ page }) => {
      const start = await readScale(page);
      await plainWheel(page, -120, 4);
      const zoomed = await waitForStableScale(page);
      expect(zoomed).toBeGreaterThan(start);

      // Keep zooming hard — must never exceed the maxZoom clamp.
      await plainWheel(page, -240, 30);
      const clamped = await waitForStableScale(page);
      expect(clamped).toBeLessThanOrEqual(MAX_ZOOM + 1e-3);
      expect(clamped).toBeGreaterThan(MAX_ZOOM - 0.25);
    });

    test('a plain wheel zooms out and clamps at minZoom (0.2)', async ({ page }) => {
      await plainWheel(page, -120, 6); // zoom in first so there is room to fall
      const high = await waitForStableScale(page);

      await plainWheel(page, 240, 40);
      const low = await waitForStableScale(page);
      expect(low).toBeLessThan(high);
      expect(low).toBeGreaterThanOrEqual(MIN_ZOOM - 1e-3);
      expect(low).toBeLessThan(MIN_ZOOM + 0.25);
    });

    test('ctrl/⌘+wheel also zooms', async ({ page }) => {
      const start = await readScale(page);
      await ctrlWheel(page, -120, 4);
      const zoomed = await waitForStableScale(page);
      expect(zoomed).toBeGreaterThan(start);
    });
  });

  test.describe('drag-pan (always active)', () => {
    test('dragging the pane translates the viewport without changing scale', async ({ page }) => {
      const before = await waitForStableTransform(page);
      const { x, y } = await paneCenter(page);

      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 120, y - 80, { steps: 8 });
      await page.mouse.up();

      const after = await waitForStableTransform(page);
      expect(Math.abs(after.scale - before.scale)).toBeLessThan(0.01);
      const moved = Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1;
      expect(moved).toBe(true);
    });
  });
});
