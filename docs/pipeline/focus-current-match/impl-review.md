# Implementation Review: Focus-Current-Match Button

**Verdict: APPROVED**

## Summary

The implementation faithfully realizes the spec and the plan. A pure, O(n),
clock-free `pickFocusMatchId(matches, nowMs)` resolves the target via the owner's
literal "minimum estimatedEnd > now" rule (kickoff→id tiebreak); a small imperative
`useFocusMatch` hook centers the camera on the resolved node via React Flow's
`setCenter` (the same primitive `useFocusCamera` is built on); and a real semantic
`<button>` (`FocusMatchButton`) inside a React Flow `<Panel>` exposes the control
with a dynamic `aria-label`, a visible token-based focus ring, a disabled state when
no target exists, and a reduced-motion-safe "live" accent. Wiring in `RoadmapCanvas`
derives `{ id, isLive }` immutably from `tournament.matches` + `Date.now()` and
selects the focused match (opening the detail panel, the same semantic a node click
uses). All 12 acceptance criteria are met. No CRITICAL or HIGH issues.

## Observed Gate Results

| Gate | Command | Result |
| --- | --- | --- |
| Tests | `npm run test` | PASS — 35 files, **398/398** (new: focus-target 19, useFocusMatch 6, FocusMatchButton 16) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | PASS — clean |
| Build | `npm run build` (vite) | PASS — built in ~1.1s |
| Coverage | `npm run test:coverage` | PASS — `focus-target.ts` 100% stmt / 84.6% branch, `useFocusMatch.ts` 100% all, `FocusMatchButton.tsx` 100% stmt / 92.3% branch / 100% func/line (all ≥ 80%) |
| Lint | n/a | No `lint` script and no `eslint.config.*` in repo — lint is not a configured gate here. Prettier `--check` on all changed files is clean. |
| e2e | `npm run test:e2e` | Not run / optional per spec (Playwright browsers may be unavailable). Documented in plan. |

## Acceptance Criteria Verification

All 12 criteria verified against code and tests:

1. Pure / O(n) / no clock read / no mutation, min-estimatedEnd with kickoff→id
   tiebreak — single `for...of` pass + `isBetterCandidate`; deep-freeze test passes,
   input order preserved. ✓
2. Live match wins over later scheduled (`m-live`). ✓
3. Earliest-kickoff future match when none live (`m-soon`). ✓
4. `null` when all ended / empty list. ✓
5. `estimatedEnd === now` excluded; `now + 1ms` included (`estimatedEnd <= nowMs` skip). ✓
6. `MATCH_DURATION_MS`, `FOCUS_ZOOM` (1.1, within canvas `minZoom 0.2`/`maxZoom 1.8`),
   `FOCUS_DURATION_MS` are named exports — no inline magic numbers. ✓
7. Single real `<button>` + lucide `LocateFixed` + `focus-visible:ring-accent` token
   focus state. ✓
8. `aria-label` = "Go to live match" when live, else "Go to current match". ✓
9. `disabled` when `targetMatchId === null`; `onActivate(id)` once on pointer and
   keyboard (Enter/Space); no-op when disabled (guarded twice: native `disabled` +
   `handleActivate` null-check). ✓
10. `setCenter(node.position.x + NODE_W/2, node.position.y + NODE_H/2, { zoom, duration })`;
    safe no-op when `getNode` returns undefined. Node id == match id (verified in
    `build-graph.ts`: `matchNode` sets `id: data.matchId`), so the lookup resolves. ✓
11. Three new production files added to `vitest.config.ts` coverage `include`;
    combined coverage well above 80%. ✓
12. test/typecheck/build all pass; no pre-existing test regresses (398/398). ✓

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW

- **`focus-target.ts:46-47`** — `Date.parse(match.kickoff)` + `Number.isNaN` guard.
  `Match.kickoff` is typed non-nullable ISO UTC, so this defensive branch is
  unreachable in practice (hence the uncovered line 47 / 84.6% branch). It is a
  reasonable boundary-validation guard per the coding-style "never trust external
  data" rule and is cheap; no change required. NOTE only.

- **`RoadmapCanvas.tsx:99-104`** — `isLive` is derived with a second `matches.some(...)`
  pass after `pickFocusMatchId` already iterated the same array. Two O(n) passes
  instead of one; negligible for tournament-sized inputs (≤104 matches) and keeps
  `pickFocusMatchId`'s signature a clean `string | null`. Acceptable; optional future
  tidy would be returning `{ id, isLive }` from the resolver. NOTE only.

- **`RoadmapCanvas.tsx:99` (memo freshness)** — `focusTarget` is memoized on
  `[tournament]` while reading `Date.now()` inside. Between the 45s TanStack refetches
  the target is not re-evaluated, so a match that goes live or ends mid-interval is
  reflected up to ~45s late and the button's enabled/`isLive` state can briefly lag.
  This is explicitly an accepted out-of-scope item in the plan (no realtime ticking;
  resolution at click/re-render time) and the worst case is a stale label, never a
  dead/incorrect camera move (the click still resolves a fresh target through the same
  memo on the next render). Acceptable as designed. NOTE only.

## Notes on Design Choices (non-findings)

- **"Select" semantics:** `onFocused: setSelected` opens the `MatchDetailPanel`
  (`matchId={selected}`) — identical to the existing `onNodeClick` path. The React
  Flow node-glow (`data-selected` in `MatchNode`) is driven by React Flow's own
  selection model, not this `useState`; the focus button therefore matches existing
  click behavior rather than introducing a divergent highlight path. Consistent and
  correct.
- **Long-running live match excluded:** a `status:'live'` match past its 115-min
  estimatedEnd is treated as "ended" by the literal rule. This matches the owner's
  exact phrasing ("the match with ended estimate time nearest in the future" /
  "A LIVE match qualifies and, ending soonest, naturally wins") and is documented in
  the plan Risks as the chosen default. Spec-compliant.
- **Accessibility / motion:** real `<button>`, keyboard activation free from native
  semantics, visible `focus-visible` ring via `--color-accent` token, `aria-hidden`
  on the icon and pulse dot. The live pulse animates only `transform`/`opacity`
  (compositor-friendly) and is disabled under `prefers-reduced-motion: reduce`
  (`global.css`). Panel `top-center` does not collide with the existing top-left /
  top-right / bottom-center / bottom-left controls.
- **Immutability:** `pickFocusMatchId` never sorts/mutates input (no in-place sort;
  running-best scalars); `RoadmapCanvas` derives `focusTarget` without mutating
  `tournament`. No `console.log`/debug code. All files < 200 lines.

VERDICT: APPROVED
