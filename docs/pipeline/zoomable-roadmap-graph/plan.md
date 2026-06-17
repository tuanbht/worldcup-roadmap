# Plan: Zoomable family-tree roadmap graph (WC 2026 group→bracket)

> Revision #4. Re-grounded against the **actual files on disk** (read 2026-06-17). Every
> Required Change in `plan-review.md` (1–8) is addressed; see "Review responses" for the
> point-by-point mapping. The code is authoritative; the requirement doc is an idealized
> generic spec. **The repo is already ~90% done** — almost everything the requirement asks
> for already ships. The genuinely-missing work is small: semantic-zoom LOD, a unit test for
> the pure graph builder, and a coverage-config extension. This plan scopes only that.

## Reconciliation with the requirement doc (authoritative deviations)

The requirement (`requirements/zoomable-roadmap-graph.md`) describes a generic
"RoadmapItem / dependsOn DAG" on a Vite stack with Dagre. The real repo renders the **FIFA
World Cup 2026** (group tables feeding a knockout bracket) on **Next.js 15 App Router +
React 19 + Tailwind v4 + `@xyflow/react@12`**. These deviations are intentional:

1. **No Vite / `index.html` / `main.tsx` / `App.tsx`.** Next.js App Router. The graph is a
   `'use client'` island; `src/app/page.tsx` (server component) renders a lazy `ssr:false`
   client canvas. Both already exist.
2. **No `@dagrejs/dagre`.** Layout is solved deterministically by `computeBracketLayout`
   (mirrored bracket, tested) + `computeGroupGrid`. Do **not** add Dagre/ELK.
3. **Domain is the real tournament, not `RoadmapItem`/`Status`.** Reuse the EXACT types in
   `src/features/roadmap/graph-model.ts` (`MatchNodeData`/`GroupNodeData`,
   `AdvanceEdgeState = 'decided' | 'undecided' | 'live'`, `RoadmapView`).
4. **The whole assembly + render + e2e already exist.** `buildRoadmapGraph` (pure transform),
   `RoadmapCanvas`, `MatchNode`/`GroupTableNode`/`AdvanceEdge`, `MatchDetailPanel`,
   `StageToggle`, `playwright.config.ts`, `e2e/roadmap.spec.ts` are all on disk and working.

### Verified current repo state (re-surveyed before planning)

