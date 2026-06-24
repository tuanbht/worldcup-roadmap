# Requirement: Keep the viewport stable across data refetches (don't re-frame on zoom/refetch)

## Bug (video demo)
After the user has zoomed/panned, a TanStack Query **refetch** of the tournament (on window focus / periodic)
**snaps the camera back to the fit frame**, discarding the user's zoom + pan. The screen "jumps" on every
refetch.

## Root cause
`RoadmapCanvas.tsx:125` calls `useFitOnChange(nodes.length, displayNodes)`. `useFitOnChange` re-runs its
top-aligned snap (`fitView`, `duration 0`) **every time the key changes**. `useRoadmapGraph(tournament)` memoizes
on the `tournament` reference, and **each refetch returns a new `tournament` object** → a rebuilt graph; any
change to the node set/count (live results resolving placeholders, new scheduled matches) changes the key and
**re-frames**, resetting the viewport.

## Want
The user's **zoom + pan persist across refetches.** Refetched data updates node contents (scores / status /
live pulse) **in place**, with the camera untouched. Auto-framing happens **only on the first load**.

## Decision
- **Auto-frame once.** Change the fit logic so the top-aligned frame fires **only on the first non-empty data
  arrival** (guard with a `hasFramedRef`, or fit only on the `0 → N` nodes transition) — **never** on subsequent
  refetches, even if the node count changes.
- **Preserve the transform on data updates.** React Flow keeps the viewport when you update node data without
  calling `fitView`; ensure nothing re-fits on refetch (the `useFitOnChange` key, and verify the `<ReactFlow>`
  `fitView` prop is init-only and isn't re-triggering).
- **Explicit fit still works on demand** — the "F" key / fit control / `FocusMatchButton` re-frame when the user
  asks; only the *automatic* refetch-driven re-frame is removed.
- **Structural changes don't yank the camera** either: if a genuinely new match node appears, keep the viewport
  and let the user re-fit manually (don't auto-snap).

## Acceptance criteria (testable)
- Zoom/pan to an arbitrary spot, then trigger a refetch (window focus, or a mocked tournament update): the React
  Flow **viewport transform (`x`, `y`, `zoom`) is unchanged** after the refetch; node scores/status still update.
- **First load** still frames the bracket once (top-aligned snap), as today.
- The explicit fit ("F" / control) still re-frames on demand.
- A unit/integration test asserts the viewport transform is preserved across a data refetch (and that the
  first-load frame still runs once). `npm run typecheck` + `build` + tests green.

## Files
- `src/features/roadmap/hooks/useFitOnChange.ts` (fit-once guard) and its call in
  `src/components/roadmap/RoadmapCanvas.tsx` (line 125); verify the `<ReactFlow fitView>` prop is init-only →
  **wc-graph-engineer**; tests → **wc-test-engineer**.
