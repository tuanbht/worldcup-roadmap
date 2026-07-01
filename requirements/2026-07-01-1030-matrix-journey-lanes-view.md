# Requirement: "Matrix" journey-lanes view — the whole tournament (group stage → Final) as a subway map

## Goal
Add a THIRD layout mode — **Matrix** — alongside Grid and Circle. It draws the ENTIRE tournament from the
GROUP STAGE through the Final as a "subway / journey" map: every team is a lane that weaves left→right through
its matches; each match is a station where two lanes meet; the loser's lane ends; the champion's lane reaches
the Final. Connector lines are ORTHOGONAL with many right-angle corners (the "matrix" look). It is a cool,
exploratory, whole-tournament visualization (the user explicitly wants to see the full path even though the
tournament is decided). User picked the "journey lanes (subway matrix)" composition.

## The concept (what it must convey)
- **Teams** appear as traceable, per-team-colored **lanes**.
- **Matches** appear as **station nodes** (group matches AND knockout matches), each showing its two teams
  (flag/code) + score/status.
- **Lines** are the lanes: a team's consecutive matches are connected by orthogonal (step) edges with corners;
  following one color from the left edge shows that team's journey group→exit.
- **Elimination**: a team's lane simply STOPS after its last (losing / non-qualifying) match — "bends off and ends".
- **Group stage included**: each team's 3 group matches are the first stations on its lane; 2 teams per group
  advance (their lanes continue into R32), 2 end.

## Design decision — the buildable model (the implementer/wc-graph owns exact geometry)
Use the **match-grid + team-path** model (tractable, legible, and it renders the subway essence without giant
spanning lines):
1. **Columns (x, left→right)** by tournament progression: Group matchday 1 · Group MD2 · Group MD3 · Round of 32 ·
   Round of 16 · Quarter-finals · Semi-finals · Final. (The planner may fold the 3 group matchdays into one
   "Group" band with sub-columns if cleaner — keep chronological left→right.)
2. **Match station nodes** placed at `(columnX, slotY)`. Slot ordering within a column should be chosen to keep a
   team's stations roughly vertically aligned across columns so its lane doesn't zig-zag wildly — a REASONABLE
   ordering (e.g. group order, then bracket-seed order) to LIMIT crossings; OPTIMAL crossing-minimization is
   explicitly OUT OF SCOPE for v1 (note as follow-up).
3. **Lane edges** = for each team, an orthogonal `step`/`smoothstep` (many-corner) edge from each of its matches to
   its NEXT match, colored by a stable per-team hue. The union of a team's edges is its lane. No forward edge after
   its final match (elimination).
4. **Team entry**: show the team (flag/short code) at its first group station (and on every station it plays) so a
   lane is identifiable; a small left-margin team label per lane is optional if it aids readability.
5. Reuse existing domain data: `tournament.groups` + group `matches` (stage `GROUP_STAGE`) for the group columns,
   and `tournament.bracket` + KO `matches` for R32→Final. Reuse `resolve-teams`/existing winner rules; do NOT
   re-derive winner→loser. Pure/immutable builder (like `build-radial-graph`/`build-graph`).

## Integration (plug into the existing layout-mode machinery)
- `src/features/roadmap/graph-model.ts`: extend `LayoutMode` to include `'matrix'` (+ any new node/edge data types:
  a `matrix-match` station node, a `matrix-lane` edge; or reuse existing where clean).
- `src/features/roadmap/hooks/useLayoutMode.ts`: add `'matrix'` to `VALID` (the `?layout=matrix` URL state; keep
  `grid` default). Update its test.
- `src/components/roadmap/LayoutToggle.tsx`: add a third **Matrix** segmented-control option (accessible name
  "Matrix"), matching the existing tablist/radiogroup a11y pattern. Update its test.
- New builder `src/features/roadmap/build-matrix-graph.ts` (+ a `layout/matrix-layout.ts` for the pure geometry),
  mirroring `build-radial-graph.ts`'s shape (returns `{ nodes, edges }`).
