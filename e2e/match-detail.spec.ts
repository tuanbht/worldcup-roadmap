import { expect, test } from '@playwright/test';

/**
 * Match-detail panel smoke against the MOCK-provider static build.
 *
 * Detail is FIFA-only by design: `MatchRepository` exposes only `getTournament()`,
 * and every mock match carries `providerRef: null`. So under the mock E2E build,
 * opening a REAL match (one that resolves through `findMatch` in
 * `MatchDetailPanel`) yields `status: 'unavailable'` → `<PanelEmpty />` with the
 * default "Match detail not available" copy and NO tablist.
 *
 * We target a group-stage card (`[data-group="true"]`) rather than the Final:
 * under the mock build the Final node is an UNDECIDED knockout *bracket
 * placeholder* (its id is a `wc2026-r16-*`/final bracket id, not a real `Match`
 * in `tournament.matches`), so the panel would render the
 * `findBracketPlaceholder` branch ("Matchup not yet decided"), not the
 * `unavailable` branch. A played group match is a real `Match` with
 * `providerRef: null`, so it is the node that genuinely exercises the
 * loader's `unavailable` outcome → the UI-owned `PanelEmpty` empty state.
 *
 * This spec asserts that empty-state a11y path (open → unavailable → Escape →
 * panel hidden). The live 3-tab switching path is covered by the component unit
 * suite (`MatchDetailPanel.test.tsx`), which mocks a populated `MatchDetail`.
 *
 * NOTE: Playwright browsers may be unavailable in the sandbox/CI image; this spec
 * runs under `npm run test:e2e` (not the unit `vitest` gate). Document, do not
 * fail the unit gate, when browsers cannot launch here.
 */
test.describe('match detail panel (mock empty-state)', () => {
  test('open a real match → unavailable empty state (no tablist) → close via Escape', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'All' }).click();

    // A played group-stage match is a REAL `Match` (resolves via findMatch);
    // the Final is only a bracket placeholder under the mock build.
    const groupCard = page.locator('[data-group="true"]').first();
    await expect(groupCard).toBeVisible({ timeout: 15_000 });
    await groupCard.click();

    // Open state: the panel is exposed to the a11y tree (aria-hidden=false), so
    // the `complementary` role resolves.
    const openPanel = page.getByRole('complementary', { name: 'Match details' });
    await expect(openPanel).toBeVisible();
    await expect(openPanel).toHaveAttribute('aria-hidden', 'false');

    // Mock build → providerRef null → loader 'unavailable' → the empty state,
    // not the 3 detail tabs.
    await expect(openPanel.getByText('Match detail not available')).toBeVisible();
    await expect(openPanel.getByRole('tablist')).toHaveCount(0);

    // Closed state: once aria-hidden flips to true the panel leaves the a11y tree,
    // so `getByRole('complementary')` no longer resolves it. Assert closure via a
    // role-agnostic attribute locator on the still-rendered <aside>.
    const panelEl = page.locator('aside[aria-label="Match details"]');
    await page.keyboard.press('Escape');
    await expect(panelEl).toHaveAttribute('aria-hidden', 'true');
  });
});
