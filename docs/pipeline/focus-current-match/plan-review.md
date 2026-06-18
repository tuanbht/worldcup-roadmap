# Plan Review: Focus-Current-Match Button

**Reviewer verdict: APPROVED** (no CRITICAL or HIGH issues).

## Summary

The plan is accurate against the real codebase and the spec. I verified every load-bearing
reuse claim by reading source and `node_modules` types rather than trusting the plan:

- `useReactFlow().setCenter(x, y, { zoom?, duration? }) => Promise<boolean>` exists in
  `@xyflow/react` v12 (`@xyflow/system` `SetCenter` + `SetCenterOptions`). The plan's call
  shape is correct.
- `useReactFlow().getNode(id) => NodeType | undefined` exists; the plan's no-op-on-undefined
  guard is the right defensive move.
- Match graph node id **equals `Match.id`** for group cards (`build-graph.ts:54,72` —
  `matchNode` sets `id: data.matchId` where `matchId = match.id`) **and** for *real* knockout
  matches (`build-bracket.ts:76` — bracket `node.matchId = match ? match.id : syntheticId(...)`).
  So `getNode(pickFocusMatchId(...))` resolves correctly for any match that came from
  `tournament.matches`.
- Node `position` is the absolute top-left of the card (used directly by `useFocusCamera`'s
  `boundsOf`), so `position.x + NODE_W/2`, `position.y + NODE_H/2` is the true visual center
  for `setCenter`. Correct.
- The `Match` type (`src/domain/types/match.ts`) has `readonly id`, `readonly kickoff: string`
  (ISO UTC, non-null), `readonly status: 'scheduled' | 'live' | 'finished'`. The import
  `@/domain/types` resolves to `src/domain/types/index.ts` which re-exports `Match`. Correct.
- `tournament.matches: readonly Match[]`; `useTournamentQuery()` returns `{ data, loading, error }`
  and refetches every 45s (`REFETCH_INTERVAL_MS = 45_000`). Plan's claims match.
- `FOCUS_ZOOM = 1.1` is within the canvas `minZoom={0.2}` / `maxZoom={1.8}` bounds
  (`RoadmapCanvas.tsx:124-125`). Correct.
- Precedent exists for everything: `InteractionModeToggle` is a `<Panel>`-wrapping control
  tested inside `<ReactFlowProvider>` with a `// @vitest-environment jsdom` pragma (the global
  default is `node`); `vitest.config.ts` coverage `include` is an explicit allowlist as claimed;
  `bg-live` / `--color-live` token exists for the live accent; `npm run test|typecheck|build|test:e2e`
  all exist.

The decision to use `setCenter` imperatively rather than overload the effect-driven
`useFocusCamera` (which frames *node sets* via `fitView`/`fitBounds` and reacts to a `focus`
enum) is correct and well-argued: idempotent re-click focus does not fit an effect-on-change
model. Completeness against the spec is good — every spec bullet (pure O(n) function, boundary
at `now`, tiebreaks, immutability, disabled-when-null, aria-label variants, keyboard activation,
named constants, no console.log, semantic button, compositor-only motion) maps to a file and an
acceptance criterion.

The items below are MEDIUM/LOW refinements. None blocks implementation.

## Findings

### MEDIUM

**M1 — Spec says "matchId"; code field is `id`. State the mapping explicitly to avoid a
type error during TDD.** The spec phrases the return as a "matchId" and `MatchNodeData` carries
a field literally named `matchId`, but `Match` itself exposes `id` (no `matchId`) and the graph
node id is `match.id`. The plan's `Data Model` snippet correctly uses `m.id`, but the prose and
several acceptance criteria say "matchId". Make the plan state once, unambiguously, that
`pickFocusMatchId` reads `match.id` and returns a value usable directly as `getNode(id)`. This
prevents an implementer from reaching for a non-existent `match.matchId`.