- New components: `src/components/nodes/MatrixMatchNode.tsx` (station) and `src/components/edges/MatrixLaneEdge.tsx`
  (orthogonal many-corner lane) — OR reuse React Flow's built-in `step`/`smoothstep` edge if it gives the look
  with less code (decide in plan). Register in `src/components/nodes/node-types.ts` + `edges/edge-types.ts`.
- `src/components/roadmap/RoadmapCanvas.tsx`: select the matrix builder + node/edge type maps when
  `mode === 'matrix'`, and fit the view on switch (reuse the existing `useFitOnChange`/fit pattern).
- Styling in `src/styles/global.css`: a cool subway/matrix aesthetic — orthogonal edges with slightly rounded
  corners, per-team lane color, legible station nodes on the dark canvas; compositor-friendly (transform/opacity),
  no layout-animated properties.

## Acceptance criteria (testable)
- A **Matrix** option appears in the layout toggle; selecting it sets `?layout=matrix` and renders the matrix graph;
  `grid`/`circle` are unaffected. `useLayoutMode` accepts/round-trips `'matrix'`.
- `build-matrix-graph(tournament)` (pure) produces: one station node per match across GROUP_STAGE + all KO rounds
  (group 72 + R32 16 + R16 8 + QF 4 + SF 2 + 3rd 1 + Final 1 — confirm counts against the mock), positioned in
  chronological stage columns; and lane edges such that **every team's edges connect its matches in kickoff order**
  and a team eliminated at match M has NO edge leaving M. Unit tests assert: column/stage assignment, the per-team
  lane ordering, and that an eliminated team's lane terminates.
- A station node renders its two teams (flag/code) + score/status; a scheduled match with an unresolved side shows
  the placeholder (reuse existing `refLabel`/`Flag` patterns). Component test.
- Lane edges are orthogonal (render with corners), one stable color per team; a team's lane is visually traceable.
- No regression to Grid or Circle (their builders/tests untouched and green). `npm run typecheck` + `npm test` +
  `npm run build` + `npm run format:check` green. Any new visual snapshot is intentionally generated + eyeballed.
- **Live-verify (matrix mode):** switch to Matrix; the full tournament renders group→Final; team lanes weave with
  visible corners; losers' lanes end; it reads as a cool subway/matrix map; no console/page errors; the toggle
  round-trips Grid↔Circle↔Matrix.

## Scope / v1 bounds (keep it shippable)
- IN: the new mode + toggle + pure builder/layout + station nodes + orthogonal lane edges + group stage + cool
  styling + fit-on-switch + tests + live-verify.
- OPTIONAL (only if cheap & clean): team-focus highlight reuse (focusing a `?team=` dims other lanes — reuse the
  existing `applyTeamFocus`/`team-focus` if it drops in trivially); a kickoff caption on stations (consistent with
  circle). If not trivial, defer.
- OUT (follow-ups, note them): optimal crossing-minimization / lane-ordering polish; mobile/responsive perfection
  (desktop-first for v1); animated lane draw-on; third-place-specific routing niceties.

## Files (indicative)
- Builder/layout/model/hook: `build-matrix-graph.ts`, `layout/matrix-layout.ts`, `graph-model.ts`,
  `hooks/useLayoutMode.ts` (+ tests) → **wc-graph-engineer**
- Toggle/canvas/nodes/edges/styling: `LayoutToggle.tsx`, `RoadmapCanvas.tsx`, `MatrixMatchNode.tsx`,
  `MatrixLaneEdge.tsx`, `node-types.ts`, `edge-types.ts`, `global.css` (+ tests) → **wc-ui-engineer**

## Notes
Whole feature lives in the shared radial/layout/UI area the build team also develops (grid/circle modes). Runs in
an isolated worktree; mostly NEW files with small edits to the shared registries (`useLayoutMode`, `LayoutToggle`,
`node-types`, `edge-types`, `RoadmapCanvas`, `graph-model` `LayoutMode`) — keep those edits minimal for a clean
rebase if the team claims concurrent work. This is an exploratory "make it look cool" v1: build a solid, legible
first version; live-verify + user iteration will refine the aesthetic. Owner: **wc-graph-engineer** (layout/builder)
+ **wc-ui-engineer** (nodes/edges/toggle/styling).
