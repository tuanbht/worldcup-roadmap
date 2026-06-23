# Requirement: On-card flag badge marking the nearest match

## Goal

Make the "nearest" match (the one the **Go to current match** button targets)
instantly spottable on the canvas by pinning a **flag badge** to its card. The
user picked the on-card-badge design (not an off-screen edge pointer).

## Definition of "nearest"

Reuse the EXISTING, tested logic — do NOT duplicate it: the nearest match is
`pickFocusMatchId(tournament.matches, Date.now())` from
`src/features/roadmap/focus-target.ts` (live match if any, else the not-yet-ended
match whose estimated end is nearest in the future; `null` when all have ended).
This already runs in `RoadmapCanvas` as `focusTarget` and drives the focus
button — feed the SAME id to the badge so the two controls always agree.

## Design (on-card flag badge)

- The single nearest match card shows a small **flag/pennant badge** (lucide
  `Flag` icon + a short label) pinned to the card — visually reading like a flag
  planted on that card. Match the preview: the badge sits at the TOP of the card
  (a pennant above/overlapping the top edge), centered or corner-anchored, so it
  does not collide with the existing header (group label left, `StatusPill`
  right).
- **Live-aware:** when the nearest match is live, the badge uses the live
  affordance (the `--live` token + the existing `animate-livepulse`) and reads
  e.g. "Live"; when it is an upcoming match, it uses the accent treatment and
  reads e.g. "Next" / "Up next". Derive live-ness from the card's own
  `data.status === 'live'` (the badge is on that match) — no extra prop needed.
- **Card emphasis:** give the nearest card a subtle, intentional emphasis so it
  stands out at a glance (e.g. an accent ring/glow), but make it visually
  DISTINCT from the click-`selected` state (which already uses
  `--glow-accent`) so the two are not confused. Use design tokens, not hardcoded
  colors (per the web design-quality + CSS-custom-property rules). It should look
  designed (a real pennant/flag treatment), not a generic dot.

## Containment caveat (important)

The card root uses `[contain:layout_paint]`, which **clips paint to the card
box** — a badge positioned ABOVE the card (negative top) would be clipped. For
the nearest card only, relax to `[contain:layout]` (keeps layout isolation, drops
paint clipping) so the badge can overflow above, OR render the badge fully within
the 108px card bounds. Do NOT remove containment from every card (perf). Whatever
you choose, the badge must render un-clipped and the card must keep its fixed
260×108 size, its handles, and its edges intact.

## Data flow

- Add an optional `isNearest?: boolean` to `MatchNodeData` in
  `src/features/roadmap/graph-model.ts`. Keep `buildRoadmapGraph` PURE and
  time-independent — do NOT compute the nearest there.
- Inject the flag in the canvas display layer where `Date.now()` already lives:
  extend `RoadmapCanvas`'s `displayNodes` to set `isNearest: true` on the match
  node whose id === `focusTarget.id` (immutably, exactly like the existing
  `onOpenStandings` injection), and add `focusTarget.id` to the memo deps.
- Prefer a small PURE helper, e.g. `applyNearestFlag(nodes, nearestId)`, returned
  immutably, so the injection is unit-testable in isolation (mirrors how the
  graph passes are tested). `nearestId === null` → no node flagged.
- `MatchNode` renders the badge + emphasis from `data.isNearest` (+ its own
  `data.status` for live-awareness) via a `data-nearest` attribute, consistent
  with the existing `data-selected` / `data-status` styling approach.

## Accessibility

- The flag icon is decorative (`aria-hidden`). Append a concise suffix to the
  card's accessible name (the existing `ariaLabel(data)`), e.g. "— current match"
  / "— live match", so assistive tech announces which card is the nearest. Do not
  regress the existing aria-label content.

## Acceptance criteria

1. Exactly ONE card — the nearest per `pickFocusMatchId` — shows the flag badge;
   every other card shows none.
2. When `pickFocusMatchId` returns `null` (all matches ended), NO card shows the
   badge.
3. The badge is live-aware: a live nearest shows the live affordance (+ pulse);
   an upcoming nearest shows the accent affordance.
4. The nearest card carries a subtle emphasis that is visually distinct from the
   `selected` state.
5. The badge/emphasis does not change the card's 260×108 size, does not break
   handles or edges, and is not clipped by `contain`.
6. The flag icon is `aria-hidden`; the card's accessible name gains a
   current/live-match suffix. Existing aria-label content is preserved.
7. The nearest id comes from the existing `pickFocusMatchId` (no duplicated
   logic); the badge updates when the resolved target changes (same cadence as
   the focus button — tournament refetch / re-render).
8. A pure, unit-tested injection helper (`applyNearestFlag` or equivalent) exists;
   `MatchNode` has tests for badge present / absent / live-variant and the
   aria-label suffix; all existing tests stay green.

## Constraints

- Library-first (lucide `Flag`, existing tokens); no new dependencies.
- Immutability (new node objects, never mutate the memoized graph); compositor-
  friendly styling; small focused components per the coding-style + web rules.
- All gates green and deterministic: `npm run test`, `npm run typecheck`,
  `npm run build`, `npx prettier --check` on touched files.

## Files likely touched

- `src/features/roadmap/graph-model.ts` — add `isNearest?`.
- a new pure helper module (e.g. `src/features/roadmap/apply-nearest-flag.ts`) +
  its test.
- `src/components/roadmap/RoadmapCanvas.tsx` — wire the helper into `displayNodes`.
- `src/components/nodes/MatchNode.tsx` (+ `MatchNode.test.tsx`) — badge + emphasis
  - aria suffix.
- `src/styles/global.css` (or tokens) if a new accent treatment is needed.
