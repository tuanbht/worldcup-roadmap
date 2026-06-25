# Requirement: Remove the Zoom/Pan mode toggle (+ "Scroll to zoom" hint)

## Context

The canvas shows a bottom-center **"Zoom / Pan" segmented toggle** with a **"Scroll to zoom"** hint
(`InteractionModeToggle`, backed by `interaction-mode.ts` + `useInteractionMode`). The owner doesn't want it.
Remove the toggle and the mode machinery; the canvas should just use the standard interaction always —
**wheel-zoom + drag-pan** (today's `'zoom'` default), no mode switching, no hint.

## Decision

- **Delete** `src/components/roadmap/InteractionModeToggle.tsx` (the `<Panel position="bottom-center">` toggle +
  `HINTS` "Scroll to zoom" / "Drag to pan").
- **`RoadmapCanvas.tsx`** — remove the `<InteractionModeToggle … />` render (~line 189), the
  `useInteractionMode()` call (~line 62), and the `interactionFlowProps(mode)` spread on `<ReactFlow>`. Replace
  with the fixed standard props: `zoomOnScroll` **on** + `panOnDrag` **on** (i.e. the current `'zoom'` mode), so
  scroll-to-zoom and drag-to-pan are always active. Keep `zoomOnPinch`/`fitView`/`minZoom`/`maxZoom`.
- **Delete** `src/features/roadmap/interaction-mode.ts` and `src/features/roadmap/hooks/useInteractionMode.ts`
  (the `InteractionMode` type, `interactionFlowProps`, the `wc-roadmap:interaction-mode` localStorage
  persistence) — nothing else should reference them.
- Remove any `.interaction-mode-toggle` CSS in `global.css`.
- **Keep** `SegmentedControl` (shared primitive still used by the view toggle + `MatchDetailTabs`) — only the
  interaction-mode _consumer_ goes.
- Update/remove tests for the toggle / interaction-mode module.

## Acceptance criteria (testable)

- No "Zoom / Pan" toggle and no "Scroll to zoom" hint render anywhere on the canvas.
- The canvas always supports **wheel-zoom + drag-pan** (and pinch); there is no interaction-mode state, toggle,
  or `localStorage` key.
- `InteractionModeToggle.tsx`, `interaction-mode.ts`, `useInteractionMode.ts` (and their tests) are deleted;
  `grep -rE "InteractionMode|interaction-mode|Scroll to zoom" src` is clean; `SegmentedControl` still exists and
  its other users are unaffected.
- `npm run typecheck` + `npm run build` + tests green; canvas visual snapshot updated (no bottom-center toggle).

## Files

- Delete `src/components/roadmap/InteractionModeToggle.tsx`; edit `src/components/roadmap/RoadmapCanvas.tsx`;
  remove `.interaction-mode-toggle` CSS → **wc-ui-engineer**.
- Delete `src/features/roadmap/interaction-mode.ts` + `src/features/roadmap/hooks/useInteractionMode.ts` →
  **wc-graph-engineer**.
- Tests/snapshots → **wc-test-engineer**.
