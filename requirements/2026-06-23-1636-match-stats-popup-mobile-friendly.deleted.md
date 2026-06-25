# Requirement: Make the match detail (Stats) popup mobile-friendly

## Bug (observed via Playwright on a 390×844 iPhone viewport)

Open any match → select **Stats**: the bottom sheet shows the big score header + the full goalscorers line +
the tab row, and the **actual stats content (Win Probability bar + team-stats rows) is pushed below the bottom
of the sheet** — the tabs sit at the very bottom edge and the data the user opened Stats for is **off-screen**.
The header eats the sheet. (No horizontal overflow; the problem is vertical — content below the fold and the
sheet is only ~half-height.)

Same shape will affect the **Timeline** and **Lineups** tabs (header pushes their content down too).

## Root cause

On mobile (`max-[640px]`) `MatchDetailPanel` is a bottom sheet (`bottom-0`, `h-auto`, `max-h-[70%]`, `w-full`,
`flex flex-col`). Its children stack: tall `MatchDetailHeader` (oversized score + meta + scorers) → tabs →
active tab content. The header consumes the sheet, so the tab content renders near/below the viewport bottom and
is clipped, with no internal scroll bringing it into view.

## Decision (mobile, `max-[640px]` only — desktop right-drawer unchanged)

Restructure the sheet so the **tab content is what the user sees**:

1. **Taller sheet** — make it a near-full-height bottom sheet (e.g. `h-[88dvh]` / `max-h-[92dvh]`) instead of
   `max-h-[70%]`, so there's room for content. Respect `env(safe-area-inset-bottom)`.
2. **Three-region flex column:** a **compact sticky header**, **sticky tabs** directly beneath it, and a
   **scrollable content region** (`flex-1 overflow-y-auto`) holding the active tab. Selecting Stats lands the
   user on the Win-Probability bar + team-stats rows immediately; the rest scrolls; the tabs stay visible
   (sticky) while scrolling.
3. **Compact header on mobile** — shrink the score type, reduce padding, and **truncate/secondary-ize the
   goalscorers line** (e.g. one truncated line, or fold it into the Timeline tab) so it doesn't dominate.
4. Keep the close button reachable (top-right of the sheet), `inert`/Escape/focus behavior intact.

## Acceptance criteria (testable, at 320 / 375 / 390 widths)

- Opening a match → **Stats**: the **Win Probability bar and the first team-stats rows are visible without
  scrolling**; the remaining rows are reachable by scrolling **within** the sheet; the tab row stays visible
  (sticky) while the content scrolls. **No stats content is clipped off the bottom.**
- Same for **Timeline** and **Lineups**: the tab's content (events list / formation pitch) is visible on tab
  select, not pushed off-screen.
- Header is compact (score not oversized; scorers truncated/secondary); sheet clears the bottom safe-area.
- No horizontal overflow (already OK); desktop (≥640px right drawer) layout unchanged.
- `npm run typecheck` + `build` + tests green; mobile visual snapshot of the open Stats sheet added/updated.

## Files

- `src/components/panel/MatchDetailPanel.tsx` (mobile sheet height + the sticky-header / sticky-tabs /
  scroll-content structure), `src/components/panel/match-detail/MatchDetailHeader.tsx` (mobile compaction),
  `MatchDetailTabs.tsx` (sticky tabs + scrollable content region), `StatsTab.tsx`/`TimelineTab.tsx`/`LineupsTab.tsx`
  (fit the scroll region), `src/styles/global.css` if needed → **wc-ui-engineer**; snapshots/e2e → **wc-test-engineer**.

> Focused, evidence-based slice of `2026-06-23-1336-mobile-friendly-small-screens.md` (which named the panel
> generally); this pins the specific "stats content off-screen" defect and the sticky-header/scroll fix.
