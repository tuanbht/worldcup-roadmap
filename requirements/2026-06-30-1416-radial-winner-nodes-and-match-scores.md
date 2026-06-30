# Requirement: Radial circle — each inner node shows the match WINNER, with the score

## Context
The circle view (`?layout=circle`, requirement `2026-06-30-1104`) renders the knockout radially: 32 R32 teams as
round flag badges on the outer ring, abstract `match-dot` nodes on the concentric inner rings, a `final-center`
trophy node, and straight "matrix" connectors child→parent. Today the inner nodes are anonymous dots — they do not
say WHO advanced, and no score is shown anywhere.

## Want
Turn the circle into a legible **funnel of winners**:
1. **Each inner match node represents the WINNER of that match** — show the winning team's round flag (the same
   round `Flag shape="round"` roundel used by the outer badges, smaller is fine) instead of an anonymous dot. So
   reading inward: 32 R32 participants (outer ring) → 16 R32 winners → 8 R16 winners → 4 QF winners → 2 SF winners →
   1 champion at the center. The `final-center` shows the champion (winner of the Final) + the trophy motif.
2. **Display the score result for each match** — a compact score label (e.g. `2–1`, or `1–1 (4–2 pens)` when a
   penalty shootout decided it) on/near each match node, for every decided knockout match (R32 → Final). Undecided
   / not-yet-played matches show no score (and no winner flag — fall back to the current dot / a neutral TBD).

## Reuse / how
- **Winner resolution:** use the SHARED `winnerTeamId` already exported from `src/domain/bracket/resolve-teams.ts`
  (the sibling of `loserTeamId` that the eliminated-graying uses) — do NOT re-derive the winner rule, and do NOT
  edit `build-bracket.ts` / `seeding.ts`.
- **Score:** read the decided match's `home`/`away` goals (and penalties if present) from the `Match` in the
  tournament; format with the existing score/“(pens)” conventions used by the grid `MatchNode` / match-detail panel
  if one exists (reuse, don't reinvent the formatter).
- **Render:** extend `src/components/nodes/MatchDotNode.tsx` (and `FinalCenterNode.tsx`) to show the winner roundel
  + score; thread the winner team + score onto the node data in `src/features/roadmap/build-radial-graph.ts`. Keep
  it compositor-friendly, tokenized, and legible at the fixed overview zoom (the labels must not overlap into an
  unreadable cluster near the dense center — size/position them so the inner rings stay readable; if the very inner
  rounds are too tight for a full score, keep at least the winner flag and let the score show on focus/zoom).
- Eliminated/loser graying, the fixed overview, the straight matrix connectors, click→MatchDetailPanel, and
  team-focus inward-path highlight all stay as they are.

## Acceptance criteria (testable)
- In circle mode, each DECIDED inner knockout match node renders the winning team's round flag (winner = the team
  `winnerTeamId` returns for that match), and the `final-center` renders the champion's flag. An UNDECIDED match
  renders no winner flag (neutral dot / TBD) and no score.
- Each decided knockout match displays its score result (goals, plus penalties when a shootout decided it); the
  format matches the project's existing score formatting. Undecided matches show no score.
- The outer ring still shows all 32 R32 participants; losers still gray out; the overview stays fixed; connectors
  stay straight. Grid view is unchanged.
- Pure/deterministic graph build (winner + score derived, not mutated in place); `npm run typecheck` + `npm test` +
  `npm run build` green; a refreshed/added circle visual snapshot (mobile-width, isolated — this env has known
  desktop AA drift, so do NOT depend on a byte-identical `roadmap-*.png`).

## Files (indicative)
- `src/features/roadmap/build-radial-graph.ts` (thread winnerTeamId + score onto match-dot / final-center data),
  `src/components/nodes/MatchDotNode.tsx` + `FinalCenterNode.tsx` (render winner roundel + score),
  `src/features/roadmap/graph-model.ts` (node data: winner team + score fields) → **wc-graph-engineer** + **wc-ui-engineer**.
- A shared score formatter if one exists (reuse) or a small pure helper.
- Tests/snapshots (winner-per-node, score display, undecided fallback, determinism) → **wc-test-engineer**.

## Notes
Builds on `2026-06-30-1104` (circle view) and the committed straight-matrix connectors. No `build-bracket.ts` /
`seeding.ts` edits (use `resolve-teams.ts`). Owner: **wc-graph-engineer** (data) + **wc-ui-engineer** (node render) +
**wc-test-engineer**.