| Concern | Reality on disk | Implication |
|---|---|---|
| `src/app/page.tsx` | **Exists.** Server component: semantic `<main class="flex h-dvh">` + `<header>` + `<h1>` "The Road to the Final" + intro + `<section aria-label>` mounting `RoadmapCanvas.lazy`. No fetch. | **Reuse. Do not create/rewrite.** |
| `src/components/roadmap/RoadmapCanvas.lazy.tsx` | **Exists.** `dynamic(() => import('./RoadmapCanvas'), { ssr:false })` with a loading fallback. Code-splits React Flow out of the initial document. | **Reuse. Do not recreate.** |
| `src/components/roadmap/RoadmapCanvas.tsx` | **Exists & complete.** `<ReactFlowProvider>` → `<ReactFlow>` with `fitView`, `fitViewOptions={{padding:0.18}}`, `minZoom={0.2}`, **`maxZoom={1.8}`**, `nodesConnectable={false}`, `edgesFocusable={false}`, `onlyRenderVisibleElements`, **`panOnScroll`**, `<Background variant=Dots>`, status-colored `<MiniMap>`, `<Controls>`, `<StageToggle>`, inline `Legend`, `onNodeClick`→`MatchDetailPanel`, `onPaneClick` clear, loading state. Imports `@xyflow/react/dist/style.css` at **line 14**. Composes `useTournament`, `useStageView`, `useRoadmapGraph`, `useFitOnChange`, `useBracketKeyboard`. | **Reuse.** Only edit for LOD wiring (RC-1). |
| `src/components/nodes/MatchNode.tsx` | **Exists.** Designed `<article>` card, Tailwind v4 utilities only, `data-status`/`data-final`/`data-selected`, real hover/focus/active, `<Handle id="tl/tr/sl/sr">`, `<footer>` with kickoff + venue. **No CSS file.** | **Reuse.** LOD detail target = the `<footer>` (RC-2, M4). |
| `src/components/nodes/GroupTableNode.tsx` | **Exists.** `<section class="w-[296px] …">` table, Tailwind only, `<Flag>`, `sr` handle, qualified-row tint, columns Team/P/GD/Pts. **No `.group-node` class, no CSS file.** Width `296` = `GROUP_W`. | **Reuse.** LOD detail target = secondary cells (RC-2, M4). |
| `src/components/edges/AdvanceEdge.tsx` | **Exists.** `getBezierPath` + `BaseEdge`, `advance-edge advance-edge--{state}` class. Its CSS **is** present inline in `globals.css`. | **Reuse. Done.** |
| `node-types.ts` / `edge-types.ts` | **Exist.** Module-level registries `{match,group}` / `{advance}`. | **Reuse.** |
| `StageToggle.tsx` + `SegmentedControl` | **Exist.** Accessible `role="tab"` view switcher inside a RF `<Panel className="stage-toggle">`. SegmentedControl styled with Tailwind utilities. | **Reuse.** No CSS rule needed. |
| `MatchDetailPanel.tsx` | **Exists & wired.** `<aside aria-label="Match details" aria-hidden={!open}>` with `translate-x-0`/`translate-x-full` (+ mobile bottom-sheet), Escape-to-close, Tailwind + live tokens (`bg-glass`, `shadow-[var(--elevation-panel)]`). **No `match-detail-panel.css`.** | **Reuse. Done.** e2e only (RC-5). |
| Hooks | `useTournament` (fetch `/api/worldcup` + 45s poll), `useStageView` (view + `?view=` URL; default **`'bracket'`**), `useRoadmapGraph` (memoized `buildRoadmapGraph`), `useFitOnChange` (**60ms `setTimeout` + 400ms** animated `fitView`), `useBracketKeyboard` (F=fit, 0=reset, Esc=clear). All exist. | **Reuse all.** Add only `useZoomLevel`. |
| `buildRoadmapGraph` | `src/features/roadmap/build-graph.ts`. Pure `Tournament + view → {nodes,edges}`. Positions from `computeBracketLayout`/`computeGroupGrid`; advance edges from slot `SlotSource`; `edgeState` from status/score; `feed-…` edges group→R32 in `full`. **Untested; excluded from coverage today.** | **Reuse + add coverage.** This is the centerpiece of the real work. |
| `globals.css` | Only project CSS. `@import 'tailwindcss'`; `@theme` tokens (`--color-bg/surf-1..3/glass/ink/muted/dim/edge/edge-strong/accent/live/gold`, `--node-w/-h`, `--font-*`, `--radius-card`, `--animate-livepulse/edgeflow`); `@layer base` (`--elevation-*`, focus ring); `@layer components` `.pitch-grid`; inline `.advance-edge*` + `.react-flow__attribution/controls/minimap` overrides; **`prefers-reduced-motion` guard already present**. | Single styling source. Add **only** `[data-lod]` transitions (RC-4). |
| Orphan CSS files | **None exist.** A `**/*.css` scan returns only `src/app/globals.css` (+ node_modules). `match-node.css`/`group-table-node.css`/`advance-edge.css`/`match-detail-panel.css` **do not exist**. | **No port, no token-fix, no orphan workstream** (RC-2). |
| `package.json` | `@xyflow/react@12`, `next@15`, `react@19`, `zod`, `server-only`, Tailwind v4, vitest, `@vitest/coverage-v8`. **`@playwright/test` already a devDep; `test:e2e` script already present.** No `@axe-core/playwright`, no `@next/bundle-analyzer`. | Add only the analyzer + (optional) axe (RC-7). |
| `playwright.config.ts` + `e2e/roadmap.spec.ts` | **Exist.** Config: `testDir './e2e'`, `webServer` = `next build && WC_PROVIDER=mock PORT=3217 next start`, `baseURL :3217`, projects chromium@1440 + iPhone-13 mobile. Spec covers: API 104 matches/12 groups, hero+canvas render, stage-toggle, click `[data-final]`→`getByLabel('Match details')` visible. | **Reuse + extend** (wheel-zoom, breakpoints, a11y). |
| `vitest.config.ts` | `test.include = ['src/**/*.test.ts']`; `coverage.include = ['src/domain/**','src/features/roadmap/layout/**','src/data/providers/**']` (glob). `build-graph.ts` & a future `lod.ts` are **not** included. | Extend `coverage.include` with `src/features/roadmap/build-graph.ts` + `src/features/roadmap/lod.ts` (RC-1/M2). |
| `next.config.ts` | **Exists.** `reactStrictMode`, image `remotePatterns` (FIFA hosts). | Modify to wrap with analyzer (RC-7). |
| Bracket size | `STAGE_MATCH_COUNT`: R32=16, R16=8, QF=4, SF=2, FINAL=1, THIRD_PLACE=1 → **32 bracket match nodes**; **12 groups**; **104 matches** (asserted by existing `build-mock-tournament.test.ts`). | Derive all test counts from the fixture, never hardcode (M3). |
| Fixture | `buildMockTournament(fetchedAt: string): Tournament` (deterministic mulberry32 PRNG); `parseTournament` validates. Existing tests call `buildMockTournament('2026-06-17T00:00:00Z')`. | Drive `build-graph.test.ts` the same way. |

