# Requirement: Per-match nodes + phase-specific orientation

> **For planners, implementers, reviewers.** Changes the roadmap layout: every match (group stage
> included) becomes its own node, ordered by date, with group laid out horizontally and knockout vertically,
> all on one continuous zoomable canvas.

## Context
Today the canvas shows the **group stage as aggregated standings tables** (`GroupTableNode` via
`computeGroupGrid`) and the **knockout as a horizontal mirrored bracket** centered on the Final
(`computeBracketLayout`: round depth → X, fan-in → Y). The requester wants the whole tournament to read as
one node graph where **1 match = 1 node**, including group matches, ordered by kickoff, with orientation
that differs by phase.

## Resolved decisions (from the requester)
1. **Group stage = one node per match**, reusing the existing `match` node type (not tables-only).
2. **Order by date** (`Match.kickoff`).
3. **Group / non-knockout = horizontal**, organized as **one lane per group (A–L)**; each lane's matches run
   left→right by kickoff.
4. **Knockout = vertical**, **stages stacked top→bottom** (R32 across the top, converging **downward** to the
   Final at the bottom); matches spread horizontally within each stage.
5. **Keep the standings tables too** — `GroupTableNode` stays in the canvas alongside the per-match nodes.
6. **One continuous canvas** — the group band (horizontal) flows into the knockout (vertical); qualifiers
   visually feed the bracket. This becomes the primary view (the 3-way `StageToggle` is demoted to an
   optional focus/scroll control, not separate layouts).

## Target layout

```
GROUP STAGE  (horizontal — lane per group, by date)
  A  [tableA]  ⚽→⚽→⚽→⚽→⚽→⚽
  B  [tableB]  ⚽→⚽→⚽→⚽→⚽→⚽
   ⋮                ⋮
  L  [tableL]  ⚽→⚽→⚽→⚽→⚽→⚽
        │ feeder edges (group → its R32 matches)
        ▼
KNOCKOUT  (vertical — stages stack top→bottom)
  R32  ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢
         ↓   ↓   ↓   ↓
  R16   ▢   ▢   ▢   ▢
          ↓       ↓
  QF     ▢       ▢
           ↓   ↓
  SF       ▢   ▢
            ↓
  F         ▢        (3rd-place beside the Final)
```

## Coordinate model
- **Group lanes (top band).** Lane index = group A..L (0..11) → `y = laneIndex * LANE_PITCH_Y`. The group's
  `GroupTableNode` sits at the lane start (`x = 0`); its matches, **sorted by `kickoff` ascending**, follow at
  `x = TABLE_W + GROUP_GAP + orderIndex * GROUP_MATCH_STEP_X`. So x strictly increases with kickoff; all
  matches in a lane share that lane's y.
- **Knockout (below the band).** Stage depth → **Y** (`R32=0` at top … `FINAL` at bottom):
  `y = groupBandHeight + SECTION_GAP + depth * STAGE_PITCH_Y`. Fan-in along **X**: R32 leaves at
  `x = slotIndex * LEAF_PITCH_X`; each parent's `x` = **midpoint of its two children's x** (bottom-up, O(n)).
  `THIRD_PLACE` placed beside the Final at the bottom.
- **Edges flow downward.** Advance edges: child (earlier round, above) `bottom` handle → parent (below)
  `top` handle. Feeder edges: group node `bottom` → seeded R32 match `top`.

## Files to change (extend existing, keep pure)
- `src/features/roadmap/layout/layout-constants.ts` — add `LANE_PITCH_Y`, `GROUP_MATCH_STEP_X`,
  `STAGE_PITCH_Y`, `LEAF_PITCH_X`, `SECTION_GAP`, `TABLE_W`. Reinterpret/replace the horizontal `STEP`/`ROW_PITCH`.
- `src/features/roadmap/layout/bracket-layout.ts` — rewrite `computeBracketLayout` to **vertical top→bottom**
  fan-in (depth→Y, midpoint→X), single fan-in (not mirrored), THIRD_PLACE beside Final.
  **Recommended:** compute this with **`d3-hierarchy`** (`d3.tree`, root = Final, children = feeder matches) per
  the library-first policy — the KO bracket is a binary tree. Keeping the hand-rolled fan-in is an allowed
  exception if justified.
