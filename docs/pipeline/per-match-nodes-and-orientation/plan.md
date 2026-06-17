# Plan: Per-match nodes + phase-specific orientation (layout overhaul)

Convert the roadmap from "group tables + mirrored horizontal bracket" into one continuous
zoomable canvas where **every match is one node**: group matches in **horizontal lanes (one per
group A–L, ordered by kickoff)** flowing down into a **vertical top→bottom knockout tree** (R32 at
top → Final at bottom), standings tables preserved at each lane start, feeder edges linking groups
to the R32 matches they seed.

> Revision #2. Every item in `plan-review.md` (H1, H2, M1, M2, M3, M4, L1, L2) is addressed
> explicitly below; each is tagged `[Rev:Hn/Mn/Ln]` where resolved.

## Scope

### In scope

- Emit a `match` node for **every `GROUP_STAGE` match** (72 in the mock — see derivation below),
  reusing the existing `match` node type and `matchData()` payload.
- Horizontal group band: one lane per group; the `GroupTableNode` stays at lane start (x=0); group
  matches sorted by `Match.kickoff` ascending at strictly-increasing x; each group a distinct lane y.
- Vertical knockout: stage depth → y (R32 top → Final bottom), parent x = midpoint of its two
  children x (fan-in, single not mirrored), `THIRD_PLACE` beside the Final, computed via
  **`d3-hierarchy` (`d3.tree`)** per the library-first policy.
- One continuous canvas: KO band starts at `y >= groupBandHeight + SECTION_GAP`; feeder edges
  (group node → seeded R32 matches) retained and re-routed downward.
- Handle migration to **top (target `t`) + bottom (source `b`)** on `MatchNode` and in `handlesFor`,
  kept in lock-step so edges don't detach; `GroupTableNode` source handle moves to bottom; verify
  `AdvanceEdge` renders cleanly top↔bottom.
- Add `group: string | null` and `matchday: number | null` to `MatchNodeData`; render
  "Group A · MD1" on group cards (Tailwind utilities on the component — `[Rev:L1]`).
- Demote `StageToggle` from layout-swap to a **focus/scroll-to-phase** control; the continuous
  canvas becomes the default and only layout.
- Retune `useFitOnChange` / `useBracketKeyboard` fit-padding for the taller canvas (no new
  node-to-node traversal — `[Rev:M3]`).
- Replace the layout/build-graph unit tests wholesale (they assert the old mirrored/horizontal
  model); add a Playwright smoke test (ctrl+wheel — `[Rev:M4]`).
- Add `d3-hierarchy` + `@types/d3-hierarchy` to `package.json`.
- **Test environment for the handle contract:** assert it through `buildRoadmapGraph` output, not a
  DOM component test — no new test runner deps (Option (b) — `[Rev:H1]`, see Test Strategy).

### Out of scope

- Domain logic: `computeGroups`, `buildBracket`, `R32_SEEDING`, `stage-order`, the mock simulator —
  unchanged (library-first non-goals).
- `parseTournament` / `tournament-schema` — **no change**: domain `Match` already carries
  `group`/`matchday` (`src/domain/types/match.ts:53-55`); only the `MatchNodeData` view model and
  `matchData()` change (`[Rev:L2]`).
- LOD / semantic-zoom engine (`lod.ts`, `useZoomLevel`) — reused as-is; the new group-card label
  reuses the existing `data-lod-detail` hook, no threshold changes.
- `date-fns` / TanStack Query adoption — separate requirements; keep the `Intl`-based `format.ts`.
- Adding Testing Library + jsdom (Option (a) of H1) — explicitly **not** taken; see `[Rev:H1]`.
- `GroupTableNode` internals beyond moving its source handle to the bottom.
- Live polling, data fetching, the API route, `MatchDetailPanel`.

## Approach

