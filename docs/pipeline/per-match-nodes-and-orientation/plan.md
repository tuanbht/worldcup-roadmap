# Plan: Per-match nodes + phase-specific orientation (layout overhaul)

Convert the roadmap from "group tables + mirrored horizontal bracket" into one continuous
zoomable canvas where **every match is one node**: group matches in **horizontal lanes (one
per group A–L, ordered by kickoff)** flowing down into a **vertical top→bottom knockout tree**
(R32 at top → Final at bottom), standings tables preserved at each lane start, feeder edges
linking groups to the R32 matches they seed.

## Scope

### In scope
- Emit a `match` node for **every `GROUP_STAGE` match** (72 in the mock), reusing the existing
  `match` node type and `matchData()` payload.
- Horizontal group band: one lane per group; the `GroupTableNode` stays at lane start (x=0);
  group matches sorted by `Match.kickoff` ascending at strictly-increasing x; each group a
  distinct lane y.
- Vertical knockout: stage depth → y (R32 top → Final bottom), parent x = midpoint of its two
  children x (fan-in, single not mirrored), `THIRD_PLACE` beside the Final, computed via
  **`d3-hierarchy` (`d3.tree`)** per the library-first policy.
- One continuous canvas: KO band starts at `y >= groupBandHeight + SECTION_GAP`; the existing
  feeder edges (group node → seeded R32 matches) are retained and re-routed downward.
- Handle migration to **top (target) + bottom (source)** on `MatchNode` and in `handlesFor`,
  kept in lock-step so edges don't detach; `AdvanceEdge` verified for vertical routing.
- Add `group: string | null` and `matchday: number | null` to `MatchNodeData`; render
  "Group A · MD1" on group cards.
- Demote `StageToggle` from layout-swap to a **focus/scroll-to-phase** control; the continuous
  canvas becomes the default and only layout.
- Update `useStageView`, `useBracketKeyboard`, `useFitOnChange` for the new default + taller canvas.
- Rewrite the existing layout/build-graph unit tests (they assert the old mirrored/horizontal
  behavior) and add a Playwright smoke test.