- `src/features/roadmap/layout/group-layout.ts` — add `computeGroupMatchLanes(tournament)` returning positions
  keyed by group-match `matchId` (lane per group, by kickoff) + table position per lane. Keep `computeGroupGrid`
  only if still used elsewhere.
- `src/features/roadmap/build-graph.ts` — emit `match` nodes for **every `GROUP_STAGE` match** (reuse
  `matchData()`), keep `group` table nodes, use the vertical KO layout, compose group band above + KO below in
  one graph, update `handlesFor` to **top/bottom** handles, keep feeder edges (`R32_SEEDING`). Make the
  continuous composite the default.
- `src/features/roadmap/graph-model.ts` — add `group: string | null` and `matchday: number | null` to
  `MatchNodeData` so group cards can label "Group A · MD1".
- `src/components/nodes/MatchNode.tsx` — add **top (target)** and **bottom (source)** handles for vertical
  edges; render group/matchday label; optional visual variant for group vs KO cards.
- `src/components/edges/AdvanceEdge.tsx` — verify it renders cleanly for vertical (top↔bottom) routing.
- `src/features/roadmap/hooks/useStageView.ts` + `src/components/roadmap/StageToggle.tsx` — default to the
  continuous canvas; repurpose the toggle to focus/scroll to a phase rather than swap layouts.
- `src/features/roadmap/hooks/{useBracketKeyboard,useFitOnChange}.ts` — keyboard traversal now spans group +
  KO in date/structural order; fitView frames the taller continuous canvas.

## Acceptance criteria (testable — for the TDD pipeline)
- Every `GROUP_STAGE` match in `tournament.matches` yields exactly **one `match` node** (count == group-match
  count; for the 48-team mock that's 12 groups × 6 = **72**).
- Within each group lane, nodes are **ordered by ascending `kickoff`** → x strictly increases with kickoff;
  every node in a lane shares one distinct `y`, and each group gets a distinct lane `y`.
- **Standings tables remain**: exactly one `group` node per group still present, at its lane start.
- Knockout node `y` **increases monotonically by stage depth** (R32 minimal/top → FINAL maximal/bottom); each
  knockout parent's `x` equals the **midpoint** of its two children's `x`; `THIRD_PLACE` adjacent to FINAL.
- All advance + feeder edges route **downward** (source handle below child, target handle on top of parent);
  no left/right handles remain in the vertical KO.
- One continuous canvas: group band occupies the top `y` range; KO begins below it (`y >= groupBandHeight +
  SECTION_GAP`); feeder edges connect each group to the R32 matches it seeds.
- Layout functions stay **pure and O(n)**; `buildRoadmapGraph` remains an immutable transform.

## Risks / notes
- **Width**: lane-per-group with 6 matches + a table is wide; rely on the existing pan/zoom (and fitView) —
  the small-scale (<300 nodes; ~72 group + ~31 KO + 12 tables ≈ 115) keeps SVG/DOM well within budget.
- **Handle migration**: switching KO from left/right to top/bottom handles touches `MatchNode` + `handlesFor`
  together — update both or edges detach.
- **Date order vs bracket order (KO)**: knockout x stays **structural** (slotIndex / fan-in); "order by date"
  is enforced for the **group lanes**. Note this explicitly so it isn't mistaken for a KO sort.
- Reconcile with `library-first-stack-policy.md`: prefer `d3-hierarchy` for the KO tree.

## Verification
`npm run test` (new layout/build-graph unit tests pass) → `npm run dev`: group stage shows lane-per-group
match cards ordered by date with standings tables at each lane start; knockout reads top→bottom converging on
the Final; feeder edges link groups → R32; mouse-wheel zoom + fitView frame the whole continuous canvas.
Add a Playwright smoke check: load → wheel-zoom → a group match node and a Final node are both reachable.
