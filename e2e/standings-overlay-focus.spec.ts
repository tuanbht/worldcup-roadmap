import { expect, test, type Page } from '@playwright/test';

/**
 * C1 e2e (plan Acceptance #12): the standings-overlay open + focus-restore path
 * after the group-header pill was deleted and its opener re-homed onto the
 * always-on table header.
 *
 * The deleted pill held the ONLY `aria-label="Open Group X standings"` button;
 * it now lives on `GroupTableNode`'s <header>. Activating it must open the
 * `role="dialog"` StandingsOverlay, and closing the overlay (Esc / close button)
 * must restore focus to that SAME header button — the contract
 * `RoadmapCanvas.closeStandings` relies on (its selector text is unchanged, it
 * just now resolves to the table header instead of the pill).
 *
 * Lives in its OWN spec file (not the shared, concurrently-edited visual.spec.ts)
 * per the pipeline concurrency guardrail. The standings flags sit in the top band
 * at a tiny initial zoom, so a mouse click is non-deterministic — we drive the
 * opener by KEYBOARD (`.focus()` + Enter), the requirement's own a11y path, which
 * is reliable regardless of the canvas transform. RED until the GREEN stage
 * renders the header button + threads the opener through the canvas.
 *
 * NOTE: browsers may be unavailable in this sandbox; the spec is committed and
 * runs under `npm run test:e2e` locally / in CI. Document the gap if it cannot
 * execute here.
 */

/** The re-homed overlay opener on the always-on standings table header. */
const OPENER = '[aria-label^="Open Group"][aria-label$="standings"]';

/** The first standings-table header opener button. */
async function firstOpener(page: Page) {
  const opener = page.locator(OPENER).first();
  await expect(opener).toBeAttached({ timeout: 10_000 });
  // It is a real <button> (native Enter/Space), not a div with a click handler.
  await expect(opener).toHaveJSProperty('tagName', 'BUTTON');
  return opener;
}

test.describe('standings overlay — open + focus restore [C1 / Acceptance #12]', () => {
  test('the table header button opens the role="dialog" overlay', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    const opener = await firstOpener(page);
    await opener.focus();
    await expect(opener).toBeFocused();
    await opener.press('Enter');

    // The StandingsOverlay dialog is now open.
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  });

  test('closing the overlay (Esc) restores focus to the SAME header button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    const opener = await firstOpener(page);
    // Capture the exact opener's accessible name so the restore assertion targets
    // the SAME button (not just any "Open Group" button).
    const openerLabel = await opener.getAttribute('aria-label');
    expect(openerLabel, 'opener should carry an aria-label').not.toBeNull();

    await opener.focus();
    await opener.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    // Esc closes the dialog and the canvas restores focus to the originating
    // header button (closeStandings' querySelector(...).focus()).
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator(`[aria-label="${openerLabel}"]`)).toBeFocused({ timeout: 10_000 });
  });

  test('the close (X) button also restores focus to the header opener', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    const opener = await firstOpener(page);
    const openerLabel = await opener.getAttribute('aria-label');

    await opener.focus();
    await opener.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Close standings' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator(`[aria-label="${openerLabel}"]`)).toBeFocused({ timeout: 10_000 });
  });
});