Keep `buildRoadmapGraph` as the single immutable `Tournament → {nodes, edges}` transform and keep
the pure layout helpers as the place all geometry lives. Compose three pure passes inside
`build-graph.ts` into one continuous coordinate space — (1) `computeGroupMatchLanes` (group band:
lanes by group, x by kickoff, table at x=0), (2) `computeBracketLayout` rewritten to a vertical
d3-tree offset below the group band, (3) the existing R32 feeder seeding. Migrate handles to
top/bottom in `MatchNode` + `handlesFor` + `GroupTableNode` together. Collapse the 3-view model to a
single continuous layout; repurpose the view enum into a **focus target** (`'all' | 'groups' |
'knockout'`) that drives a scroll/fit camera move, not graph shape.

Use `d3-hierarchy`'s `d3.tree()` for the KO fan-in: a bracket is a balanced binary tree
(16→8→4→2→1), and `d3.tree().nodeSize([...])` gives parent.x = midpoint-of-its-two-children.x for
free — exactly the requirement — **provided the hierarchy's children are enumerated in the same
order as the structural `slotIndex` pairing** (see Data Model / H2). Map d3's normalized `{x, y}`
onto our pitch constants and flip depth so R32 sits at top, Final at bottom.

**Rejected alternative:** keep the existing hand-rolled bottom-up fan-in (transpose x↔y, reverse
depth). It is O(n) and works, but the library-first policy explicitly supersedes hand-rolled tree
layout with `d3-hierarchy` for the bracket; `d3.tree` removes the bespoke `yBySideDepth` accumulator
and the mirrored-half special-casing. (Hand-rolled vertical fan-in — averaging `child[2p]`,
`child[2p+1]` — remains the documented fallback if a `d3-hierarchy` install/SSR issue blocks it; it
must preserve the same `slotIndex` child ordering — `[Rev:H2]`.)

## Files