- Add `d3-hierarchy` + `@types/d3-hierarchy` to `package.json` (verify first; the in-flight
  req #3 was supposed to add it — if already present, no-op).

### Out of scope
- Domain logic: `computeGroups`, `buildBracket`, `R32_SEEDING`, `stage-order`, the mock
  simulator — unchanged (library-first non-goals).
- LOD / semantic-zoom engine (`lod.ts`, `useZoomLevel`) — reused as-is; only `data-lod-detail`
  hooks on the new group-card label, no threshold changes.
- Adopting `date-fns`/Tailwind migration / TanStack Query — separate requirements; keep the
  current `Intl`-based `format.ts`.
- Changing `GroupTableNode` internals beyond its (already-present) source handle.
- Live polling, data fetching, the API route, `MatchDetailPanel`.

## Approach

Keep `buildRoadmapGraph` as the single immutable `Tournament → {nodes, edges}` transform and
keep the pure layout helpers as the place all geometry lives. Compose three pure layout passes —
(1) `computeGroupMatchLanes` (group band: lanes by group, x by kickoff), (2) `computeBracketLayout`
rewritten to a vertical d3-tree (KO band, offset below the group band), (3) the existing feeder
seeding — into one continuous coordinate space inside `build-graph.ts`. Migrate handles to
top/bottom in `MatchNode` + `handlesFor` together. Collapse the 3-view model to a single
continuous layout; repurpose `RoadmapView` into a **focus target** (`'all' | 'groups' | 'knockout'`)
that drives scroll/fit, not graph shape.

Use `d3-hierarchy`'s `d3.tree()` for the KO fan-in: a bracket is a binary tree, and `d3.tree`
gives midpoint-of-children x for free, exactly the requirement. Root the hierarchy at the Final
with children = its feeder matches (recursing down to R32 leaves), then map d3's normalized
`{x, y}` onto our pitch constants (`x → LEAF_PITCH_X scale`, `depth → STAGE_PITCH_Y`), and flip y
so depth increases downward. `THIRD_PLACE` is not in the tree (it's a Final sibling) — place it
beside the Final after the tree pass.

**Rejected alternative:** keep the existing hand-rolled bottom-up fan-in (just transpose x↔y and
reverse depth). It works and is O(n), but the library-first policy explicitly supersedes
hand-rolled tree layout with `d3-hierarchy` for the bracket; using `d3.tree` removes the bespoke
`yBySideDepth` accumulator and the mirrored-half special-casing, and is the reviewer-preferred path.
(Hand-rolled fan-in remains the documented fallback if a `d3-hierarchy` install/SSR issue blocks it.)

## Files

| Path | Action | Responsibility |
|---|---|---|
| `package.json` | modify | Add `d3-hierarchy` dep + `@types/d3-hierarchy` devDep (verify not already added by req #3). |
| `src/features/roadmap/layout/layout-constants.ts` | modify | Add `LANE_PITCH_Y`, `GROUP_MATCH_STEP_X`, `STAGE_PITCH_Y`, `LEAF_PITCH_X`, `SECTION_GAP`, `TABLE_W`, `groupBandHeight(groupCount)`. Reinterpret/retire horizontal `STEP`/`ROW_PITCH`. Keep `XY`, `NODE_W/H`, `GROUP_W/H`. |
| `src/features/roadmap/layout/group-layout.ts` | modify | Add `computeGroupMatchLanes(tournament): GroupLaneLayout` — per-group lane y, table x=0, match positions keyed by `matchId` sorted by kickoff. Keep `computeGroupGrid`/`groupGridWidth` only if still referenced (grid view is being removed — likely delete). |
| `src/features/roadmap/layout/bracket-layout.ts` | rewrite | Vertical top→bottom KO via `d3-hierarchy` `d3.tree`: build hierarchy rooted at Final, map to pitch coords (depth→y downward, midpoint→x), offset y by `groupBandHeight + SECTION_GAP`, place `THIRD_PLACE` beside Final. Returns `Map<string, XY>`. Pure, O(n). |
| `src/features/roadmap/build-graph.ts` | rewrite | Single continuous graph: emit `match` nodes for every group match (reuse `matchData`) + `group` table nodes + KO match nodes; compose group band above + KO below; feeder edges group→R32; `handlesFor` returns top/bottom handles; keep purity/immutability. Drop the 3-view branching. |
| `src/features/roadmap/graph-model.ts` | modify | Add `group: string \| null` and `matchday: number \| null` to `MatchNodeData`. Replace `RoadmapView = 'groups'\|'bracket'\|'full'` with focus type `'all'\|'groups'\|'knockout'`. |
| `src/components/nodes/MatchNode.tsx` | modify | Replace left/right handles with `top` (target id `t`) + `bottom` (source id `b`); render "Group A · MD1" label when `group` is set (LOD-tagged); optional group-vs-KO visual variant. |
| `src/components/edges/AdvanceEdge.tsx` | verify/modify | Confirm `getBezierPath` renders cleanly top↔bottom; no structural change expected (positions are passed by RF). |
| `src/components/nodes/GroupTableNode.tsx` | modify | Migrate its `sr` (Right) source handle to a `bottom` source handle so feeder edges flow downward. |
| `src/features/roadmap/hooks/useStageView.ts` | modify | Default focus `'all'`; persist `?focus=` param; expose `setFocus`. (Rename file/hook to `useFocus`/keep name — keep `useStageView` name to minimize churn, update internals.) |
| `src/components/roadmap/StageToggle.tsx` | modify | Repurpose: on change, scroll/fit to the chosen phase (group band / KO band / all) via React Flow `fitBounds`/`setCenter`; no layout swap. |
| `src/features/roadmap/hooks/useBracketKeyboard.ts` | modify | Traversal spans group + KO in structural/date order; fit handles the taller canvas. |
| `src/features/roadmap/hooks/useFitOnChange.ts` | modify | Re-fit framing the taller continuous canvas (padding tuned; key now data-length only). |
| `src/components/roadmap/RoadmapCanvas.tsx` | modify | Wire focus control instead of view; minor — graph is always the continuous one. |
| `src/app/globals.css` | modify (small) | Add the group-card label / group-variant styles + any band-divider affordance; keep advance-edge classes. |
| `src/features/roadmap/layout/bracket-layout.test.ts` | rewrite | New vertical assertions (depth→y monotonic, midpoint→x, third-place beside Final). |
| `src/features/roadmap/layout/group-layout.test.ts` | create | Cover `computeGroupMatchLanes` (lane count, ordering, x monotonic, distinct lane y, table at x=0). |
| `src/features/roadmap/build-graph.test.ts` | rewrite | New continuous-graph assertions (72 group nodes, 12 tables, KO below band, downward handles, feeders, purity). |
| `e2e/per-match-orientation.spec.ts` | create | Playwright smoke: load → wheel-zoom → a group match node + a Final node both reachable. |
| `e2e/roadmap.spec.ts`, `e2e/wheel-zoom.spec.ts`, `e2e/visual.spec.ts`, `e2e/a11y.spec.ts` | modify | Update for removed `?view=` (now `?focus=`/default), new node counts, new screenshot baselines. |

## Data Model / Types

```ts
// graph-model.ts — extend MatchNodeData (group/matchday already exist on domain Match)
export type MatchNodeData = {
  matchId: string;
  stage: Stage;
  roundLabel: string;
  group: string | null;      // NEW — "A".."L" for group matches, null in KO
  matchday: number | null;   // NEW — 1..3 group, null otherwise
  home: TeamRef; away: TeamRef; score: Score; status: MatchStatus;
  kickoff: string | null; minute: number | null; venue: Venue;
  isFinal: boolean; isThirdPlace: boolean;
};

// Focus replaces the 3-layout view (no graph-shape change, only camera target)
export type RoadmapFocus = 'all' | 'groups' | 'knockout';

// group-layout.ts
export interface GroupLaneLayout {
  readonly table: ReadonlyMap<string, XY>;   // key = group name "A".."L", x=0, y=lane
  readonly matches: ReadonlyMap<string, XY>; // key = group-match matchId
  readonly bandHeight: number;               // = groupBandHeight(groupCount)
}
export function computeGroupMatchLanes(tournament: Tournament): GroupLaneLayout;

// layout-constants.ts (illustrative values; tune in impl)
export const LANE_PITCH_Y = GROUP_H + 40;       // distance between group lanes
export const GROUP_MATCH_STEP_X = NODE_W + 56;  // x step between matches in a lane
export const TABLE_W = GROUP_W;                  // table width consumed before matches
export const GROUP_GAP = 56;                     // gap table→first match
export const STAGE_PITCH_Y = NODE_H + 110;       // vertical distance between KO stages
export const LEAF_PITCH_X = NODE_W + 36;         // horizontal spacing of R32 leaves
export const SECTION_GAP = 240;                  // group band → KO band gap
export function groupBandHeight(groupCount: number): number; // groupCount * LANE_PITCH_Y

// bracket-layout.ts — d3-hierarchy
import { hierarchy, tree } from 'd3-hierarchy';
export function computeBracketLayout(bracket: Bracket, bandOffsetY: number): Map<string, XY>;
```

KO layout via d3: build a `HierarchyNode` rooted at the Final whose `children` are resolved from
each node's `home.source`/`away.source` `matchId` (winnerOf links), recursing to R32 leaves.
`d3.tree().nodeSize([LEAF_PITCH_X, STAGE_PITCH_Y])` yields x = midpoint of children automatically.
Map: `x = d3.x`, `y = bandOffsetY + (maxDepth - d3.depth) * STAGE_PITCH_Y` so R32 (deepest leaves)
sit at top and Final (depth 0) at the bottom. Place `THIRD_PLACE` at `{ x: finalX + LEAF_PITCH_X,
y: finalY }`. Normalize the x origin to 0+ for a stable canvas.

Handles: `MatchNode` source `b` (bottom), target `t` (top). `handlesFor()` → `{ sourceHandle:'b',
targetHandle:'t' }` for all advance + feeder edges (always child-above → parent-below).
`GroupTableNode` source handle moves to `Position.Bottom`.

## Test Strategy

Vitest unit (pure, fixture-derived — never hardcode counts independent of the fixture) + one
Playwright smoke. Coverage target **≥80%** on changed layout/build-graph modules.

### Behaviors to test (unit)
**`computeGroupMatchLanes`**
1. Emits a position for every `GROUP_STAGE` match in `tournament.matches` (== group-match count;
   derive from `matches.filter(stage==='GROUP_STAGE')` → 72 for the mock).
2. Within each group lane, matches are ordered by ascending `kickoff` → x strictly increases with
   kickoff order; all matches in a lane share one `y`.
3. Each group gets a **distinct** lane `y`; lane order follows group letter A..L.
4. Each group's table position is at `x = 0` at the lane's `y`; first match x ≥ `TABLE_W + GROUP_GAP`.
5. Pure: structurally equal across repeated calls; does not mutate a frozen tournament.

**`computeBracketLayout` (vertical)**
6. Positions every bracket node (all 32).
7. KO `y` increases monotonically with stage depth (R32 minimal/top → FINAL maximal/bottom).
8. Each parent's `x` equals the midpoint of its two children's `x` (±ε).
9. `THIRD_PLACE` is adjacent to FINAL (same/near y, offset x), below the band.
10. Every KO `y >= bandOffsetY`; pure + immutable.

**`buildRoadmapGraph` (continuous)**
11. Exactly one `match` node per `GROUP_STAGE` match (72) + one per bracket node (32) + one
    `group` node per group (12); no duplicate ids.
12. Exactly one `group` table node per group remains, at its lane start (x=0).
13. Group band occupies the top y-range; every KO node `y >= groupBandHeight + SECTION_GAP`.
14. All advance + feeder edges use `sourceHandle:'b'` / `targetHandle:'t'`; **no** `sl/sr/tl/tr`
    left/right handles remain.
15. Feeder edges connect each group to exactly the R32 matches it seeds (same count as today's
    derivation from `R32_SEEDING`).
16. `MatchNodeData.group`/`matchday` populated from the domain match for group cards, null for KO.
17. Purity: equal output across calls; no mutation of a deep-frozen tournament.

**Component (Testing Library, light)**
18. `MatchNode` renders "Group A · MD1" when `group`/`matchday` set; renders top + bottom handles;
    no left/right handles in DOM.

### E2E (Playwright smoke)
19. Load `/` → canvas renders nodes → ctrl+wheel zoom → a group-stage match node **and** a Final
    node (`[data-final="true"]`) are both present/reachable in the DOM.

### Acceptance criteria (testable)
1. Every `GROUP_STAGE` match yields exactly one `match` node (count == group-match count; 72 in mock).
2. Group-lane nodes are ordered by ascending `kickoff` (x strictly increasing); one distinct y per
   group lane; one shared y per lane.
3. Exactly one `group` table node per group remains, at its lane start (x=0).
4. KO node y increases monotonically by stage depth (R32 top → FINAL bottom); each KO parent x ==
   midpoint of its two children x; THIRD_PLACE adjacent to FINAL.
5. All advance + feeder edges route downward (source handle bottom of child, target handle top of
   parent); no left/right handles remain.
6. One continuous canvas: group band on top; KO begins at `y >= groupBandHeight + SECTION_GAP`;
   feeder edges link each group to the R32 matches it seeds.
7. Layout functions stay pure and O(n); `buildRoadmapGraph` is an immutable transform.
8. `MatchNodeData` carries `group`/`matchday`; group cards show "Group A · MD1".
9. KO layout computed via `d3-hierarchy` (`d3.tree`), with hand-rolled fan-in only as a justified
   fallback.
10. Playwright smoke: after load + wheel-zoom, a group match node and a Final node are both reachable.
11. Changed modules meet ≥80% coverage; `npm run test` green.

## Risks & Open Questions

- **`d3-hierarchy` not yet installed.** Verified: it is absent from `package.json` (the prompt
  assumes req #3 added it, but the repo state shows it is not there). The implementer must add
  `d3-hierarchy` + `@types/d3-hierarchy`. If a real install constraint blocks it, fall back to the
  hand-rolled vertical fan-in (transpose the existing single-half algorithm) — documented exception.
- **Existing tests assert the OLD model.** `build-graph.test.ts`, `bracket-layout.test.ts`, and the
  e2e specs (`?view=bracket`, mirrored bracket, `sr→tl`/`sl→tr` handles, x-offset) will fail after
  this change and must be rewritten, not patched around. This is expected churn, called out so the
  test-writer stage replaces rather than preserves them.
- **`RoadmapView` removal touches callers.** `useStageView`, `StageToggle`, `RoadmapCanvas`,
  `useRoadmapGraph`, `graph-model` all reference `'groups'|'bracket'|'full'`. Repurposing to focus
  must update all six in one pass or the build breaks. The e2e `stage toggle switches views` test
  becomes a "focus scroll" test.
- **Canvas width/height grows.** A lane of 6 matches + a 296px table is wide; the full canvas is
  also much taller. Rely on existing pan/zoom + fitView; ~116 nodes (72+32+12) stays within the
  <300-node SVG/DOM budget. `fitView` padding may need tuning so the smoke + visual tests pass.
- **Handle id rename breaks edges if half-done.** `MatchNode` handle ids (`t`/`b`) and `handlesFor`
  output must change together; `GroupTableNode`'s handle too. Any mismatch silently detaches edges.
- **Visual regression baselines.** `e2e/visual.spec.ts` screenshots will all change; baselines must
  be regenerated (`test:e2e:update`). Flag, don't auto-bless.

### Open questions (non-blocking — sensible defaults chosen)
- Exact pitch constant values (`LANE_PITCH_Y`, `SECTION_GAP`, etc.) are tuning, not contract —
  implementer picks values satisfying the ordering/monotonic invariants; tests assert relations,
  not absolutes. Default: values in Data Model above.
- Whether to keep the `?focus=` URL param or drop URL persistence entirely. Default: keep it
  (cheap, shareable, mirrors the old `?view=`), focus value `'all'` default.
- Whether `computeGroupGrid`/`groupGridWidth` have any remaining caller after the grid view is
  removed. Default: delete if unreferenced (grep confirms only build-graph/its test use them).

## Acceptance Criteria

1. `buildRoadmapGraph(tournament)` emits exactly one `match` node per `GROUP_STAGE` match
   (== `matches.filter(m=>m.stage==='GROUP_STAGE').length`; 72 for the mock).
2. Within each group lane, match nodes are ordered by ascending `kickoff` with strictly increasing
   x; every node in a lane shares one y; each group has a distinct lane y in A..L order.
3. Exactly one `group` table node per group remains, positioned at its lane start (x=0).
4. KO node y increases monotonically by stage depth (R32 minimal → FINAL maximal); each KO parent's
   x equals the midpoint of its two children's x (±ε); `THIRD_PLACE` is adjacent to the Final.
5. Every advance and feeder edge uses bottom-source / top-target handles; no left/right handle ids
   remain on `MatchNode` or `GroupTableNode`.
6. The graph is one continuous canvas: the group band occupies the top y-range and every KO node
   satisfies `y >= groupBandHeight + SECTION_GAP`; feeder edges connect each group to the R32
   matches it seeds.
7. `MatchNodeData` includes `group` and `matchday`; group match cards render "Group A · MD1".
8. The KO fan-in is computed with `d3-hierarchy`'s `d3.tree` (or a justified hand-rolled fallback).
9. Layout helpers are pure and O(n); `buildRoadmapGraph` does not mutate a deep-frozen tournament
   and returns structurally-equal output across calls.
10. Playwright smoke passes: after load and a wheel-zoom, a group-stage match node and a Final node
    are both reachable in the DOM.
11. `npm run test` passes (rewritten layout/build-graph unit tests + component test) with ≥80%
    coverage on the changed modules.
