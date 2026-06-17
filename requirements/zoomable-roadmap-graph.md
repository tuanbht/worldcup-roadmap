# Requirements: Zoomable, family-tree-style roadmap graph (React)

> **For implementer agents.** This is the approved spec. Build a React app that renders a roadmap /
> dependency graph in a family-tree visual style, pannable and zoomable with the mouse wheel.

## Context

`wc-roadmap` is a greenfield project. Deliver a **roadmap / dependency graph** drawn in the visual style of a
family tree (hierarchical, branching, top-down) that the user can **pan and zoom smoothly with the mouse wheel**
(scroll to zoom in/out — Figma / Google-Maps feel).

### Confirmed requirements
- **Data:** roadmap / dependency items connected parent→child (a DAG — items may have cross-dependencies).
- **Stack:** React + Vite + TypeScript (Next also acceptable; if Next, wrap the graph in a `'use client'` boundary).
- **Scale:** small, **< ~300 nodes** → SVG/DOM rendering is fine. No Canvas/WebGL/viewport-culling needed.
- **Hard requirement:** **smooth mouse-wheel zoom** (cursor-centered, clamped).

## Decision (locked)

**Use React Flow (`@xyflow/react` v12) + Dagre (`@dagrejs/dagre`) for auto-layout. Do NOT hand-roll D3.**

Why:
- React Flow's viewport is **d3-zoom under the hood** → smooth cursor-centered wheel zoom, pinch-zoom, and
  drag-pan for free (`zoomOnScroll` defaults to on). Directly satisfies the wheel-zoom requirement.
- Ships `fitView`, `<MiniMap>`, `<Controls>`, `<Background>`, and lets every node be a **real React component** —
  the "family-tree card" look is JSX + CSS, not canvas drawing.
- MIT, ~30k stars, actively maintained (v12, 2026), React-native.
- React Flow ships **no layout engine**, so pair it with **Dagre** for top-to-bottom DAG layout
  (`rankdir: 'TB'`) — the canonical family-tree shape. Dagre is the simplest fit at <300 nodes (React Flow's own
  "Dagre Tree" example is the reference). ELK.js is a heavier upgrade only if edge crossings get ugly — not needed now.

> NOTE: The genealogy "union-node / a family tree is really a DAG" nuance does **not** apply here — a roadmap has
> no marriage/two-parent semantics. Model plain item→item dependency edges; Dagre handles the DAG directly.

## Architecture

Feature-organized, small files (<800 lines), CSS design tokens:

```
wc-roadmap/
├── index.html
├── vite.config.ts
├── package.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   └── roadmap-graph/
│   │       ├── RoadmapGraph.tsx      # <ReactFlow> canvas + zoom/pan config (the core)
│   │       ├── RoadmapNode.tsx       # custom node card (status color, title, semantic-zoom detail)
│   │       ├── Legend.tsx            # status legend (optional)
│   │       └── roadmap-graph.css
│   ├── hooks/
│   │   ├── useLayoutedGraph.ts       # data -> dagre -> positioned nodes+edges (memoized)
│   │   └── useZoomLevel.ts           # reads live zoom for semantic LOD
│   ├── lib/
│   │   └── layout.ts                 # pure dagre layout helper (reusable, no React)
│   ├── data/
│   │   └── roadmap.ts                # the data model instance (sample roadmap)
│   ├── types/
│   │   └── roadmap.ts                # RoadmapItem / status types
│   └── styles/
│       ├── tokens.css                # oklch palette, type scale, spacing, durations
│       └── global.css
```

### 1. Data model — `src/types/roadmap.ts` + `src/data/roadmap.ts`
```ts
export type Status = 'done' | 'in-progress' | 'planned' | 'blocked';
export interface RoadmapItem {
  id: string;
  title: string;
  status: Status;
  category?: string;
  description?: string;
  dependsOn?: string[];   // edges: each id here -> this item (DAG, supports cross-links)
}
```
Validate at this boundary: every `dependsOn` id must exist; warn on cycles (Dagre needs a DAG). Ship a sample
dataset (~15–30 items across a few categories/statuses) so the graph is non-trivial.