| Path                                                                                      | Action            | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                            | modify            | Add `d3-hierarchy` dep + `@types/d3-hierarchy` devDep. (Confirmed **absent** today.)                                                                                                                                                                                                                                                                                                                                                                     |
| `src/features/roadmap/layout/layout-constants.ts`                                         | modify            | Add `LANE_PITCH_Y`, `GROUP_MATCH_STEP_X`, `GROUP_GAP`, `TABLE_W`, `STAGE_PITCH_Y`, `LEAF_PITCH_X`, `SECTION_GAP`, `groupBandHeight(groupCount)`. Retire the now-unused horizontal `STEP`/`ROW_PITCH` (and `GROUP_GAP_X`/`GROUP_GAP_Y` if `computeGroupGrid` is deleted). Keep `XY`, `NODE_W/H`, `GROUP_W/H`.                                                                                                                                             |
| `src/features/roadmap/layout/group-layout.ts`                                             | rewrite           | Replace `computeGroupGrid`/`groupGridWidth` (deletion safe — `[Rev:M2]`) with `computeGroupMatchLanes(tournament): GroupLaneLayout` — per-group lane y, table x=0, match positions keyed by `matchId` sorted by `kickoff`.                                                                                                                                                                                                                               |
| `src/features/roadmap/layout/bracket-layout.ts`                                           | rewrite           | Vertical top→bottom KO via `d3-hierarchy` `d3.tree`. New signature `computeBracketLayout(bracket, bandOffsetY)` (`[Rev:M2]`). Children resolved by `slot.source.kind` (`[Rev:H2]`); depth→y downward; midpoint→x; `THIRD_PLACE` beside normalized Final (`[Rev:M1]`). Returns `Map<string, XY>`. Pure, O(n).                                                                                                                                             |
| `src/features/roadmap/build-graph.ts`                                                     | rewrite           | Single continuous graph: emit `match` nodes for every group match (`matchData`) + `group` table nodes + KO match nodes; compose group band above + KO below; feeder edges group→R32; `handlesFor` returns `{sourceHandle:'b', targetHandle:'t'}` for all edges; `matchData` now reads `match.group`/`match.matchday` (`null` in fallback). Drop the 3-view branching + `groupsOnlyGraph`. New signature `buildRoadmapGraph(tournament)` (no `view` arg). |
| `src/features/roadmap/graph-model.ts`                                                     | modify            | Add `group: string \| null` and `matchday: number \| null` to `MatchNodeData`. Replace `RoadmapView = 'groups'\|'bracket'\|'full'` with `RoadmapFocus = 'all'\|'groups'\|'knockout'`.                                                                                                                                                                                                                                                                    |
| `src/components/nodes/MatchNode.tsx`                                                      | modify            | Replace `tl/tr` target + `sl/sr` source handles with one `top` target (`id="t"`) + one `bottom` source (`id="b"`); render "Group A · MD1" label (Tailwind utilities, `data-lod-detail`, `[Rev:L1]`) when `group` set; optional group-vs-KO visual variant.                                                                                                                                                                                               |
| `src/components/nodes/GroupTableNode.tsx`                                                 | modify            | Move the `sr` (Right) source handle to a `bottom` source handle so feeder edges flow downward.                                                                                                                                                                                                                                                                                                                                                           |
| `src/components/edges/AdvanceEdge.tsx`                                                    | verify            | Confirm `getBezierPath` renders cleanly for top↔bottom (positions/`sourcePosition`/`targetPosition` are passed by RF from the handle sides — no code change expected).                                                                                                                                                                                                                                                                                  |
| `src/features/roadmap/hooks/useStageView.ts`                                              | modify            | Default focus `'all'`; persist `?focus=` param; expose `setFocus`. Keep the hook name `useStageView` to minimize churn; rename internals to focus.                                                                                                                                                                                                                                                                                                       |
| `src/components/roadmap/StageToggle.tsx`                                                  | modify            | Repurpose: on change, scroll/fit to the chosen phase via RF `fitBounds`/`setCenter`; no layout swap. Options `All / Groups / Knockout`.                                                                                                                                                                                                                                                                                                                  |
| `src/features/roadmap/hooks/useFitOnChange.ts`                                            | modify            | Retune padding so the taller continuous canvas frames cleanly; key becomes data-length only.                                                                                                                                                                                                                                                                                                                                                             |
| `src/features/roadmap/hooks/useBracketKeyboard.ts`                                        | modify (small)    | **Only** retune fit padding for the taller canvas; keep F/0/Esc bindings. No node-to-node traversal added (`[Rev:M3]`).                                                                                                                                                                                                                                                                                                                                  |
| `src/components/roadmap/RoadmapCanvas.tsx`                                                | modify            | Call `buildRoadmapGraph(tournament)` (no view); wire focus → camera; `useFitOnChange(nodes.length)`.                                                                                                                                                                                                                                                                                                                                                     |
| `src/features/roadmap/hooks/useRoadmapGraph.ts`                                           | modify            | Drop the `view` param: `useRoadmapGraph(tournament)` → memo on `tournament` only.                                                                                                                                                                                                                                                                                                                                                                        |
| `src/app/globals.css`                                                                     | modify (small)    | Keep `.advance-edge` classes; add only a band-divider affordance if needed. Group-card label/variant live as Tailwind on the component (`[Rev:L1]`).                                                                                                                                                                                                                                                                                                     |
| `src/features/roadmap/layout/bracket-layout.test.ts`                                      | rewrite           | New vertical assertions (depth→y monotonic, midpoint→x via slot pairing, third-place beside Final, `bandOffsetY` arg).                                                                                                                                                                                                                                                                                                                                   |
| `src/features/roadmap/layout/group-layout.test.ts`                                        | rewrite           | Cover `computeGroupMatchLanes` (lane count, ordering, x monotonic, distinct lane y, table at x=0).                                                                                                                                                                                                                                                                                                                                                       |
| `src/features/roadmap/build-graph.test.ts`                                                | replace wholesale | New continuous-graph assertions (`[Rev:M2]` — old file imports `computeGroupGrid`/`groupGridWidth` and calls `computeBracketLayout(bracket)` one-arg, all gone). 72 group nodes, 12 tables, KO below band, downward `b`/`t` handles, feeders, purity.                                                                                                                                                                                                    |
| `e2e/per-match-orientation.spec.ts`                                                       | create            | Playwright smoke: load → **ctrl+wheel** zoom (`[Rev:M4]`) → a group match node + a Final node both reachable.                                                                                                                                                                                                                                                                                                                                            |
| `e2e/roadmap.spec.ts`, `e2e/visual.spec.ts`, `e2e/a11y.spec.ts`, `e2e/wheel-zoom.spec.ts` | modify            | Drop `?view=`/the `view=groups` toggle assertion; update to `?focus=`/default; refresh node counts & screenshot baselines.                                                                                                                                                                                                                                                                                                                               |

