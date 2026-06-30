# Requirement: Radial "circle" bracket view (teams in a ring, Final at the center)

## Want
A **new view mode** for the knockout: a circular / radial bracket like the classic World Cup poster
(reference image) — the **Final (trophy) at the center**, rounds fanning **outward** in concentric rings, the
qualified teams as **circular flag badges on the outer ring**, with bracket connectors curving inward to the
center. Still uses team flags (as round roundels).

## This is a new LAYOUT, not a camera focus
Today's `StageToggle` (`all` / `groups` / `knockout`) only re-frames the camera on the **one** timeline-grid
graph — the graph shape never changes (`useStageView` comment). The circle view is a **different graph layout**,
so it needs a real **layout-mode switch** (default = current timeline grid; "Circle" = the radial bracket),
persisted to a URL param (e.g. `?layout=circle`). Scope: **knockout only** (the 32 R32 qualifiers + bracket);
the group stage is out of scope for this view.

## Layout (reuse what's there)
- **Reuse the Final-rooted tree** already built in `src/features/roadmap/layout/bracket-layout.ts`
  (`hierarchy(finalNode, winnerChildrenOf)`), but lay it out **radially** instead of as a fan-in:
  `d3.tree().size([2π, R])` → each node has `x = angle`, `y = radius`. Map to Cartesian about a center
  `(cx, cy)`: `px = cx + y·sin(x)`, `py = cy − y·cos(x)`.
- **Final** at the center (depth 0, r≈0); **R32 matches/teams** on the **outer ring**; R16/QF/SF on the
  concentric rings between. THIRD_PLACE: a small node near the center beside the Final, or omit.
- **Outer ring = circular flag badges** for the 32 R32 participants (home+away of each R32 match), evenly
  spaced; reuse team data + flags.
- Pure, O(n); positions deterministic.

## Render
- **Circular flag badge** node (a round `Flag` roundel variant — add a circular mode to `ui/Flag.tsx` or a small
  `FlagBadge`), for teams on the outer ring; match nodes on inner rings are small dots/junctions.
- **Radial connector edges**: curved arc/elbow links from each child inward to its parent (à la `d3.linkRadial`)
  converging at the center — a custom radial edge component (SVG path), styled by match status (live / decided /
  undecided), eliminated teams dimmed.
- **Center**: the Final node + a trophy/center motif.

## Interactions (reuse)
- Clicking a team badge / match opens the existing **MatchDetailPanel**.
- **Team focus** (click a flag) highlights that team's **inward path to the center** (and dims the rest),
  reusing the focus mechanism.
- Wheel-zoom + drag-pan + `fitView` frame the whole circle; responsive (the circle scales to the viewport,
  works on mobile).

## Acceptance criteria (testable)
- A new selectable **"Circle"** layout renders the knockout radially: Final at center, the 32 R32 participants as
  evenly-spaced circular flag badges on the outer ring, intermediate rounds on concentric rings, each parent at
  the **angular midpoint** of its two children.
- Radial connector edges link each match inward to its parent, converging at the center; colored by status.
- Switching back to the default returns the timeline-grid view; the choice persists via `?layout=`.
- Clicking a badge/match opens the detail panel; team-focus highlights its inward path; zoom/pan/fitView work;
  no horizontal overflow at mobile widths.
- Pure radial layout (d3-hierarchy), O(n); `npm run typecheck` + `build` + tests green; visual snapshot of the
  circle view added.

## Files
- New `src/features/roadmap/layout/radial-bracket-layout.ts` (d3-hierarchy radial → polar→Cartesian), layout-mode
  in `graph-model.ts` / `build-graph.ts` / a `useLayoutMode` hook, `RoadmapCanvas.tsx` wiring → **wc-graph-engineer**.
- Circular flag badge + radial edge component + center trophy + the layout toggle UI → **wc-ui-engineer**.
- Tests/snapshots → **wc-test-engineer**.
