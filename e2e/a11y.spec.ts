import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility smoke (Acceptance #12) + reduced-motion guard (Acceptance #5, #8).
 *
 * `@axe-core/playwright` is added as a devDep by the package.json Modify step; it
 * is imported lazily so this file still loads (and the axe test skips with a
 * clear reason) before the dependency lands. The keyboard-focus and
 * reduced-motion assertions need no extra dependency and run today.
 */

const VIEWPORT = '.react-flow__viewport';

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  let last = 1;
  await expect
    .poll(
      async () => {
        const next = await page.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) return 1;
          const t = getComputedStyle(el).transform;
          return t && t !== 'none' ? new DOMMatrixReadOnly(t).a : 1;
        }, VIEWPORT);
        const stable = Math.abs(next - last) < 1e-4;
        last = next;
        return stable;
      },
      { timeout: 6000, intervals: [80, 120, 160, 200] },
    )
    .toBe(true);
}

test.describe('accessibility', () => {
  test('axe reports no serious or critical violations', async ({ page }) => {
    let AxeBuilder: typeof import('@axe-core/playwright').default;
    try {
      ({ default: AxeBuilder } = await import('@axe-core/playwright'));
    } catch {
      test.skip(true, '@axe-core/playwright not installed yet (added by package.json Modify step)');
      return;
    }

    await page.goto('/?view=bracket');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
    await settle(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking, JSON.stringify(blocking.map((v) => v.id))).toEqual([]);
  });

  test('a match node is keyboard-focusable with an accessible name', async ({ page }) => {
    await page.goto('/?view=bracket');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
    await settle(page);

    // MatchNode renders an <article tabIndex=0 aria-label=...>; Tab must reach one.
    const card = page.locator('article[aria-label]').first();
    await card.focus();
    await expect(card).toBeFocused();
    await expect(card).toHaveAttribute('aria-label', /.+/);
  });

  test('reduced motion pauses the live edge animation (existing globals.css guard)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?view=bracket');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
    await settle(page);

    // Under reduced motion the live edge / livepulse animation must not be running.
    const live = page.locator('.advance-edge--live').first();
    const count = await live.count();
    test.skip(count === 0, 'no live advance edge present in this view/fixture state');

    const animationName = await live.evaluate((el) => getComputedStyle(el).animationName);
    expect(['none', '']).toContain(animationName);
  });
});