## Data Model / Types

```ts
// graph-model.ts — MatchNodeData (group/matchday already exist on domain Match — [Rev:L2])
export type MatchNodeData = {
  matchId: string;
  stage: Stage;
  roundLabel: string;
  group: string | null; // NEW — "A".."L" for group matches, null in KO
  matchday: number | null; // NEW — 1..3 group, null otherwise
  home: TeamRef;
  away: TeamRef;
  score: Score;
  status: MatchStatus;
  kickoff: string | null;
  minute: number | null;
  venue: Venue;
  isFinal: boolean;
  isThirdPlace: boolean;
};

// Focus replaces the 3-layout view — camera target only, no graph-shape change.
export type RoadmapFocus = 'all' | 'groups' | 'knockout';

// group-layout.ts
export interface GroupLaneLayout {
  readonly table: ReadonlyMap<string, XY>; // key = group name "A".."L"; x=0, y=lane
  readonly matches: ReadonlyMap<string, XY>; // key = group-match matchId
  readonly bandHeight: number; // = groupBandHeight(groupCount)
}
export function computeGroupMatchLanes(tournament: Tournament): GroupLaneLayout;

// layout-constants.ts (illustrative values; tune in impl — tests assert RELATIONS, not absolutes)
export const LANE_PITCH_Y = GROUP_H + 40; // distance between group lanes
export const TABLE_W = GROUP_W; // table width consumed before matches
export const GROUP_GAP = 56; // gap table → first match
export const GROUP_MATCH_STEP_X = NODE_W + 56; // x step between matches in a lane
export const STAGE_PITCH_Y = NODE_H + 110; // vertical distance between KO stages
export const LEAF_PITCH_X = NODE_W + 36; // horizontal spacing of R32 leaves
export const SECTION_GAP = 240; // group band → KO band gap
export function groupBandHeight(groupCount: number): number; // groupCount * LANE_PITCH_Y

// bracket-layout.ts — d3-hierarchy, NEW two-arg signature ([Rev:M2])
import { hierarchy, tree } from 'd3-hierarchy';
export function computeBracketLayout(bracket: Bracket, bandOffsetY: number): Map<string, XY>;
```

### `matchData()` change (`[Rev:L2]`)

`matchData(node, match)` in `build-graph.ts` is the only place `MatchNodeData` is populated. It now
also emits `group`/`matchday`:

- concrete-match branch: `group: match.group`, `matchday: match.matchday`;
- bracket-node-without-match fallback branch: `group: null`, `matchday: null`.
  No schema/parse change — domain `Match.group`/`Match.matchday` already exist.

### Group lane layout (`computeGroupMatchLanes`)

- Group-stage matches = `tournament.matches.filter(m => m.stage === 'GROUP_STAGE')`. **Count is
  derived from the fixture, not hardcoded**; for the 48-team mock it is `12 groups × 3 matchdays × 2
= 72`.
- For each group letter in `A..L` order (lane index `i`): `laneY = i * LANE_PITCH_Y`. Table position
  `{x: 0, y: laneY}` keyed by group name.
- That group's matches, **sorted by `kickoff.localeCompare` ascending** (kickoff is ISO-UTC, so
  lexical == chronological; tie-break on `id` for determinism), get
  `{x: TABLE_W + GROUP_GAP + orderIndex * GROUP_MATCH_STEP_X, y: laneY}`. So x strictly increases
  with kickoff; all matches in a lane share `laneY`; each lane has a distinct y.
- `bandHeight = groupBandHeight(groupCount)`.

### KO layout via d3-hierarchy (`[Rev:H2]`, `[Rev:M1]`)

- **Children resolution (the H2 fix).** `BracketSlot.source` is the discriminated union
  `{kind:'group'|'winnerOf'|'loserOf', ...}` — there is **no bare `matchId`** on a slot. Build the
  d3 hierarchy with a child accessor that switches on `kind`:
  - root = the FINAL `BracketNode`;
  - a node's children = `[node.home, node.away]` mapped to the `BracketNode` referenced by
    `source.matchId` **only when `source.kind === 'winnerOf'`**; stop (leaf) when
    `source.kind === 'group'` (the R32 leaves);
  - resolve a `matchId` → `BracketNode` via a `Map` built from `bracket.rounds.flatMap(r => r.nodes)`.
