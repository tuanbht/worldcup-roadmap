# Requirement: Remove duplicate group header + dash-link the standings table to its matches

## Bug + want
Each group column renders **two** "Group F" headers (see screenshot): the small `group-header` pill
(`GroupHeaderNodeImpl`) **and** the always-on `group-standings` table (`GroupStandingsNode` → `GroupTableNode`),
which already shows its own "F · Group F" header above the table. Remove the pill; keep the expanded table as the
single per-column header. Then **draw a dashed line from each group's standings table to the match nodes that
belong to that group**.

## 1. Remove the `group-header` node (keep the expanded standings table)
Delete the redundant pill node end-to-end:
- `build-graph.ts` — drop `groupHeaderNode()` and its emission (the `for … groupGrid.headers → groupHeaderNode`
  loop, ~line 262). Keep `groupStandingsNode()`.
- `graph-model.ts` — remove `GroupHeaderNodeData` / `GroupHeaderFlowNode` from the `RoadmapNode` union.
- `node-types.ts` — remove the `'group-header': GroupHeaderNode` registration + import.
- Delete `src/components/nodes/GroupHeaderNode.tsx` (`GroupHeaderNodeImpl`).
- Clean up references: `RoadmapCanvas.tsx` (the `node.type === 'group-header'` branch, ~line 104),
  `hooks/useFocusCamera.ts` (the two `group-header` cases), `apply-nearest-flag.ts` comment,
  `useFitOnChange.ts` comment.
- **Layout:** the `group-standings` table now occupies the top-of-column header slot (where the pill was). Move
  it up and recompute the header band (`layout-constants.ts` `HEADER_TOP` / `GROUP_TABLE_H` / `HEADER_GAP` and the
  day-row-0 offset) so the table sits at the top and day-row 0 begins cleanly below it — no gap left by the
  removed pill, no overlap with the first match row.
- Keep `StandingsOverlay` (on-demand dialog) and the `GroupTableNode`/`GroupStandingsNode` reuse intact.

## 2. Dashed links: group standings table → its matches
Add a new set of **dashed** edges, one per (group, group-stage match): source = `group-standings-{group.name}`,
target = each `match` node where `match.group === group.name`.
- Give `GroupStandingsNode` a **bottom source handle** (the pill's old `id="b"` handle moves here); reuse each
  match card's existing top target handle (`'t'`).
- Style them clearly as **membership** links, visually distinct from the solid `advance`/feeder edges: a dashed
  stroke (reuse the `advance-edge--undecided` dashed look or a new `member` edge variant), low-emphasis so they
  read as grouping, not advancement.
- These compose with the team-highlight interaction (group-view req §3): when a team is focused, its dashed
  membership links highlight with its matches; otherwise they dim with everything else.
- Existing **feeder** edges (group → seeded R32, sourced from the group's exit match) and **advance** edges are
  unchanged.

## Acceptance criteria (testable)
- Exactly **one** header per group column (the expanded standings table); **no** `group-header` pill renders;
  `group-header` is gone from `node-types`, `graph-model` union, and `build-graph`; `GroupHeaderNode.tsx` deleted;
  no dangling `group-header` references (`grep -r "group-header" src` is clean except removed). `typecheck`/`build` green.
- The standings table sits at the top of each column with day-row 0 starting cleanly beneath it (no leftover gap
  or overlap; the alignment of date-rail/cards from the prior fix still holds).
- A dashed edge connects each group's standings table to **every** match node in that group; the dashed style is
  visibly distinct from the solid advance/feeder edges; the edges route top→down without crossing chaos.
- Feeder (group→R32) + advance edges still correct; team-focus highlight includes the dashed links; tests +
  visual snapshots updated.

## Files
- `src/features/roadmap/build-graph.ts`, `graph-model.ts`, `layout/layout-constants.ts` (remove header node,
  reposition standings, add membership edges) → **wc-graph-engineer**.
- `src/components/nodes/node-types.ts`, delete `GroupHeaderNode.tsx`, add source handle to `GroupStandingsNode.tsx`,
  the dashed edge style in `AdvanceEdge.tsx`/edge-types → **wc-ui-engineer**.
- canvas/camera ref cleanup in `RoadmapCanvas.tsx` / `hooks/useFocusCamera.ts` → **wc-graph-engineer**.
- tests + snapshots → **wc-test-engineer**.
