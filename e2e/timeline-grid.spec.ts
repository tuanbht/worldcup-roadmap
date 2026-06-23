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

  test('a near-midnight-UTC match row pill date matches its own card date [Acceptance #8]', async ({
    page,
  }) => {
    // Regression for THIS bug end-to-end. With timezoneId pinned to 'UTC'
    // (playwright.config.ts), pick a near-midnight-UTC group match — the mock's
    // latest group kickoff is Group D matchday 3 at 18:30Z on 19 Jun, the case
    // most prone to a grouping/label zone split. The card footer renders
    // `dd MMM, HH:mm` via formatDateTime; the row's <time> pill renders `dd MMM`.
    // They MUST agree: the pill date == the card's own rendered date.
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // Zoom out so the whole tall timeline is attached to the DOM.
    await ctrlWheel(page, 240, 6);

    // Locate the Group D · MD3 card and read its rendered date (the `dd MMM`
    // prefix of the `dd MMM, HH:mm` footer). Deterministic attach wait, no sleep.
    const card = page.locator('article', { hasText: /Group D · MD3/ }).first();
    await expect(card).toBeAttached({ timeout: 10_000 });
    const cardText = (await card.textContent()) ?? '';
    const cardDate = cardText.match(/(\d{2} [A-Z][a-z]{2}),/)?.[1];
    // Precise shape, not a truthiness smoke check: the footer must render a real
    // `dd MMM` token (e.g. "19 Jun"), the exact text the pill is matched against.
    expect(cardDate, 'card should render a "dd MMM," date').toMatch(/^\d{2} [A-Z][a-z]{2}$/);

    // The row's date pill is a <time> whose visible label is the same `dd MMM`.
    // Under UTC this is "19 Jun"; the assertion is derived from the card, not a
    // hardcoded string, so it stays honest if fixtures change.
    await expect(page.locator('time', { hasText: cardDate! }).first()).toBeAttached({
      timeout: 10_000,
    });
  });
});

/** Center Y of a locator's bounding box (the vertical centerline of an element). */
async function centerY(loc: ReturnType<Page['locator']>): Promise<number> {
  const box = await loc.boundingBox();
  if (!box) throw new Error('element has no bounding box');
  return box.y + box.height / 2;
}

// --- Item 1: date-rail markers centered on their row's cards [Acceptance #1] --
test.describe('date-rail alignment', () => {
  test('a day-marker shares a center line with its row card (±6px)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // The first day's Group A · MD1 card and the 11 Jun marker share a row.
    const card = page.locator('article', { hasText: /Group A · MD1/ }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    const marker = page.locator('time', { hasText: '11 Jun' }).first();
    await expect(marker).toBeVisible({ timeout: 10_000 });

    const cardCenter = await centerY(card);
    const markerCenter = await centerY(marker);
    // The bug put the pill ~40px above the card center; the fix centers them.
    expect(Math.abs(cardCenter - markerCenter)).toBeLessThanOrEqual(6);
  });
});

// --- Item 2: always-on standings table under each group header [Acceptance #2] -
test.describe('always-on standings table', () => {
  test('a group-standings table renders under each group header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // GroupTableNode renders a <section aria-label="Group X standings">; one per
    // group is now always present in the canvas (not just the on-demand overlay).
    const tables = page.locator('section[aria-label$="standings"]');
    await expect(tables.first()).toBeAttached({ timeout: 10_000 });
    // 12 groups -> at least the always-on tables are present (>= 12).
    await expect(async () => {
      expect(await tables.count()).toBeGreaterThanOrEqual(12);
    }).toPass({ timeout: 10_000 });

    // The table shows the Pts column header (the emphasized stat).
    await expect(page.getByText('Pts').first()).toBeAttached({ timeout: 10_000 });
  });
});

// --- Item 3: focus a team's path via its flag, no relayout [Acceptance #5-7] ---
//
// The standings flags live in the top band of the continuous canvas, which the
// initial fitView frames at a tiny zoom (a flag's box is ~3px, often above the
// viewport top). A mouse `.click()` is therefore non-deterministic. The flags are
// real <button>s, so we activate them by KEYBOARD (`.focus()` + Enter) — the
// requirement's own a11y path — which is reliable regardless of canvas transform
// and never depends on the node being scrolled into the visible pane.
// Match the team flag by its precise "Show matches for …" label so it never
// collides with the table header opener button that also lives inside the
// standings <section> (mirrors the membership-edges block's TEAM_FLAG).
const STANDINGS_FLAG = 'section[aria-label$="standings"] button[aria-label^="Show matches for"]';

/** The first standings flag and the team name from its accessible label. */
async function firstFlag(page: Page) {
  const flag = page.locator(STANDINGS_FLAG).first();
  await expect(flag).toBeAttached({ timeout: 10_000 });
  const label = (await flag.getAttribute('aria-label')) ?? '';
  const teamName = label.replace(/^Show matches for /, '');
  expect(teamName, 'flag should name a team').not.toBe('');
  return { flag, teamName };
}

/** Keyboard-activate a flag (deterministic for off-viewport canvas nodes). */
async function activateByKeyboard(flag: ReturnType<Page['locator']>): Promise<void> {
  await flag.focus();
  await expect(flag).toBeFocused();
  await flag.press('Enter');
}