- **Order = `slotIndex` pairing (the midpoint guarantee).** Children **must** be enumerated so that
  for parent slot `p`, the top child is the node feeding `home` (which in `build-bracket.ts:94-97`
  is `childNodes[p*2]`) and the bottom child is `away` (`childNodes[p*2+1]`). Emitting children in
  `[home, away]` order preserves exactly this `slot*2 / slot*2+1` ordering, so `d3.tree`'s laid-out
  leaf order matches the structural `slotIndex` order and `parent.x` coincides with the **structural**
  midpoint the acceptance test asserts (`build-bracket.ts:94-97`). Without this ordering the midpoint
  holds against d3's own x but not the structural pairing — the test could fail.
- **Coordinates.** `d3.tree().nodeSize([LEAF_PITCH_X, STAGE_PITCH_Y])` → use `node.x` for x and flip
  depth for y: `y = bandOffsetY + (maxDepth - node.depth) * STAGE_PITCH_Y` so R32 leaves
  (deepest) sit at top and the Final (depth 0) at the bottom. `bandOffsetY = groupBandHeight +
SECTION_GAP` is passed in from `build-graph.ts`.
- **x-origin normalization order (`[Rev:M1]`).** After the tree pass, compute `minX` over all tree
  nodes and shift every tree node by `-minX` so the canvas starts at x≥0. **THIRD_PLACE is placed
  AFTER this shift, relative to the already-normalized Final x:** `{x: normalizedFinalX +
LEAF_PITCH_X, y: finalY}`. THIRD_PLACE has no `winnerOf` children (its slots are `loserOf` the two
  semifinals — `build-bracket.ts:148-153`), so it is **excluded from the midpoint-x assertion** and
  is not part of the d3 tree. Layout and tests therefore agree on the same normalized origin.

### Handles

- `MatchNode`: one `top` target (`id="t"`, `Position.Top`) + one `bottom` source (`id="b"`,
  `Position.Bottom`). Remove `tl/tr/sl/sr`.
- `handlesFor()` collapses to a constant `{ sourceHandle: 'b', targetHandle: 't' }` for **all**
  advance + feeder edges (child is always above its parent in the vertical layout).
- `GroupTableNode`: source handle moves to `Position.Bottom` (feeder edges flow down to R32).

## Test Strategy

Vitest **node-environment** unit tests (pure layout + build-graph — fixture-derived counts, never
hardcoded) + one Playwright smoke. **No DOM component test and no new test-runner deps.**

### Test-environment decision — Option (b) (`[Rev:H1]`)

`vitest.config.ts` runs `environment: 'node'` with `include: ['src/**/*.test.ts']` (no `.tsx`) and
`package.json` has no `@testing-library/react`, `jest-dom`, `user-event`, or `jsdom`/`happy-dom`. We
**drop the DOM MatchNode component test** and instead:

- assert the handle-id contract purely through `buildRoadmapGraph` output — every advance and feeder
  edge has `sourceHandle === 'b'` and `targetHandle === 't'`, and **no** edge uses `sl/sr/tl/tr`;
- assert the rendered top/bottom handles + the "Group A · MD1" label in the **Playwright** DOM smoke
  (real browser) instead of jsdom;
- restate the **≥80% coverage target against the changed layout/build-graph modules only** — exactly
  what `vitest.config.ts` `coverage.include` already scopes (`src/features/roadmap/layout/**`,
  `src/features/roadmap/build-graph.ts`). No `.tsx` glob, no jsdom, no setup file is added.

### Behaviors to test (unit — `src/**/*.test.ts`, node env)

**`computeGroupMatchLanes`** (`group-layout.test.ts`)

1. Emits a position for every `GROUP_STAGE` match (count == `matches.filter(stage==='GROUP_STAGE')`
   → 72 for the mock, derived not hardcoded).
