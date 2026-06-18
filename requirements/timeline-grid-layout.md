# Requirement: Timeline-grid layout (date rail + group columns + knockout funnel)

> **Supersedes the orientation/positioning** in `per-match-nodes-and-orientation.md` (the "1 node per match"
> decision is kept; the "horizontal lanes / vertical bracket" positioning is replaced by this).

## Context
Keep every match as its own node (the current group-match expansion is good), but **re-order the whole
tournament onto a single vertical timeline**: dates run **down the left**, groups are **columns across the
top**, each group match sits at **(its group column × its kickoff-day row)**, and the knockout continues down
the same day rail as a **center-converging funnel** ending at the Final.

## Decisions (locked with owner — via scratch)
1. **1 node per match** (group stage included) — unchanged.
2. **Timeline = vertical, one row per calendar day** for the whole tournament (group stage **and** knockout share
   one continuous day axis, chronological top→bottom). Date labels on a **left rail**.
3. **Group stage = grid:** group letters **A→L are fixed columns across the top**; a group match is placed at
   (its group's column, its match-day row).
4. **Matchday-3 simultaneity:** a group plays its two MD3 matches at the same kickoff → that one (group, day)
   cell holds **two cards side-by-side** within the column. (Any day with 2 matches for one group uses the two
   sub-slots.)
5. **Knockout = center-converging funnel** on the same day rail: `y` = the match's real day; `x` = bracket
   fan-in **centered on the group grid's centerline**, narrowing R32→R16→QF→SF→**Final (center-bottom)**;
   `THIRD_PLACE` beside the Final.
6. **Left date rail + top group headers** are persistent guides. **Feeder edges** connect group columns → the
   R32 matches they seed; **advance edges** flow downward within the knockout.

## Coordinate model (pure, O(n))
- **Day axis (shared).** Collect all distinct match **days**, sort ascending → `dayIndex`.
  `y = HEADER_H + dayIndex * DAY_ROW_PITCH` for every node (group and knockout).
- **Group zone X.** Group A..L → `colIndex` 0..11. `x = RAIL_W + colIndex * GROUP_COL_PITCH`. If a (group, day)
  cell has two matches, offset them to the column's two sub-slots (`x ± SLOT/2`); order the pair by `kickoff`
  then `matchId`.
- **Knockout zone X.** Centered fan-in around the grid centerline `CX = RAIL_W + 6 * GROUP_COL_PITCH`:
  R32 leaves placed symmetrically about `CX` with `LEAF_X_PITCH`; **each parent `x` = midpoint of its two
  children's `x`** (follow the real feeder topology, not slot adjacency — see _Topology_). `y` stays the match's
  real day-row. Because a knockout parent is always played **after** both feeders, `parent.y > child.y` always →
  edges always flow down.
- **Rail + headers.** One **day-marker node** per day at `x < RAIL_W`, aligned to its row; one **group-header
  node** per column at `y < HEADER_H`, aligned to its column.

```
y = day (down)              x = group column (top zone) → bracket fan-in (bottom zone, centered)
funnel emerges because later rounds fall on later days AND at narrower x.
```

## Topology (correctness)
The funnel's parent→child connections must use the **official FIFA R32→Final feeder map**, not naive slot
adjacency (e.g. R16 = winners of M74 & M77). Track this with `fifa-regulation-accurate-bracket` (Art. 12.6/12.7);
until that lands, the existing `buildBracket` map is the source of `x` midpoints.

## Files to change (extend existing)
- `src/.../layout/layout-constants.ts` — add `DAY_ROW_PITCH`, `GROUP_COL_PITCH`, `SLOT`, `LEAF_X_PITCH`,
  `RAIL_W`, `HEADER_H`.
- `src/.../layout/*` — replace the lane/mirrored-bracket layout with: `computeDayIndex(matches)` (shared),
  `computeGroupGridLayout(tournament, dayIndex)` (group col × day, 2 sub-slots), and
  `computeKnockoutFunnelLayout(bracket, dayIndex, CX)` (centered fan-in, midpoint parents, day-row y).
- `build-graph.ts` — emit a `match` node for **every** match (group + KO) at its computed `{x,y}`; add
  `day-marker` and `group-header` nodes; feeder edges (group→R32) + advance edges (downward, **top/bottom**
  handles).
- `graph-model.ts` — add node-data fields needed for labels (`group`, `matchday`, `dayLabel`); new node types
  `day-marker`, `group-header`.
- `components/nodes/*` — `MatchNode` gets **top (target) + bottom (source)** handles for vertical edges; add
  `DayMarkerNode` (rail label) and `GroupHeaderNode` (column label) components.
- canvas/hooks — default to this composite view; `fitView`, keyboard nav, and minimap span the taller canvas.
  (Standings tables: keep as an on-demand panel/overlay per group header — not in the grid — to keep the matrix
  match-centric.)

## Acceptance criteria (testable)
- Every match in `tournament.matches` → exactly one `match` node. Group-match count rendered (e.g. 72 in mock).
- **Group grid:** a group match's `x` maps to its group's fixed column; its `y` = its day-row; rows are strictly
  chronological by day. A group's two same-day (MD3) matches render side-by-side in that column.
- **Day rail:** exactly one `day-marker` per distinct match-day, vertically aligned to that row, ascending.
- **Group headers:** exactly one `group-header` per group (A–L), horizontally aligned to its column.
- **Knockout funnel:** every KO match `y` = its real day-row and increases with date; each KO parent `x` =
  midpoint of its two children's `x`; the Final has the **max y** and `x ≈ CX` (center); `THIRD_PLACE` adjacent.
- All advance + feeder edges route **downward** (source = upper/earlier node bottom handle → target = lower node
  top handle); no left/right handles remain.
- Layout functions are **pure and O(n)**; `buildRoadmapGraph` stays an immutable transform.

## Risks / notes
- **Round smear:** a knockout round spans several day-rows (truthful to the schedule); accept this — `x` still
  narrows so the funnel reads. Don't force one row per round (that would break the timeline).
- Group columns are wide enough for **2 sub-slots** (MD3). Pick `GROUP_COL_PITCH ≥ 2*card + gap`.
- The canvas is tall (~30–35 day rows); rely on pan/zoom + `fitView`. Still <300 nodes → DOM is fine.
- A day with many knockout matches (e.g. 4 R32 on one day) places them at their bracket-x in the same row — fine.

## Verification
`npm run test` (new layout/build-graph unit tests green) → run the app: dates down the left rail, A–L headers
across the top, each group's matches in its column at the right day, MD3 pairs side-by-side, the knockout
funnel descending to a centered Final on the last day; feeder edges link groups → R32; wheel-zoom + `fitView`
frame the whole timeline. Playwright smoke: a Jun-11 group match node and the Final node are both reachable.
