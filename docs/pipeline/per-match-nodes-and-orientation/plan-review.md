# Plan Review: Per-match nodes + phase-specific orientation (Revision #3)

**Reviewed:** `plan.md` (post-Vite rewrite) against `requirements/per-match-nodes-and-orientation.md`
and the live codebase.
**Date:** 2026-06-17

## Summary

This is a strong, unusually well-researched plan and it clears the bar. I independently re-verified
its load-bearing codebase claims by reading source — almost all are accurate, including the hard
ones: the `slot*2 / slot*2+1` structural pairing (`build-bracket.ts:89-90`), the `SlotSource`
discriminated union with no bare `matchId` (`bracket.ts:12-15`), `THIRD_PLACE` as `loserOf` the
semifinals (`build-bracket.ts:147-148`), `Match.group`/`Match.matchday` already on the domain type
(`match.ts:53-55`) and populated by the mock (`build-mock-tournament.ts:171-176`), `d3-hierarchy` +
`@types/d3-hierarchy` installed (`package.json:51,58`), `panOnScroll` on the canvas
(`RoadmapCanvas.tsx:91`), and the `ctrlWheel` e2e helper at `wheel-zoom.spec.ts:50-67`. The fixture
math (104 matches − 32 bracket nodes = 72 group matches) is correct and corroborated by the existing
test header and `roadmap.spec.ts:10`. Group kickoffs are distinct within a lane
(`iso(5, 11+md*4, 12+(g%4)*2, n*30)` gives distinct hour-per-matchday + minute-per-pair), so the
strict-ascending ordering is well-defined.