2. Within each lane, matches ordered by ascending `kickoff` → x strictly increasing; all share one `y`.
3. Each group gets a **distinct** lane `y`; lane order follows `A..L`.
4. Table position is at `x=0` at the lane's `y`; first match x ≥ `TABLE_W + GROUP_GAP`.
5. Pure: structurally equal across calls; does not mutate a deep-frozen tournament.

**`computeBracketLayout` (vertical)** (`bracket-layout.test.ts`) 6. Positions every bracket node (32 including THIRD_PLACE). 7. KO `y` increases monotonically with stage depth (R32 minimal/top → FINAL maximal/bottom). 8. Each parent's `x` equals the midpoint of its two **structural** children's `x` (±ε), where
children are resolved via `slot.source.kind==='winnerOf'` → `source.matchId` (the H2 ordering).
THIRD_PLACE excluded (no winner children — `[Rev:M1]`). 9. `THIRD_PLACE` is adjacent to FINAL: same `y`, `x == finalX + LEAF_PITCH_X` after normalization. 10. Every node `x >= 0` (normalized) and every `y >= bandOffsetY`; pure + immutable; honors the
`bandOffsetY` arg (calling with a different offset shifts all y by the delta).

**`buildRoadmapGraph` (continuous)** (`build-graph.test.ts`, replaces the file wholesale) 11. Exactly one `match` node per `GROUP_STAGE` match (72) + one per bracket node (32) + one `group`
node per group (12); no duplicate ids. 12. Exactly one `group` table node per group, at its lane start (x=0). 13. Group band occupies the top y-range; every KO node `y >= groupBandHeight + SECTION_GAP`. 14. **Handle contract (H1 Option (b)):** every advance + feeder edge has `sourceHandle:'b'` /
`targetHandle:'t'`; no edge uses `sl/sr/tl/tr`. 15. Feeder edges connect each group to exactly the R32 matches it seeds (count derived from
`R32_SEEDING`, same derivation as the old `full` view test). 16. `MatchNodeData.group`/`matchday` populated from the domain match for group cards; `null` for KO
nodes (incl. the bracket-node-without-match fallback). 17. Purity: equal output across calls; no mutation of a deep-frozen tournament.

### E2E (Playwright smoke) — `e2e/per-match-orientation.spec.ts`

18. Load `/` → `.react-flow__node` visible → **ctrl+wheel** zoom (reuse the `ctrlWheel` helper
    pattern from `e2e/wheel-zoom.spec.ts:51-67` — the canvas uses `panOnScroll`, so plain wheel pans;
    only ctrl+wheel zooms — `[Rev:M4]`) → a group-stage match node (a `.react-flow__node`
    rendering a "Group · MD" label) **and** a Final node (`[data-final="true"]`, selector already
    valid — `MatchNode` renders `data-final`) are both reachable in the DOM. This is also where the
    rendered top/bottom-handle + group-label assertions live (real browser, not jsdom).

### Coverage

**≥80%** on the changed `src/features/roadmap/layout/**` + `src/features/roadmap/build-graph.ts`
modules (the existing `coverage.include` scope). `npm run test` green.

## Risks & Open Questions

- **`d3-hierarchy` not yet installed.** Confirmed absent from `package.json`. Implementer adds
  `d3-hierarchy` + `@types/d3-hierarchy`. Fallback: hand-rolled vertical fan-in averaging
  `child[2p]`/`child[2p+1]` x, preserving the `slotIndex` child ordering — documented exception.
- **All old layout/build-graph tests assert the OLD model and are replaced wholesale, not patched
  (`[Rev:M2]`).** `build-graph.test.ts` imports `computeGroupGrid`/`groupGridWidth` (deleted) and
  calls `computeBracketLayout(tournament.bracket)` one-arg (signature now two-arg) at lines 32, 61,
  87, 157; `bracket-layout.test.ts` asserts mirrored x/`sr→tl`/`sl→tr`. Any leftover import of a
  deleted symbol breaks `tsc`. The whole files are rewritten.
- **`computeGroupGrid`/`groupGridWidth` deletion is safe (`[Rev:M2]`).** Grep confirms the only
  references are `build-graph.ts`, `build-graph.test.ts`, and `groupsOnlyGraph` (itself removed).
  No other caller; deletion will not break `tsc`.
