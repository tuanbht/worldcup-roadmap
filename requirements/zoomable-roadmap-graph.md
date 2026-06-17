# Requirements: Zoomable, family-tree-style roadmap graph (React)

> **For implementer agents.** This is the approved spec. Build a React app that renders a roadmap /
> dependency graph in a family-tree visual style, pannable and zoomable with the mouse wheel.

## Context

`wc-roadmap` is a greenfield project. Deliver a **roadmap / dependency graph** drawn in the visual style of a
family tree (hierarchical, branching, top-down) that the user can **pan and zoom smoothly with the mouse wheel**
(scroll to zoom in/out — Figma / Google-Maps feel).

### Confirmed requirements

- **Data:** roadmap / dependency items connected parent→child (a DAG — items may have cross-dependencies).
- **Stack (locked):** **Vite + React SPA + TypeScript**, with a thin **Hono** API serving `/api/worldcup`
  (per `migrate-to-vite-react.md`). Next.js is removed — there is no `'use client'` boundary; the SPA mounts in
  `src/main.tsx`. Live tournament data is fetched/cached/polled with **TanStack Query**
  (`@tanstack/react-query`), not a hand-rolled fetch loop.
- **Scale:** small, **< ~300 nodes** → SVG/DOM rendering is fine. No Canvas/WebGL/viewport-culling needed.
- **Hard requirement:** **smooth mouse-wheel zoom** (cursor-centered, clamped).

## Decision (locked)

**Use React Flow (`@xyflow/react` v12) for the canvas + viewport, and `d3-hierarchy` for the bracket-tree
layout. Do NOT hand-roll a zoom/pan engine; do NOT use Dagre.**

Why:

- React Flow's viewport is **d3-zoom under the hood** → smooth cursor-centered wheel zoom, pinch-zoom, and
  drag-pan for free (`zoomOnScroll` defaults to on). Directly satisfies the wheel-zoom requirement.
- Ships `fitView`, `<MiniMap>`, `<Controls>`, `<Background>`, and lets every node be a **real React component** —
  the "family-tree card" look is JSX + CSS, not canvas drawing.
- MIT, ~30k stars, actively maintained (v12, 2026), React-native.
- React Flow ships **no layout engine**, so pair it with **`d3-hierarchy`** (`d3.tree` / `d3.cluster`) for the
  top-down bracket layout — a knockout bracket is a binary tree, which `d3-hierarchy` models directly. This
  **supersedes Dagre** from the earlier spec: `dagre`/`dagre-d3` are deprecated and never added to this repo.
  `elkjs` is a heavier upgrade only if edge routing gets ugly — not needed now. (Per the library-first stack
  policy, the dependency + a smoke test land in req #3; the bracket→tree construction lives in the per-match
  orientation phase, req #2.)

> NOTE: The genealogy "union-node / a family tree is really a DAG" nuance does **not** apply here — a knockout
> bracket has a single advancement parent per match. Model plain item→item edges; `d3-hierarchy` handles the
> tree directly.

## Architecture

Feature-organized, small files (<800 lines). Styling is **Tailwind CSS v4** — the oklch design tokens live in
`src/styles/global.css` via Tailwind v4 `@theme` (one styling system, no parallel bespoke CSS framework):

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
│   │   ├── useLayoutedGraph.ts       # data -> d3-hierarchy -> positioned nodes+edges (memoized)
│   │   └── useZoomLevel.ts           # reads live zoom for semantic LOD
│   ├── lib/
│   │   ├── layout.ts                 # pure d3-hierarchy layout helper (reusable, no React)
│   │   └── datetime.ts               # single date/timezone façade (date-fns + date-fns-tz) for kickoff text
│   ├── data/
│   │   └── roadmap.ts                # the data model instance (sample roadmap)
│   ├── types/
│   │   └── roadmap.ts                # RoadmapItem / status types
│   └── styles/
│       └── global.css                # Tailwind v4 `@import 'tailwindcss'` + `@theme` tokens (oklch palette, scale, spacing, durations)
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
  dependsOn?: string[]; // edges: each id here -> this item (DAG, supports cross-links)
}
```

Validate at this boundary: every `dependsOn` id must exist; warn on cycles (`d3-hierarchy` needs an acyclic
tree). Ship a sample
dataset (~15–30 items across a few categories/statuses) so the graph is non-trivial.

### 2. Layout — `src/lib/layout.ts` (d3-hierarchy bracket tree)

Pure function: build a `d3.hierarchy(root, accessor)` from the bracket topology, run a `d3.tree()` (or
`d3.cluster()`) layout with the desired `nodeSize`/separation for the top-down family-tree shape, then map the
laid-out `HierarchyNode`s to React Flow `Node[]` (`position: {x,y}`) and `Edge[]`. `useLayoutedGraph.ts`
memoizes so it only recomputes on data change. (`d3-hierarchy` + `@types/d3-hierarchy` are added with a smoke
test in req #3; the bracket→tree construction is built in req #2.)

### 3. Custom node — `RoadmapNode.tsx`

A designed card (NOT the default React Flow box): status-driven accent via semantic CSS tokens, clear title
hierarchy (scale contrast), subtle surface/shadow for depth, real **hover/focus/active** states, `<Handle>`s
top+bottom for parent/child edges. This is where the family-tree-card character lives — must not look like a
default template.

### 4. Canvas + smooth wheel zoom — `RoadmapGraph.tsx` (the key file)

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}
  fitView
  minZoom={0.2}
  maxZoom={2.5}
  zoomOnScroll // smooth mouse-wheel zoom — default true; THE requirement
  zoomOnPinch // trackpad/touch pinch
  panOnDrag // drag to pan
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

Tailwind v4 `@theme` in `src/styles/global.css`: intentional oklch palette (status colors used **semantically**,
not decoratively), clamp-based type scale, spacing, `--duration-*`/`--ease-*` exposed as Tailwind tokens. Animate
only `transform`/`opacity` (compositor-friendly). Pick a deliberate direction (e.g. editorial/Swiss or
light-luxury), not gray-on-white default. Honor `prefers-reduced-motion` (disable edge animation). Kickoff times
render through the single `src/lib/datetime.ts` façade (date-fns + date-fns-tz) — no hand-rolled `Intl` date
formatting.

## Dependencies

- `@xyflow/react` (v12) — canvas, pan/zoom, minimap, controls
- `d3-hierarchy` (+ `@types/d3-hierarchy`) — top-down bracket-tree layout (supersedes Dagre)
- `@tanstack/react-query` — live tournament data fetch/cache/poll over the Hono `/api/worldcup` endpoint
- `date-fns` + `date-fns-tz` — kickoff/timezone rendering (single date lib)
- `tailwindcss` (v4) — styling + `@theme` design tokens
- `react`, `react-dom`, `vite`, `typescript`, `@vitejs/plugin-react`, `hono`, `@hono/node-server`
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
  tree with built-in zoom/pan. React Flow + `d3-hierarchy` chosen because React Flow handles cross-dependency
  edges and gives full custom-node control while `d3-hierarchy` owns the tree math.
- Outgrow ~1–2k nodes later → switch rendering to Canvas/WebGL (Sigma.js). Not relevant at current scale.
