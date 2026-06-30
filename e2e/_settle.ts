import { expect, type Page } from '@playwright/test';

/**
 * Shared deterministic-settle helpers for the self-driven visual specs
 * (`visual.spec.ts`, `radial-circle.spec.ts`). Extracted VERBATIM from
 * `visual.spec.ts` so the new spec imports them instead of copying [H5]; the
 * bodies are byte-identical, so the existing `roadmap-*.png` baselines stay
 * stable.
 */

const VIEWPORT = '.react-flow__viewport';

/** Read the React Flow viewport's current scale (the transform's `a` term). */
export async function readScale(page: Page): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return 1;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 1;
    return new DOMMatrixReadOnly(t).a;
  }, VIEWPORT);
}

/** Wait for fonts + a STABLE viewport transform before asserting/snapshotting. */
export async function settle(page: Page): Promise<void> {
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