## Scope

### In scope (the genuinely-missing work — small)
- **Semantic zoom (LOD)** — the one real feature gap:
  - `src/features/roadmap/lod.ts` (pure): `Lod = 'overview' | 'titles' | 'detail'`, hysteresis
    thresholds, `zoomToLod(zoom, prev?)`.
  - `src/features/roadmap/hooks/useZoomLevel.ts` (`'use client'`): reads
    `useStore(s => s.transform[2])`, tracks previous `Lod` in a ref, returns `{ zoom, lod }`.
  - Wire `lod` into `RoadmapCanvas.tsx` as a `data-lod` attribute on the existing
    `.pitch-grid` flow wrapper (RC-1) and add a **minimal `data-lod-detail` hook** to
    `MatchNode`'s `<footer>` and `GroupTableNode`'s secondary cells (RC-2) so CSS has a real
    target.
  - `[data-lod]` opacity transitions in `globals.css` (compositor-only `opacity`, behind the
    existing reduced-motion guard) (RC-4).
- **Unit tests for the pure builder + LOD:** `src/features/roadmap/build-graph.test.ts` and
  `src/features/roadmap/lod.test.ts`; extend `vitest.config.ts` `coverage.include` to measure
  `build-graph.ts` + `lod.ts` (RC-1, M3).
- **e2e extension** (reuse the existing `e2e/roadmap.spec.ts` + `playwright.config.ts`): add a
  deterministic wheel-zoom assertion (asserting the real `maxZoom=1.8` clamp + `panOnScroll`
  + the `60ms+400ms` fit timing), visual-regression at 320/768/1024/1440 with no horizontal
  overflow, a controls/minimap check, and an axe a11y smoke (RC-5, RC-8).
- **Bundle-budget check** wired against the **existing `ssr:false` code split** (shell chunk
  vs. canvas chunk), via `@next/bundle-analyzer` + the `next build` route table (RC-7).

### Reuse — DO NOT recreate (inventory)
`src/app/page.tsx`, `RoadmapCanvas.lazy.tsx`, `RoadmapCanvas.tsx`, `MatchNode.tsx`,
`GroupTableNode.tsx`, `AdvanceEdge.tsx`, `node-types.ts`, `edge-types.ts`, `StageToggle.tsx`,
`SegmentedControl`, `MatchDetailPanel.tsx`, `Legend` (inline in canvas), `useTournament`,
`useStageView`, `useRoadmapGraph`, `useFitOnChange`, `useBracketKeyboard`, `build-graph.ts`,
`format.ts`, all of `src/domain/**` + `src/features/roadmap/layout/**` + `src/data/**`,
`graph-model.ts`, `playwright.config.ts`, the existing `e2e/roadmap.spec.ts` (extend, don't
replace), and `src/app/layout.tsx` (already imports `globals.css`; the RF stylesheet is
already imported inside `RoadmapCanvas.tsx`).

### Out of scope
- Any change to domain, data, layout, `graph-model` types, or the existing node/edge/panel/
  toggle components **beyond** the minimal `data-lod-detail` hook in scope above.
- Adding Dagre/ELK, Vite, Canvas/WebGL, viewport culling.
- New providers / websockets (45s poll stays).
- Light theme / theme switching (deliberately dark "Midnight Pitch").
- Hoisting `@xyflow/react/dist/style.css` into `layout.tsx` — it is already co-located in
  `RoadmapCanvas.tsx:14`; hoisting it would pull RF base CSS into the SSR shell despite the
  `ssr:false` split (RC-3).
- Any orphan-CSS port / stale-token fix — those files do not exist (RC-2).
- Richer group columns (W/D/L/position). Ships P/GD/Pts as today.

## Approach