test.describe('team focus highlight', () => {
  test('focusing a team highlights its matches and dims the rest, with no node move', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // Sample a stable node's transform BEFORE focusing, to prove no relayout.
    const sampleNode = page.locator('.react-flow__node').first();
    const beforeTransform = await sampleNode.evaluate((el) => (el as HTMLElement).style.transform);

    const { flag } = await firstFlag(page);
    await activateByKeyboard(flag);

    // Some match cards become focused (data-focus="on") and others dim.
    await expect(page.locator('[data-focus="on"]').first()).toBeAttached({ timeout: 10_000 });
    await expect(page.locator('[data-focus="dim"]').first()).toBeAttached({ timeout: 10_000 });

    // No relayout: the sampled node's transform is unchanged.
    const afterTransform = await sampleNode.evaluate((el) => (el as HTMLElement).style.transform);
    expect(afterTransform).toBe(beforeTransform);
  });

  test('Esc clears an active focus [Acceptance #6]', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    const { flag } = await firstFlag(page);
    await activateByKeyboard(flag);
    await expect(page.locator('[data-focus="on"]').first()).toBeAttached({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-focus="on"]')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('[data-focus="dim"]')).toHaveCount(0, { timeout: 10_000 });
  });

  test('clicking the empty pane clears an active focus [Acceptance #6]', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    const { flag } = await firstFlag(page);
    await activateByKeyboard(flag);
    await expect(page.locator('[data-focus="on"]').first()).toBeAttached({ timeout: 10_000 });

    // Click the pane's own centre (its default click target) — a genuinely empty
    // background spot BELOW the app toolbar, so React Flow's onPaneClick fires and
    // clears the focus. (A page-absolute corner like (5,5) would hit the toolbar.)
    await page.locator('.react-flow__pane').click();
    await expect(page.locator('[data-focus="on"]')).toHaveCount(0, { timeout: 10_000 });
  });

  test('re-activating the same flag toggles focus off [Acceptance #6]', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    const { flag } = await firstFlag(page);
    await activateByKeyboard(flag);
    await expect(page.locator('[data-focus="on"]').first()).toBeAttached({ timeout: 10_000 });

    // Re-activating the SAME flag clears it (the toggle path, no Esc/pane needed).
    await activateByKeyboard(flag);
    await expect(page.locator('[data-focus="on"]')).toHaveCount(0, { timeout: 10_000 });
  });

  test('announces "Showing matches for {team}" via aria-live, cleared on Esc [Acceptance #8]', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // The team name comes from the flag's own accessible name, so the assertion
    // stays honest if the fixture roster changes.
    const { flag, teamName } = await firstFlag(page);

    // Before focusing, the polite status region is empty (no stale announcement).
    const status = page.locator('[role="status"][aria-live="polite"]');
    await expect(status).toHaveText('', { timeout: 10_000 });

    await activateByKeyboard(flag);
    // The screen-reader announcement names exactly the focused team.
    await expect(status).toHaveText(`Showing matches for ${teamName}`, { timeout: 10_000 });

    // Esc clears the announcement (and the focus) so SR users hear it reset.
    await page.keyboard.press('Escape');
    await expect(status).toHaveText('', { timeout: 10_000 });
  });
});

// --- Item 2: dashed membership edges (standings table -> its matches) --------
//
// The new `member` edge family renders as dashed `.member-edge` SVG paths from
// each group's standings table down to its match cards. They compose with the
// team-focus interaction (item 3): focusing a team toggles `member-edge--focus-on`
// on its links and `member-edge--focus-dim` on the rest, with NO node relayout.
// Plan Acceptance #8, #9, #11. RED until build-graph emits member edges + the
// MemberEdge renderer + CSS land. The team flag is matched by its precise
// "Show matches for …" label so it never collides with the table header opener
// button that now also lives inside the standings <section>.
const TEAM_FLAG = 'section[aria-label$="standings"] button[aria-label^="Show matches for"]';

test.describe('membership edges', () => {
  test('at least one dashed .member-edge path is attached to the canvas [Acceptance #8]', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('path.member-edge').first()).toBeAttached({ timeout: 10_000 });
    await expect(async () => {
      // 12 groups each fan to their in-group matches, so there are many links.
      expect(await page.locator('path.member-edge').count()).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
  });

  test('focusing a team highlights its membership links and dims the rest, no node move [Acceptance #9, #11]', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // Sample a stable node's transform BEFORE focusing, to prove no relayout.
    const sampleNode = page.locator('.react-flow__node').first();
    const beforeTransform = await sampleNode.evaluate((el) => (el as HTMLElement).style.transform);

    const flag = page.locator(TEAM_FLAG).first();
    await expect(flag).toBeAttached({ timeout: 10_000 });
    await flag.focus();
    await expect(flag).toBeFocused();
    await flag.press('Enter');

    // Some membership links light up (focus-on) and others dim (focus-dim).
    await expect(page.locator('path.member-edge--focus-on').first()).toBeAttached({
      timeout: 10_000,
    });
    await expect(page.locator('path.member-edge--focus-dim').first()).toBeAttached({
      timeout: 10_000,
    });

    // No relayout: the sampled node's transform is unchanged.
    const afterTransform = await sampleNode.evaluate((el) => (el as HTMLElement).style.transform);
    expect(afterTransform).toBe(beforeTransform);
  });
});
