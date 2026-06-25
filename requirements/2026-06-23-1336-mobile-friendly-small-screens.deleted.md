# Requirement: Mobile-friendly UI on small screens

## Context

The app is desktop-first. Some responsive handling exists — `viewport` meta is set, `App.tsx` uses an
`h-dvh` flex-column shell with a `flex-wrap` header, and `MatchDetailPanel` already has a `max-[640px]`
bottom-sheet variant. But the rest isn't tuned for phones. Make the whole UI usable and comfortable on small
screens (target widths **320 / 375 / 414**, up through tablet **768**). Build on the existing patterns; don't
rebuild what's there.

## Scope — surface by surface

1. **App shell / header** (`src/App.tsx`) — on small screens the header (title + view toggle + "Live data ·
   FIFA" legend) must stack cleanly without crowding: reduce padding (`px-4`), shrink the hero type via the
   existing `clamp()` scale, let the `SegmentedControl` view toggle and the status legend wrap or move below
   the title. The header must not eat the screen on short viewports — keep the canvas the dominant area.
2. **Canvas / touch nav** (`src/components/roadmap/RoadmapCanvas.tsx`) — the graph is very wide; phones rely on
   gestures. Ensure **one-finger pan + two-finger pinch-zoom** work (`zoomOnPinch`, `panOnDrag` incl. touch),
   `fitView` frames sensibly on first load at small sizes, and the canvas owns its gestures without the page
   scrolling behind it (`touch-action: none` on the pane / React Flow `preventScrolling`). Consider a slightly
   higher `minZoom` floor or a mobile default zoom so the whole bracket isn't unreadably tiny on open.
3. **Match-detail panel** (`MatchDetailPanel` + `match-detail/*`) — verify the `max-[640px]` bottom-sheet is
   genuinely usable: full-width, internally scrollable, tabs tappable, the **formation pitch** and **stats
   bars** reflow to a narrow column (no horizontal overflow), and the sheet respects bottom **safe-area insets**
   (`env(safe-area-inset-bottom)`).
4. **Standings** — the group standings table (under each group header) and the `StandingsOverlay` dialog must
   fit a 320px width: either a **compact column set** on mobile (e.g. #, team, P, GD, Pts) or horizontal scroll
   within the card; the overlay dialog must not exceed the viewport.
5. **Touch targets** — flags, tabs, the toggle, and the close button are **≥44×44px** tap targets on touch.
6. **No page-level horizontal overflow** at any target width; only the canvas pans, never the document.

## Constraints

- Tailwind v4 breakpoints + the existing `max-[640px]` / `sm:` patterns and oklch tokens — one styling system.
- Compositor-only animation; honor `prefers-reduced-motion` (already wired).
- Keep desktop layout unchanged at ≥1024.

## Acceptance criteria (testable)

- At **320 / 375 / 768** widths: no horizontal page scroll; header stacks without overlap; the canvas fills the
  remaining height (`h-dvh` shell intact).
- Pinch-zoom and one-finger pan work on the canvas; the page does not scroll while panning the canvas.
- The match-detail panel opens as a full-width bottom sheet, scrolls internally, tabs/pitch/stats fit the
  narrow width with no overflow, and clears the home-indicator safe area.
- The standings table/overlay fits a 320px screen (compact columns or contained scroll); no clipped content.
- Interactive controls are ≥44px touch targets.
- Playwright responsive checks pass at 320 / 375 / 768 (no overflow; key elements visible); visual snapshots
  added/updated for those breakpoints. `npm run typecheck` + `build` green.

## Files (indicative)

- `src/App.tsx` (header/shell responsiveness), `src/styles/global.css` (breakpoint tokens, safe-area, tap sizes)
- `src/components/roadmap/RoadmapCanvas.tsx` (touch gestures, mobile zoom defaults)
- `src/components/panel/MatchDetailPanel.tsx` + `panel/match-detail/*` (bottom-sheet polish, pitch/stats reflow)
- `src/components/nodes/GroupTableNode.tsx` / `StandingsOverlay.tsx` (compact mobile table)
- `e2e/*` + visual snapshots at the mobile breakpoints

Owner: **wc-ui-engineer** (`src/components/**`, `src/styles/**`, `App.tsx`); responsive e2e/snapshots →
**wc-test-engineer**.