The deliverable is already assembled and rendering: `buildRoadmapGraph(tournament, view)`
produces the React Flow graph, `RoadmapCanvas` renders it with `@xyflow/react` v12 (d3-zoom
gives smooth cursor-centered wheel/pinch zoom + pan for free — the wheel-zoom requirement),
and the existing client hooks own data, view state, fit, and keyboard. So the work is to
**close the three real gaps without disturbing working code**: (1) add semantic-zoom LOD as a
pure `zoomToLod` mapping + a `useZoomLevel` hook that sets a `data-lod` attribute, with a
minimal stable DOM hook on the existing nodes' secondary detail and a single CSS opacity
transition; (2) add the missing unit coverage for the pure builder and LOD and include them in
the coverage config; (3) extend the existing Playwright suite with the wheel-zoom/breakpoint/
a11y checks the requirement calls out, written against the real DOM and the real timings. LOD
detail visibility is driven by the React `lod` value via a `data-lod` attribute + CSS rather
than conditional re-render, so React Flow never re-measures nodes and edges stay aligned.

**Rejected alternative — drive LOD by conditionally rendering node sub-content in
`MatchNode`/`GroupTableNode` (remount on band change):** that changes node DOM/measured size
on every zoom-band crossing, forcing React Flow to re-measure handles and risking edge
misalignment and layout thrash, and it spreads zoom state into every node. A single
`data-lod` attribute on the container + a CSS `opacity` transition is compositor-only, keeps
node geometry fixed (handles/edges stay put), and needs no per-node React state. (Dagre and a
server `loadTournament` loader were also rejected per deviations #2 and the existing
single-`useTournament` data path.)

## Files

### Create

| Path | Action | Responsibility |
|---|---|---|
| `src/features/roadmap/lod.ts` | create | Pure, no React. `export type Lod = 'overview' \| 'titles' \| 'detail'`; `export const LOD_ENTER`/`LOD_EXIT` threshold maps (enter > exit → hysteresis gap); `export function zoomToLod(zoom: number, prev?: Lod): Lod`. <60 lines. |
| `src/features/roadmap/hooks/useZoomLevel.ts` | create | `'use client'`. `useStore((s) => s.transform[2])` → zoom; keeps a `useRef<Lod>` of the previous band; returns `{ zoom, lod }` via `zoomToLod(zoom, prevRef.current)` and updates the ref. Consumes `lod.ts`. <40 lines. |
| `src/features/roadmap/build-graph.test.ts` | create | Vitest unit suite for `buildRoadmapGraph`, driven by `parseTournament(buildMockTournament('2026-06-17T00:00:00Z'))`. Counts derived from the fixture (see Test Strategy). |
| `src/features/roadmap/lod.test.ts` | create | Vitest unit suite for `zoomToLod` band mapping + hysteresis. |
| `e2e/wheel-zoom.spec.ts` | create | Deterministic wheel-zoom interaction: dispatch `wheel` over the canvas, assert viewport `scale` rises and clamps at **1.8**, falls and clamps at **0.2**, cursor-centered within tolerance; account for `panOnScroll` (zoom requires the wheel/ctrl path RF uses) and no timeout flake. |
| `e2e/visual.spec.ts` | create | Visual-regression + responsive: screenshots at 320/768/1024/1440 after `fonts.ready` + post-fit settle; assert `document.documentElement.scrollWidth <= clientWidth` (no horizontal overflow) at each width; mask flag `<img>`s. |
| `e2e/a11y.spec.ts` | create | `@axe-core/playwright` smoke (no serious/critical); `Tab` reaches a node with a visible focus ring; with `prefers-reduced-motion` emulated, assert the live edge animation is paused (the guard already exists — test it). |

### Modify