### 2. Layout — `src/lib/layout.ts` (reuse React Flow's Dagre pattern)
Pure function: build a `dagre.graphlib.Graph`, `setGraph({ rankdir: 'TB', nodesep, ranksep })`, add nodes
(estimated/measured width+height) and edges from `dependsOn`, run `dagre.layout(g)`, then map results to React
Flow `Node[]` (`position: {x,y}`) and `Edge[]`. `useLayoutedGraph.ts` memoizes so it only recomputes on data change.

### 3. Custom node — `RoadmapNode.tsx`
A designed card (NOT the default React Flow box): status-driven accent via semantic CSS tokens, clear title
hierarchy (scale contrast), subtle surface/shadow for depth, real **hover/focus/active** states, `<Handle>`s
top+bottom for parent/child edges. This is where the family-tree-card character lives — must not look like a
default template.

### 4. Canvas + smooth wheel zoom — `RoadmapGraph.tsx` (the key file)
```tsx
<ReactFlow
  nodes={nodes} edges={edges} nodeTypes={nodeTypes}
  fitView
  minZoom={0.2} maxZoom={2.5}
  zoomOnScroll          // smooth mouse-wheel zoom — default true; THE requirement
  zoomOnPinch           // trackpad/touch pinch
  panOnDrag             // drag to pan
  nodesDraggable={false} // viewer; layout is authoritative
>
  <Background variant="dots" />
  <MiniMap pannable zoomable />
  <Controls />
</ReactFlow>
```
- Default mode = **scroll wheel zooms, drag pans** — matches the request.
- Optional Figma-style alternative: `panOnScroll + zoomActivationKeyCode="Meta"` (two-finger scroll pans, ⌘/Ctrl+scroll
  zooms). Default mode is simpler and is what "scroll mouse to zoom" describes.
- Wrap in `<ReactFlowProvider>`; call `fitView()` once after layout so the whole tree is framed on load.

### 5. Semantic zoom (recommended)
`useZoomLevel.ts` reads live zoom: `useStore((s) => s.transform[2])`. In `RoadmapNode`, show **title only** when
zoomed out and **reveal description/category** as you zoom in (3 bands: overview / titles / detail). Pure content
toggle — React Flow already scales the DOM. Add an opacity transition (with a hysteresis gap) so detail fades, not pops.

### 6. Styling / design quality
`tokens.css`: intentional oklch palette (status colors used **semantically**, not decoratively), clamp-based type
scale, spacing, `--duration-*`/`--ease-*`. Animate only `transform`/`opacity` (compositor-friendly). Pick a deliberate
direction (e.g. editorial/Swiss or light-luxury), not gray-on-white default. Honor `prefers-reduced-motion`
(disable edge animation).

## Dependencies
- `@xyflow/react` (v12) — canvas, pan/zoom, minimap, controls
- `@dagrejs/dagre` — top-down DAG auto-layout
- `react`, `react-dom`, `vite`, `typescript`, `@vitejs/plugin-react`
- (later, optional) `elkjs` — richer edge routing if crossings get bad

## Verification (end-to-end)
1. `npm install && npm run dev`; open the local URL.
2. **Smooth wheel zoom (the requirement):** scroll over the graph — zooms in/out smoothly, cursor-centered; drag
   pans; pinch zooms on trackpad. Confirm `minZoom`/`maxZoom` clamps feel right.
3. **Layout:** loads framed via `fitView`; top-down family-tree shape; dependency edges connect cleanly.
4. **Semantic zoom:** zooming out hides node detail; zooming in reveals it with a smooth fade.
5. **Interactions:** minimap reflects/controls the viewport; Controls buttons (zoom in/out/fit) work.
6. **Responsive + visual regression:** Playwright screenshots at 320 / 768 / 1024 / 1440; verify no overflow and
   usable touch zoom. Optionally record a GIF of the wheel-zoom interaction.
7. **A11y:** keyboard-focusable nodes with ARIA labels; check status-color contrast; `prefers-reduced-motion` honored.
8. **Budget:** app-page JS budget (<300kb gzipped) — React + React Flow fits comfortably.

## Notes / alternatives (only if requirements change)
- Strict single-parent tree (no cross-dependencies) + want lighter → `react-d3-tree` (MIT) drop-in collapsible
  tree with built-in zoom/pan. React Flow + Dagre chosen because it also handles cross-dependency edges and gives
  full custom-node control.
- Outgrow ~1–2k nodes later → switch rendering to Canvas/WebGL (Sigma.js). Not relevant at current scale.
