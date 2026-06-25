# Requirement: Match-card team-row flag tap target stays ≥44px under the React Flow zoom transform

## Context

This is the sibling follow-up to `2026-06-24-1030-canvas-flag-tap-target-zoom-scale` (which fixed the **standings-row**
flag by making the whole row a full-width focus-team control). The 1030 work explicitly left the **match-card**
flag out of scope; this requirement closes that gap.

The match-card team-row flag is an interactive `<button>` rendered in `src/components/nodes/TeamRow.tsx:47-60`:
`className="nopan shrink-0 rounded-[3px] focus-visible:…"`, `aria-label={`Show matches for ${team.team.name}`}`,
`onClick → onFocusTeam(team.team.id)`. It is used **only** inside `src/components/nodes/MatchNode.tsx`
(two rows per card — home + away, lines 121 and 130, both passed `onFocusTeam`), which is a React Flow node living
under `.react-flow__viewport { transform: scale(zoom) }`.

Two problems compound:

1. Unlike the flags treated by `2026-06-23-1336-mobile-friendly-small-screens`, this button **never received the
   ≥44px coarse-pointer hit slop** (no `min-h-[44px]`/`min-w-[44px]`, no `pointer-coarse:` rule) — so it is small
   even un-transformed.
2. It sits **inside the scaled viewport**, so at the mobile zoom floor (`MOBILE_MIN_ZOOM = 0.32`, see
   `src/features/roadmap/responsive.ts`) on a 320px screen its **on-screen** tap target is far below the 44px
   touch-target minimum (the small flag glyph × 0.32).

`TeamRow` is **canvas-only** — it is not reused by any DOM overlay (the match-detail panel and `StandingsOverlay`
dialog have their own markup; grep confirms `TeamRow` is imported only by `MatchNode`). So there is no DOM-overlay
flag to protect for this component — but desktop (≥1024) behaviour must stay byte-identical.

## Decision

- The planner must determine the right approach, learning from 1030. The proven, accepted pattern from 1030 is
  **row-as-target**: make the whole team-row the focus-team control (a full-row-width tap target) rather than
  counter-scaling the tiny flag — because per-flag counter-scaling at the 0.32 floor overlapped neighbours and
  mis-focused the wrong team (that approach was rejected in 1030). Evaluate whether row-as-target fits the
  match-card layout (`grid grid-cols-[auto_1fr_auto]` in `TeamRow.tsx:44`, two rows stacked in the card) and adopt
  it if so; if the match-card geometry differs enough that a different mechanism is warranted (e.g. width-only hit
  growth that cannot overlap the sibling row), justify it. **Do not ship a 44px dead/ambiguous hit zone, and do not
  reintroduce the 1030 mis-tap class** (each team's tap must resolve to that team).
- Preserve the accessible name (`Show matches for {team}`), keyboard activation (Enter/Space), and `nopan` +
  `stopPropagation` so pan/zoom is not disturbed. Keep `<table>`/list/semantic roles intact if the layout uses them;
  do not regress a11y (no `role="button"` on a structural element that strips needed semantics — mirror the 1030
  decision).
- Only the **resolved-team** rows are interactive (placeholder refs stay decorative, as today). The flag glyph stays
  visually byte-identical at all zoom levels; only the (invisible) hit area grows.
- Scope is the **MatchNode match-card team row only**. Desktop ≥1024 stays byte-identical. No counter-scale machinery
  unless the planner proves it is genuinely required (1030 needed none).

## Acceptance criteria (testable)

- At 320px on the mobile/coarse-pointer path with the viewport scale settled at the floor (0.32), the match-card
  resolved-team-row focus control's **post-transform on-screen** bounding box (`getBoundingClientRect()` /
  Playwright `boundingBox()`, which includes the viewport scale) is **≥44px wide** (width ≥ 44 − 0.5 CSS px). As in
  1030, a ≥44px-**tall** per-row target may be geometrically impossible at the overview floor — if so, document the
  accepted limit; width + correct-team-per-tap is the satisfied contract.
- **No mis-tap:** tapping the HOME row focuses the home team and tapping the AWAY row focuses the away team — each
  resolves to its OWN team (verified via the `role="status"` "Showing matches for {team}" live region at
  `src/components/roadmap/RoadmapCanvas.tsx` ~218-220). Adjacent interactive elements must not overlap such that one
  steals the other's taps.
- The flag **glyph** is visually unchanged at all zoom levels (only the hit area changes). Placeholder (unresolved)
  rows stay decorative (no focus control).
- Desktop ≥1024 and the DOM-overlay panels are unchanged. A transform-aware test pins the contract that
  un-transformed unit tests miss — a Playwright/e2e assertion on the live `boundingBox()` at 320px on the
  coarse-pointer project (mirror the deterministic, `mobile`-project-only pattern established in `e2e/visual.spec.ts`
  by 1030), plus unit coverage for correct-team-per-row + keyboard + decorative-placeholder.
- `npm run typecheck` + `npm test` + `npm run build` green; the visual suite stays deterministic (no new flake, no
  new snapshot baseline).

## Files (indicative)

- `src/components/nodes/TeamRow.tsx` (the match-card team-row flag/control) and possibly `src/components/nodes/MatchNode.tsx` (row layout / containing block)
- `src/components/nodes/TeamRow.test.tsx` and/or `src/components/nodes/MatchNode.test.tsx` (unit)
- `e2e/visual.spec.ts` (transform-aware, `mobile`-only on-screen bounding-box + tap-action assertions at 320px/0.32)

## Notes

Direct follow-up to `2026-06-24-1030-canvas-flag-tap-target-zoom-scale`; reuse its proven row-as-target mechanism and
its e2e idiom (mobile-project-only inverse skip, scale-settled-at-floor guard, live `boundingBox().width ≥ 44 − 0.5`,
correct-team-per-row via the live region, zero-overlap geometry guard). The standings-row fix and this match-card fix
are independent surfaces; no file overlap with the standings node beyond the shared `Flag` glyph (which must stay
unchanged).

Owner: **wc-ui-engineer** (match-card flag/control) + **wc-test-engineer** (transform-aware e2e).