| Path | Action | Responsibility |
|---|---|---|
| `src/components/roadmap/RoadmapCanvas.tsx` | modify | **RC-1.** In `CanvasInner`, call `const { lod } = useZoomLevel();` and add `data-lod={lod}` to the existing `<div className="pitch-grid relative h-full w-full">` wrapper. No structural change; no new component. (`useZoomLevel` is safe here — `CanvasInner` is already inside `<ReactFlowProvider>`.) |
| `src/components/nodes/MatchNode.tsx` | modify | **RC-2 (minimal LOD hook).** Add `data-lod-detail` to the existing `<footer>` (kickoff + venue) so CSS can fade it at low zoom. No logic/markup change otherwise. |
| `src/components/nodes/GroupTableNode.tsx` | modify | **RC-2 (minimal LOD hook).** Add `data-lod-detail` to the secondary `<td>` cells (P / GD) — or a wrapping attribute on those columns — so CSS can fade them at low zoom; keep Team + Pts always visible. No logic change. |
| `src/app/globals.css` | modify | **RC-4 (only CSS work).** Add a small `[data-lod]` block: at `overview`/`titles`, `[data-lod="overview"] [data-lod-detail]` (and `titles` for the deepest detail) get `opacity: 0` with a `transition: opacity var(--duration) ease`; at `detail`, `opacity: 1`. Compositor-only. Add a `--duration-lod` token (or reuse an existing duration). Place it **inside / above** the existing `@media (prefers-reduced-motion: reduce)` guard so the transition is disabled under reduced motion. **Do NOT add** `.group-node*`, `.segmented*`, `.stage-toggle`, `.detail-panel*`, `--group-w`, or `.react-flow__background` rules — those target nothing or already work. Keep the file < 800 lines. |
| `vitest.config.ts` | modify | **RC-1/M3.** Add `'src/features/roadmap/build-graph.ts'` and `'src/features/roadmap/lod.ts'` to `coverage.include`. `test.include` already excludes `e2e/**` (it is `src/**/*.test.ts`) — confirm, no change. |
| `package.json` | modify | Add devDeps `@next/bundle-analyzer` and `@axe-core/playwright`. Add scripts `analyze` (`ANALYZE=true next build`) and (optional) `test:e2e:update` (`playwright test --update-snapshots`). `@playwright/test` and `test:e2e` already exist — do not duplicate. Do **not** add dagre/vite. |
| `next.config.ts` | modify | **RC-7.** Wrap the existing exported config with `@next/bundle-analyzer` gated on `process.env.ANALYZE === 'true'`, preserving `reactStrictMode` + `images.remotePatterns`. No other change. |

> If `build-graph.test.ts` reveals a real bug in `buildRoadmapGraph`, the fix is a minimal,
> justified edit to that file documented in the test. Otherwise leave it untouched.

## Data Model / Types

Reuse the EXACT existing types — define no parallel models:

- `RoadmapView = 'groups' | 'bracket' | 'full'`; `MatchNodeData`, `GroupNodeData`,
  `MatchFlowNode`, `GroupFlowNode`, `RoadmapNode`, `AdvanceEdgeState`, `AdvanceEdgeData`,
  `RoadmapEdge`, `RoadmapGraph` (`graph-model.ts`).
- `Tournament`, `Group`, `StandingRow`, `Match`, `Bracket`, `BracketNode`, `BracketSlot`,
  `SlotSource`, `TeamRef`, `Score`, `MatchStatus` (`src/domain/types`).
- Geometry: `NODE_W=260`/`NODE_H=96`, `GROUP_W=296`/`GROUP_H=208`, `STEP`, `groupGridWidth`,
  `computeBracketLayout`, `computeGroupGrid` (`layout/`).

New types/signatures (small, local):

```ts
// src/features/roadmap/lod.ts
export type Lod = 'overview' | 'titles' | 'detail';
export const LOD_ENTER: { titles: number; detail: number }; // zoom thresholds going UP
export const LOD_EXIT:  { titles: number; detail: number };  // lower thresholds going DOWN (hysteresis gap)
export function zoomToLod(zoom: number, prev?: Lod): Lod;

// src/features/roadmap/hooks/useZoomLevel.ts
export function useZoomLevel(): { zoom: number; lod: Lod };
```

`RoadmapCanvas` takes no new props — it composes the existing hooks plus `useZoomLevel`.

