# Requirement: Remove React Flow on-canvas controls + minimap

## Context
The roadmap canvas renders React Flow's **`<Controls>`** (zoom-in / zoom-out / fit-view / pan-lock buttons)
and **`<MiniMap>`**. The owner doesn't want either — remove them. This is **UI chrome only**: the actual
navigation interactions (mouse-wheel zoom, drag-pan, pinch) stay; only the on-screen buttons and the minimap go.

Current usage (`src/components/roadmap/RoadmapCanvas.tsx`):
- line 5–6: `import { Controls, MiniMap, … }`
- line 40: `function nodeColor(node)` — used **only** by the minimap
- line 158–164: `<MiniMap nodeColor={nodeColor} … />`
- line 165: `<Controls showInteractive={false} />`

## Decision
1. Remove `<MiniMap … />` and `<Controls … />` from `RoadmapCanvas.tsx`, plus their imports.
2. Remove the now-dead `nodeColor` helper (minimap-only) and any other prop/helper that existed solely for them.
3. **Keep** the interactions: `zoomOnScroll` (wheel zoom), `panOnDrag` (drag pan), `zoomOnPinch`, and
   `fitView`-on-load. Only the control buttons + minimap UI are removed — zooming/panning still work.
4. Remove the dead CSS overrides in `src/styles/global.css`: `.react-flow__controls`,
   `.react-flow__controls-button`, `.react-flow__controls-button:hover`, `.react-flow__minimap` (and any
   `minimap-*` rules). Keep `<Background>`.
5. Update tests: drop any assertion that a MiniMap/Controls renders; add one asserting they are **absent** and
   that wheel-zoom / drag-pan still function.

## Acceptance criteria (testable)
- No `<MiniMap>` or `<Controls>` is rendered; no `.react-flow__minimap` / `.react-flow__controls` element exists
  in the DOM; no zoom/fit/pan buttons or minimap are visible on the canvas.
- Mouse-wheel zoom, drag-pan, pinch-zoom, and fitView-on-load still work.
- No dead imports, helpers (`nodeColor`), or CSS remain; `npm run typecheck` + `npm run build` are green.
- `RoadmapCanvas` test(s) updated; e2e/visual snapshots refreshed for the removed chrome.

## Files
- `src/components/roadmap/RoadmapCanvas.tsx` — remove the two components, imports, and `nodeColor`.
- `src/styles/global.css` — remove the `.react-flow__controls*` / `.react-flow__minimap` blocks.
- `RoadmapCanvas` component test + any e2e/visual snapshot that shows the controls/minimap.

Owner: **wc-ui-engineer** (`src/components/**` + `src/styles/**`).
