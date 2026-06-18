import { expect, test, type Page } from '@playwright/test';

/**
 * Canvas interaction model — both modes + persisted toggle.
 *
 * Resolves `requirements/canvas-interaction-model.md` §1 ("both modes + toggle").
 * The canvas defaults to 'zoom' (the zoomable-roadmap-graph hard requirement: a
 * plain mouse wheel zooms, cursor-centered + clamped, drag pans). A persisted
 * toggle switches to 'pan' (two-finger / plain scroll pans; ⌘/Ctrl+scroll and
 * pinch zoom). The choice is stored in localStorage and survives a reload.
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
const STORAGE_KEY = 'wc-roadmap:interaction-mode';

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

/** Plain wheel — no modifier (zooms in 'zoom' mode, pans in 'pan' mode). */
function plainWheel(page: Page, deltaY: number, repeat: number): Promise<void> {
  return wheel(page, deltaY, repeat, { ctrlKey: false });
}

/** ⌘/Ctrl+wheel — the explicit zoom affordance in 'pan' mode. */
function ctrlWheel(page: Page, deltaY: number, repeat: number): Promise<void> {
  return wheel(page, deltaY, repeat, { ctrlKey: true });
}

/** Flip the persisted toggle and confirm the tab reflects the new mode. */
async function setMode(page: Page, mode: 'zoom' | 'pan'): Promise<void> {
  const label = mode === 'zoom' ? /zoom/i : /pan/i;
  const tab = page.getByRole('tab', { name: label });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function readStoredMode(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
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
    // Start every test from a clean preference so 'zoom' is the genuine default
    // and never a leak from a sibling test's persisted 'pan'. Clear after the
    // first navigation (localStorage needs an origin), then reload onto it.
    await page.goto('/');
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.reload();
    await waitForCanvasReady(page);
  });

  test.describe('zoom mode (default)', () => {
    test('starts in zoom mode (default-by-absence) with the Zoom tab selected', async ({
      page,
    }) => {
      // No stored preference yet: the default must come from code, not storage.
      expect(await readStoredMode(page)).toBeNull();
      await expect(page.getByRole('tab', { name: /zoom/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.getByRole('tab', { name: /pan/i })).toHaveAttribute(
        'aria-selected',
        'false',
      );
    });

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

    test('ctrl/⌘+wheel also zooms in zoom mode', async ({ page }) => {
      const start = await readScale(page);
      await ctrlWheel(page, -120, 4);
      const zoomed = await waitForStableScale(page);
      expect(zoomed).toBeGreaterThan(start);
    });
  });

  test.describe('pan mode', () => {
    test('a plain wheel pans (translate changes) without zooming', async ({ page }) => {
      await setMode(page, 'pan');
      const before = await waitForStableTransform(page);

      await plainWheel(page, 120, 5);
      const after = await waitForStableTransform(page);

      // Scale held constant; the viewport translated.
      expect(Math.abs(after.scale - before.scale)).toBeLessThan(0.01);
      const moved = Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1;
      expect(moved).toBe(true);
    });

    test('ctrl/⌘+wheel still zooms in pan mode', async ({ page }) => {
      await setMode(page, 'pan');
      const start = await readScale(page);
      await ctrlWheel(page, -120, 4);
      const zoomed = await waitForStableScale(page);
      expect(zoomed).toBeGreaterThan(start);
    });
  });

  test.describe('persistence', () => {
    test('selecting pan writes the preference to localStorage', async ({ page }) => {
      await setMode(page, 'pan');
      expect(await readStoredMode(page)).toBe('pan');
    });

    test('the chosen mode survives a reload (tab state + behaviour)', async ({ page }) => {
      await setMode(page, 'pan');
      expect(await readStoredMode(page)).toBe('pan');

      await page.reload();
      await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
      await waitForStableScale(page);

      // Rehydrated: the Pan tab is selected...
      await expect(page.getByRole('tab', { name: /pan/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      // ...and a plain wheel still pans rather than zooms (behavioural proof).
      const before = await waitForStableTransform(page);
      await plainWheel(page, 120, 5);
      const after = await waitForStableTransform(page);
      expect(Math.abs(after.scale - before.scale)).toBeLessThan(0.01);
    });
  });
});