**Validation boundary (single, no re-parse):** the only untrusted boundary is the repository
result, already validated by `parseTournament` inside `MockRepository`/`FifaRepository`,
surfaced through `getCachedTournament` + the `/api/worldcup` route. `useTournament` reads that
route and trusts the already-validated `ApiEnvelope<Tournament>`. **No client-side re-parse,
no new server loader.** LOD adds no new boundary (it operates on a numeric zoom from React
Flow's own store).

## Test Strategy

Coverage target: **≥ 80%** for pure layers (vitest, v8). Newly-measured pure layers:
`build-graph.ts` and `lod.ts` (both currently excluded; added to `coverage.include` — this is
the first time they are measured). Existing layout/domain/provider coverage stays. Render/zoom
verified via Playwright (supplements, does not replace, the number).

### Unit (vitest) — behaviors to test

`build-graph.test.ts` — drive with `parseTournament(buildMockTournament('2026-06-17T00:00:00Z'))`;
**derive all counts from the fixture, never hardcode**:

1. `view: 'groups'` → `nodes.length === tournament.groups.length` (12), **`edges.length === 0`**,
   every node `type === 'group'`, positions equal `computeGroupGrid(tournament.groups.length, 4)`,
   each node `width === GROUP_W`, `height === GROUP_H`.
2. `view: 'bracket'` → `nodes.length === tournament.bracket.rounds.flatMap(r => r.nodes).length`
   (32); no `group` nodes; positions equal `computeBracketLayout(tournament.bracket)` (no
   x-offset); each node `width === NODE_W`, `height === NODE_H`.
3. `view: 'full'` → node count `=== groups.length + bracketNodes.length` (44); bracket x is
   offset by `groupGridWidth(2) + 180` vs. the bracket-view x; `feed-…` edges exist from each
   group to the R32 matches it seeds (per `R32_SEEDING`), each with `sourceHandle:'sr'`,
   `targetHandle:'tl'`, `data.state:'undecided'`.
4. Advance edges: every non-`group` slot source yields exactly one edge `child → parent`;
   every edge `source`/`target` resolves to a node id present in `nodes`; edge ids are unique
   and encode `slot.side` (`__home`/`__away`).
5. `edgeState` derivation: a finished child with decisive `score.winner !== 'draw'` →
   `decided`; any live child/parent → `live`; otherwise `undecided`. The fixture contains
   finished + live + scheduled, so assert at least one of each appears across the edge set.
6. `handlesFor`: child left of parent → `{sourceHandle:'sr', targetHandle:'tl'}`; child right
   of parent → `{sourceHandle:'sl', targetHandle:'tr'}` (assert on a left-half and a
   right-half edge using the layout x).
7. Immutability/purity: two calls produce structurally-equal output; the input `Tournament`
   is unchanged (deep-equal before/after, or pass a deep-frozen copy and assert no throw).

`lod.test.ts`:

8. `zoomToLod` (no `prev`) returns `overview` / `titles` / `detail` at representative zooms
   below / within / above the enter thresholds, including the `minZoom=0.2` and `maxZoom=1.8`
   extremes.
9. **Hysteresis:** from `detail`, dipping just below the `detail` *enter* threshold but above
   its *exit* threshold (passing `prev:'detail'`) stays `detail`; only crossing below the exit
   threshold flips down — proving no flicker at the boundary. Symmetric check going up from
   `overview`.

### E2E / visual (Playwright, `WC_PROVIDER=mock`, server already configured)

The existing `e2e/roadmap.spec.ts` already covers: API shape (104 matches / 12 groups), hero
+ canvas render, stage-toggle (`role="tab"` Groups/Bracket/Full + `?view=` URL), and click
`[data-final="true"]` → `getByLabel('Match details')` visible. **Keep it.** New specs add:

10. **Wheel zoom (the requirement):** focus the canvas, dispatch `wheel` (deltaY<0, with the
    ctrl/zoom path RF uses under `panOnScroll`) over a fixed point → `.react-flow__viewport`
    transform `scale` increases and **clamps at `maxZoom=1.8`**; deltaY>0 decreases and clamps
    at **`minZoom=0.2`**; the point under the cursor stays ~fixed within tolerance.
    Deterministic event dispatch — assert on the transform matrix, no arbitrary timeouts.
11. **Fit timing is deterministic:** `useFitOnChange` runs a **60ms `setTimeout` + 400ms**
    animated `fitView` on `${view}:${nodes.length}` change. Tests that assert "loads framed" or
    "view toggle re-fits" wait for `react-flow__viewport` transform to **stabilize** (poll until
    two consecutive reads match, or wait ≥ 460ms after the trigger) rather than asserting an
    instant fit.
12. **Controls + minimap:** zoom-in/out/fit buttons change the viewport transform; the minimap
    is visible (`.react-flow__minimap`).
13. **Node click → detail panel (RC-5):** clicking a match node makes
    `getByLabel('Match details')` visible with `aria-hidden="false"` and `translate-x-0`;
    `Escape` (and the close button) sets `aria-hidden="true"` / `translate-x-full`. Assert
    against the **real DOM** (`aria-label` + `aria-hidden`/transform), **not** a
    `.detail-panel[data-open]` attribute (which does not exist).
14. **Visual regression** at 320/768/1024/1440: after `fonts.ready` + fit settle, assert
    `scrollWidth <= clientWidth` (no horizontal overflow) and take masked screenshots.
15. **A11y smoke:** `@axe-core/playwright` reports no serious/critical violations; `Tab`
    reaches a node and shows a visible focus ring; with `prefers-reduced-motion` emulated, the
    live edge/`livepulse` animation is not running (existing `globals.css` guard — test, do
    not re-implement).

### Bundle budget (RC-7)

Because the canvas is code-split via `RoadmapCanvas.lazy` (`dynamic(..., { ssr:false })`),
React Flow is **not** in the initial document — it loads as an async chunk. Measure the real
chunk graph: (a) the `next build` route-size table for the `/` route (the shell), and (b) the
analyzer report (`ANALYZE=true next build`) for the lazy canvas chunk. Acceptance: the
**total JS the app page loads (shell + canvas chunk) stays < 300kb gzipped**. Fallback if
exceeded: drop `<MiniMap>` first (most droppable, lives in the canvas chunk so it shrinks the
async chunk, not the shell), then reduce `<Background>` density. State the split explicitly so
the budget is measured against actual chunks, not a single fictional app-page total.

## Review responses (point-by-point → Required Changes 1–8)

- **RC-1 (re-ground Files table):** Done. `page.tsx` and `RoadmapCanvas.tsx` are **no longer
  Create** — `page.tsx` is reuse-only; `RoadmapCanvas.tsx` is **Modify** for the single
  `data-lod` line. Added a "Reuse — DO NOT recreate" inventory naming `RoadmapCanvas.lazy.tsx`,
  `useRoadmapGraph`, `useFitOnChange`, `useBracketKeyboard`, the in-canvas `Legend`, and
  `format.ts`.
- **RC-2 (delete orphan-CSS / stale-token workstream):** Done. Confirmed via `**/*.css` scan
  that the only project CSS is `globals.css`; no `match-node.css`/`group-table-node.css`/
  `advance-edge.css`/`match-detail-panel.css` exist. All `--color-surface-*`/`--space-*`/
  "port the rule bodies" narrative removed. Every component is live-token Tailwind.
- **RC-3 (don't hoist the RF stylesheet):** Done. `@xyflow/react/dist/style.css` is already
  imported at `RoadmapCanvas.tsx:14`; `layout.tsx` is **not** modified. Hoisting is explicitly
  out of scope (would pull RF base CSS into the `ssr:false` shell).
- **RC-4 (scope CSS to LOD only):** Done. The `globals.css` Modify entry adds **only**
  `[data-lod]`/`[data-lod-detail]` opacity transitions behind the reduced-motion guard.
  `.group-node*`, `.segmented*`, `.stage-toggle`, `.detail-panel*`, `--group-w`, and
  `.react-flow__background` are explicitly **not** added.
- **RC-5 (MatchDetailPanel already done):** Done. No wiring/CSS task. Only an e2e assertion,
  written against `getByLabel('Match details')` + `aria-hidden`/transform (the real DOM), not
  `data-open`.
- **RC-6 (LOD targeting):** Resolved with option (a) — a **minimal, justified `data-lod-detail`
  hook** added to `MatchNode`'s `<footer>` and `GroupTableNode`'s secondary cells, listed under
  **Modify**. No claim of "zero node edits"; detail fade targets the real attributes those
  edits add. Detail visibility is driven by the React `lod` value via the container `data-lod`
  attribute + CSS.
- **RC-7 (bundle budget vs. the split):** Done. The budget section measures shell + canvas
  chunk separately given the existing `dynamic(ssr:false)` split, and re-justifies the
  drop-MiniMap fallback against that split.
- **RC-8 (e2e/canvas-prop accuracy):** Done. Wheel-zoom asserts the real `maxZoom=1.8` /
  `minZoom=0.2` clamps and `panOnScroll`; fit tests wait for the `useFitOnChange`
  **60ms + 400ms** settle (stabilize-the-transform), so they are deterministic, not flaky.

## Risks & Open Questions

**Risks**
- **LOD detail hook placement.** Adding `data-lod-detail` must not change node DOM dimensions
  (260×96 / 296×208) or React Flow re-measures handles and edges drift. Mitigation: the
  attribute is added to existing elements with no layout change; visual regression + the
  `build-graph` width/height assertions guard alignment.
- **`panOnScroll` vs. wheel-zoom test.** With `panOnScroll` on, plain wheel pans; zoom uses
  RF's ctrl/zoom path. The wheel-zoom e2e must dispatch the event the way RF interprets as zoom
  (ctrl+wheel / the zoom activation path) and assert the transform `scale`, not pan offset.
- **`@xyflow/react` v12 + React 19 SSR.** Already handled by the `ssr:false` lazy boundary;
  no change. The risk is only re-introduced if anyone hoists the RF import (out of scope).
- **Visual-regression flakiness from flags/fonts/fit animation.** Mitigation: `WC_PROVIDER=mock`,
  mask flag images, `fonts.ready` wait, and the `60ms+400ms` fit-settle wait before screenshots.
- **Bundle budget (<300kb gz).** React + React Flow is the bulk and sits in the async canvas
  chunk. Mitigation: no dagre/d3 add-ons; measure both chunks; fallback = drop MiniMap.

**Open questions (non-blocking; defaults chosen)**
- LOD band thresholds against `[0.2, 1.8]` zoom: start `detail` enter ≈ 0.85 / exit ≈ 0.7,
  `titles` enter ≈ 0.45 / exit ≈ 0.35 — tune during visual regression.
- Whether to also fade the group secondary columns or only the match footer at the
  `titles` band → decide during visual regression; not an acceptance gate.

## Acceptance Criteria

1. Visiting `/` renders, inside the existing semantic `<main>` + `<header>`/`<h1>` ("The Road
   to the Final"), an interactive graph of the WC-2026 group tables and knockout bracket; with
   no env set it works offline via the mock provider through `useTournament` → `/api/worldcup`.
2. **Mouse-wheel zoom is smooth, cursor-centered, and clamped** to `[0.2, 1.8]`; trackpad
   pinch zooms; nodes are not connectable/draggable (existing canvas behavior, asserted).
3. On load (and on view change) the whole graph is framed via the existing `useFitOnChange`
   (60ms + 400ms) fit; `<Background>`, `<MiniMap>`, and `<Controls>` are present and functional.
4. Match and group nodes render as the **existing designed cards** at the layout's exact
   dimensions (260×96 / 296×208) so edges align — reusing `MatchNode`/`GroupTableNode`,
   unchanged except for the `data-lod-detail` hook.
5. Advance edges connect feeder→target and are styled by `AdvanceEdgeState`
   (`decided`/`undecided`/`live`), with live animation disabled under `prefers-reduced-motion`
   (existing guard).
6. The existing `StageToggle` switches `'groups' | 'bracket' | 'full'`, persists `?view=`, and
   the graph re-fits; default view is **`'bracket'`**; in `'full'` the group tables feed the
   Round-of-32 via `feed-…` edges.
7. Clicking a match node opens the existing `MatchDetailPanel` (`aria-label="Match details"`,
   `aria-hidden="false"`); Escape and the close button close it.
8. **Semantic zoom (new):** zooming out fades node sub-detail (`data-lod-detail`) and zooming
   in reveals it with a compositor-only opacity transition; the LOD band uses hysteresis so it
   does not flicker at the threshold; detail is driven by the `lod` value via the container
   `data-lod` attribute + CSS, with the transition disabled under reduced motion.
9. All new CSS uses live `@theme` tokens (no `--color-surface-*`/`--space-*`, no hardcoded
   palette); only `[data-lod]`/`[data-lod-detail]` rules are added; `@xyflow/react/dist/style.css`
   stays imported in `RoadmapCanvas.tsx` (not hoisted into the SSR shell).
10. `buildRoadmapGraph` and `zoomToLod` are unit-tested with counts derived from the fixture;
    the newly-included `build-graph.ts` and `lod.ts` maintain **≥ 80%** coverage; `npm run test`
    passes.
11. Playwright passes: the existing suite plus new wheel-zoom (real 1.8/0.2 clamp, `panOnScroll`,
    deterministic 60ms+400ms fit waits), visual regression at **320/768/1024/1440** with no
    horizontal overflow, controls/minimap, and node-click→panel (against the real DOM).
12. A11y: nodes are keyboard-focusable with ARIA labels and a visible focus ring; axe reports
    no serious/critical violations; reduced-motion pauses the live animation.
13. No new disallowed dependency (no Dagre/ELK/Vite); the data boundary stays validated by
    `parseTournament` with **no re-parse**; no hardcoded secrets.
14. `npm run build`, `npm run typecheck`, and `npm run lint` pass; the app page (shell + lazy
    canvas chunk) stays within the **< 300kb gzipped** budget, measured via `@next/bundle-analyzer`
    + the `next build` route table against the existing `ssr:false` split (fallback: drop
    `<MiniMap>` if exceeded).