- **`computeBracketLayout` signature ripple (`[Rev:M2]`).** Changing to `(bracket, bandOffsetY)`
  breaks the one-arg call in `build-graph.ts:93` and the two test call sites — all are rewritten in
  this change set, so the ripple is contained.
- **`RoadmapView` → `RoadmapFocus` removal touches 6 files.** `graph-model`, `useStageView`,
  `StageToggle`, `RoadmapCanvas`, `useRoadmapGraph`, and `build-graph` all reference the old enum /
  `view` arg. Must change together or the build breaks. The e2e "stage toggle switches views" test
  becomes a focus/scroll test (or is dropped) — `[Rev:M3]`-adjacent.
- **Keyboard is fit-padding only (`[Rev:M3]`).** `useBracketKeyboard` binds only F/0/Esc — there is
  **no** node-to-node traversal to extend. The only change is retuning fit padding for the taller
  canvas. Any cross-phase traversal would be net-new work with its own tests and is **out of scope**.
- **Canvas grows wide and tall.** A lane of 6 matches + a 296px table is wide; the canvas is much
  taller. ~116 nodes (72+32+12) stays within the <300-node SVG/DOM budget. `fitView` padding tuned
  so the smoke + visual tests pass.
- **Handle id rename detaches edges if half-done.** `MatchNode` ids (`t`/`b`), `handlesFor` output,
  and `GroupTableNode`'s handle must change in one pass; any mismatch silently drops edges.
- **Visual regression baselines.** `e2e/visual.spec.ts` screenshots all change; baselines must be
  regenerated (`test:e2e:update`). Flag, don't auto-bless.

### Open questions (non-blocking — sensible defaults chosen)

- Exact pitch constant values are tuning, not contract — tests assert ordering/monotonic/midpoint
  **relations**, not absolutes. Defaults in Data Model.
- Keep `?focus=` URL persistence (cheap, shareable, mirrors old `?view=`), default `'all'`.

## Acceptance Criteria

1. `buildRoadmapGraph(tournament)` emits exactly one `match` node per `GROUP_STAGE` match
   (== `matches.filter(m=>m.stage==='GROUP_STAGE').length`; 72 for the mock).
2. Within each group lane, match nodes are ordered by ascending `kickoff` with strictly increasing
   x; every node in a lane shares one y; each group has a distinct lane y in A..L order.
3. Exactly one `group` table node per group remains, at its lane start (x=0).
4. KO node y increases monotonically by stage depth (R32 minimal/top → FINAL maximal/bottom); each
   KO parent's x equals the midpoint of its two **structural** children's x (±ε), with children
   resolved via `slot.source.kind==='winnerOf'` in `slotIndex` order; `THIRD_PLACE` is adjacent to
   the normalized Final x and excluded from the midpoint assertion.
5. Every advance and feeder edge uses `sourceHandle:'b'` (bottom of child) / `targetHandle:'t'` (top
   of parent); no `sl/sr/tl/tr` handle ids remain on `MatchNode` or `GroupTableNode`.
6. One continuous canvas: the group band occupies the top y-range and every KO node satisfies
   `y >= groupBandHeight + SECTION_GAP`; feeder edges connect each group to the R32 matches it seeds.
7. `MatchNodeData` includes `group`/`matchday`; group match cards render "Group A · MD1" (Tailwind on
   the component); `parseTournament`/schema unchanged.
8. The KO fan-in is computed with `d3-hierarchy`'s `d3.tree` (or the justified hand-rolled fallback
   that preserves the `slotIndex` child ordering).
9. Layout helpers are pure and O(n); `buildRoadmapGraph` does not mutate a deep-frozen tournament and
   returns structurally-equal output across calls.
10. Playwright smoke passes: after load and a **ctrl+wheel** zoom, a group-stage match node and a
    Final node (`[data-final="true"]`) are both reachable in the DOM.
11. `npm run test` passes (rewritten layout + build-graph unit tests, node env, no new deps) with
    **≥80% coverage on the changed `layout/**`+`build-graph.ts`modules** (the existing`coverage.include` scope).