**M2 — `pickFocusMatchId` candidates include knockout matches; the "node may be missing"
path is real, not just a startup race.** Because end = kickoff + constant, a knockout match in
`tournament.matches` with a near-future kickoff can legitimately be the minimum-`estimatedEnd`
target. Two sub-cases the plan should name:
  - A **group-stage** match whose grid cell yielded no position is skipped at
    `build-graph.ts:215-216` (`if (!position) continue`) — so it has **no node** even though it
    is a valid `pickFocusMatchId` candidate. `getNode` returns undefined → `useFocusMatch`
    no-ops. The plan's hook-level guard covers this, but the plan currently frames the missing
    node as only a transient "before React Flow registers nodes" race (Risk bullet 3). Re-frame
    it as a genuine, permanent possibility and add a hook test for "target id has no
    corresponding node → no `setCenter` call" (the plan already lists the undefined-node test —
    just make explicit it covers this real case, not only the race).
  - Confirm in the plan that the camera focus target is allowed to be a knockout card (it is —
    ids line up), so reviewers of the implementation don't flag it as out of scope.

**M3 — Add the unit test the plan's own analysis implies: kickoff tiebreak is degenerate.**
Since `estimatedEnd = kickoff + MATCH_DURATION_MS`, equal `estimatedEnd` ⇔ equal `kickoff`. The
plan correctly notes (Test Strategy, "Kickoff tiebreak") that "different kickoff / same end is
impossible," so the kickoff comparator can never decide a tie independently of the id comparator.
That is fine and matches the spec wording ("tiebreak by kickoff then matchId"), but the plan
should explicitly assert in a test that the implementation still performs the comparison in the
spec's order (`estimatedEnd`, then `kickoff`, then `id`) so a future change to `MATCH_DURATION_MS`
into a per-match duration would not silently break ordering. Keep the id-tiebreak test (it is the
only one that actually fires) and add a one-line comment in code that kickoff-tie ⇒ end-tie.

### LOW

**L1 — Panel placement is under-specified and risks visual overlap.** The canvas already
occupies top-left (`StageToggle`), top-right (`Legend`), bottom-left (`Controls` via
`<Controls/>`), and bottom-center (`InteractionModeToggle`). The plan proposes "top-right stacked
above the Legend (or top-center)." Two `top-right` Panels render in source order and can collide.
Pick one concrete position in the plan (top-center reads cleanest and is unused) so the
implementer doesn't improvise. Not a logic risk.

**L2 — "Live" status vs. literal `estimatedEnd` rule: the open question should be decided,
not deferred.** Risk bullet + Open Question both flag that a `status:'live'` match which has run
past `kickoff + 115min` would be *excluded* as "ended," handing focus to the next match. The plan
defaults to the literal time rule, which is defensible and matches the owner's exact phrasing
("ended estimate time nearest in the future"). That is the right call — but the plan should
*commit* to it as the chosen behavior with a one-line code comment, rather than leaving it as an
open question, so the implementer doesn't add a speculative `status === 'live'` guard that
contradicts the pure-time spec. Also add the `isLive` derivation note: `isLive` is computed from
`status === 'live'` on the resolved id (plan does this) — confirm a live match that *is* still
within its window correctly produces `isLive: true` and the "Go to live match" label, and add a
component/derivation test for the live-but-past-window case (label falls back to "current",
target is the next match).

**L3 — Coverage allowlist also governs `RoadmapCanvas` wiring.** The plan adds the three new
files to `vitest.config.ts` `include` but `RoadmapCanvas.tsx` is *not* in the allowlist (and the
plan says no test asserts its new markup). That is acceptable since the wiring is exercised
indirectly, but state explicitly that the `useMemo` target-derivation and the `onFocused`
selection callback are the untested glue, and that their logic is fully covered by the
`pickFocusMatchId` + `useFocusMatch` unit/hook tests so the coverage gate stays meaningful.

## Notes (non-blocking, no action required)

- `SetCenter` returns `Promise<boolean>`; the hook should `void` it (or ignore) — the plan's
  pseudocode does not await, which is correct for a fire-and-forget camera glide.
- The plan's choice to keep `pickFocusMatchId` out of a shared lib and inside the roadmap feature
  honors the "do not library-ize domain logic" constraint.
- Immutability test via `deepFreeze` + "no in-place sort" assertion is the right rigor; the impl
  must use a single-pass reduce/min scan (not `[...matches].sort()`), which the plan already
  calls out as O(n).

---

VERDICT: APPROVED