A prior review (Revision #2) approved an earlier iteration and resolved its H1/H2/M1–M4; the current
plan.md has folded those in (the group-match → `MatchNodeData` construction path is now spelled out
at plan lines 209-211; the smoke uses ctrl+wheel; THIRD_PLACE is normalized then excluded from the
midpoint assertion; no schema change). My fresh pass confirms those resolutions hold against the code
and adds one new factual correction plus a few small gaps.

There are **no CRITICAL or HIGH defects**. The blast-radius analysis is accurate — a grep for
`buildRoadmapGraph`/`RoadmapView`/`?view=`/`computeGroupGrid` surfaces no source consumer the plan
fails to enumerate. **Approved.**

## Findings

### CRITICAL

_None._

### HIGH

_None._

### MEDIUM

**M1 — `group-layout.test.ts` does NOT exist; the plan says "rewrite" it (twice).**
The Files table (plan line 143) lists `src/features/roadmap/layout/group-layout.test.ts` with action
**rewrite**, and the Risks section (plan line 328) claims "`group-layout.test.ts` covers
`computeGroupGrid`". I globbed and attempted to Read that path: it is **absent**. `computeGroupGrid`
is currently exercised only indirectly via `build-graph.test.ts`. Correct action is **create**, not
rewrite; the "old file imports deleted symbols" risk is moot for it. The work (unit-test
`computeGroupMatchLanes`) is unaffected, but the inaccuracy could send the implementer hunting for a
non-existent file. *Fix:* change the action to **create** and drop the false "covers
`computeGroupGrid`" claim.

**M2 — Pin the `GroupTableNode` source-handle id as `'b'` in one authoritative place.**
The plan collapses `handlesFor` to a constant `{ sourceHandle: 'b', targetHandle: 't' }` for **all**
edges including feeders (plan line 251). The current table node uses `id="sr"`
(`GroupTableNode.tsx:19`). The Files-table row (line 133) and Handles section (line 253) say "move to
`Position.Bottom` (`id="b"`)" — good, but the constant `handlesFor` output and the table-node handle
id must be asserted to be the *same* literal `'b'`, or feeder edges silently detach (the exact
failure the plan itself warns about). *Fix:* state once, authoritatively, that the `GroupTableNode`
source handle id is `'b'`, and have build-graph test #14/#15 assert feeder edges use
`sourceHandle:'b'`/`targetHandle:'t'` too (not just advance edges).

**M3 — Mark the e2e `?view=` removals as REQUIRED for `npm run test`/CI, not cosmetic.**
`roadmap.spec.ts:21-25` ("stage toggle switches views") asserts `view=groups` in the URL and the
presence of `Full roadmap`/`Bracket` tabs; once the enum becomes `focus`, that test fails. The plan
lists updating `e2e/{roadmap,visual,a11y,wheel-zoom}.spec.ts`, but the visual/a11y edits read as
housekeeping. They are load-bearing: every `page.goto('/?view=bracket')` becomes a silent no-op
resolving to default focus, and the roadmap toggle test must be rewritten to the
`All/Groups/Knockout` focus control or it red-fails. *Fix:* elevate these from "modify" notes to
required acceptance items, and explicitly rewrite the `roadmap.spec.ts` toggle test.

### LOW

**L1 — `AdvanceEdge` curvature for feeder edges with large horizontal offset.** The plan marks
`AdvanceEdge` "verify, no code change expected" — correct, `getBezierPath` reads RF-passed
`sourcePosition`/`targetPosition`, so top↔bottom routes. But feeders now run from a table node in the
top band **down and far across** to R32 leaves; a `curvature: 0.35` Bottom→Top bezier with a large
dx can loop awkwardly. Visual-only; the plan already permits a curvature bump. Flag for the visual
pass.

**L2 — `useFitOnChange` key drops the `view` prefix.** `RoadmapCanvas.tsx:68` keys on
`` `${view}:${nodes.length}` ``; the plan keys on `nodes.length` only. Correct now that there is one
graph and no view swap, but two tournaments with identical node counts would not re-fit. Acceptable
for a single-fixture app; worth a one-line note.

**L3 — "reuses the existing `data-lod-detail` hook" overstates it.** `data-lod-detail` is a plain
attribute the CSS fades via the `[data-lod]` band on `.pitch-grid` (no React hook). Decide
deliberately whether "Group A · MD1" is detail-tier (hidden at overview) or identity-tier (always
shown) — a group-identifying label likely wants to stay visible. Pick intentionally, not by
copy-paste.

**L4 — `data-final` selector is valid; keep `isFinal:false` on group nodes.** The smoke uses
`[data-final="true"]`; `MatchNode` renders `data-final={isFinal}`, which serializes to
`data-final="true"` only when `true` (and `roadmap.spec.ts:28` already relies on this). No action —
just ensure the new group-stage `matchData` path emits `isFinal:false`/`isThirdPlace:false`, which
plan line 209-210 already specifies.

## Checklist outcome

- **Completeness:** All 6 resolved decisions + every requirement acceptance criterion map to plan
  acceptance criteria and tests. Cross-phase keyboard traversal is explicitly descoped with a
  documented rationale and a reviewer flag — acceptable (see note).
- **Feasibility:** Verified against source; `d3.tree().nodeSize([...])` with `[home, away]` children
  yields parent.x = midpoint for a balanced binary bracket. Realistic.
- **Architecture:** Pure layout helpers, single immutable transform, focus-as-camera (not
  layout-swap). Sound boundaries, no scope creep, files stay small.
- **Reuse:** Uses installed `d3-hierarchy`; reuses the `match` node type, `matchData`, `R32_SEEDING`,
  the LOD engine, and the existing e2e helpers. No reinvention; domain logic untouched per Non-goals.
- **Test strategy:** RED/GREEN clear; counts fixture-derived not hardcoded; edge cases (third-place
  exclusion, orphan-match fallback, purity, distinct lane y, downward handles, continuous-canvas y
  ranges, feeders) enumerated; ≥80% on the `coverage.include`-scoped `layout/**` + `build-graph.ts`.
  Component-render coverage rests on the optional jsdom test + the smoke — adequate.
- **Non-functionals:** No new input boundary/secret/authz (pure transform). Node budget ~116 < 300,
  within perf budget; accessibility preserved via existing semantic nodes; compositor-only animation
  retained.
- **Risks:** Real risks (handle-rename detach, signature ripple, symbol deletion, enum removal across
  6 files, visual-baseline regen, width/height growth, browser unavailability) all named with
  mitigations.

## Reviewer note on the keyboard-traversal scope decision

The requirement says traversal "spans group + KO". The plan documents that `useBracketKeyboard` binds
only F/0/Esc today (verified — `useBracketKeyboard.ts:8-14`), so there is no existing traversal to
"extend"; it treats node-to-node cross-phase traversal as net-new, out of scope, with a reviewer
flag. I **accept** this — inventing focus-management is a separable feature with its own tests, and
it is surfaced as an open question rather than silently dropped. The requester should confirm, but it
does not block the plan.

## Verdict

VERDICT: APPROVED
