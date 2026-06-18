# Plan: Canvas interaction model — both zoom/pan modes + persisted toggle

## Scope

Resolve the `canvas-interaction-model.md` §1 decision record by implementing the
owner's chosen resolution: **support BOTH canvas zoom-interaction modes with a
user-facing, persisted toggle** (not just option A or B). Wire the existing
`RoadmapCanvas` to derive its React Flow interaction props from the active mode,
add a focused hook that owns mode state + `localStorage` persistence, surface an
accessible toggle inside a React Flow `<Panel>` reusing `SegmentedControl`, update
the e2e spec to cover both modes + persistence, and reconcile the two requirement
docs with the shipped behavior.

### In scope

- New hook `useInteractionMode` (mode state + `localStorage` persistence, SSR/no-window safe).
- New `InteractionModeToggle` component (Panel + `SegmentedControl` + active-affordance hint).
- Editing `RoadmapCanvas.tsx` to compute React Flow interaction props from the mode.
- Unit tests for `useInteractionMode`; component tests for `InteractionModeToggle`.
- Rewriting `e2e/wheel-zoom.spec.ts` for both modes + toggle persistence.
- Doc reconciliation: mark `canvas-interaction-model.md` §1 RESOLVED; amend the
  wheel-zoom hard requirement and Architecture cross-reference in `zoomable-roadmap-graph.md`.

### Out of scope

- The timeline-grid layout, node arrangement, LOD bands, MiniMap/Controls/Background,
  selection, fitView, focus camera, standings overlay — all unchanged.
- `minZoom`/`maxZoom` values (stay `0.2`/`1.8`), node types, edges, data layer, API.
- Any change to `e2e/timeline-grid.spec.ts` or `e2e/per-match-orientation.spec.ts`
  (their `ctrlWheel` helper keeps zooming under both modes — see Risks).
- New dependencies. No library-ization of domain logic.

## Approach

Add a small `'zoom' | 'pan'` mode owned by `useInteractionMode`, persisted to
`localStorage` (key `wc-roadmap:interaction-mode`), defaulting to `'zoom'` (honors
the `zoomable-roadmap-graph.md` hard requirement). A pure helper maps the mode to
the exact set of React Flow interaction props, so `RoadmapCanvas` stays declarative
and the mapping is unit-testable without rendering. `RoadmapCanvas` spreads those
props onto `<ReactFlow>` and renders `InteractionModeToggle` (a `<Panel>` wrapping
the existing accessible `SegmentedControl`, plus a short hint line describing the
active zoom affordance). This mirrors the established `useStageView` + `StageToggle`
pattern already in the repo, so reviewers and future maintainers see a consistent
shape; persistence uses `localStorage` (not the URL) because interaction preference
is a device/user setting, not shareable view state.

- Mode `'zoom'` → `{ zoomOnScroll: true, panOnDrag: true, panOnScroll: false, zoomOnPinch: true }`
  (React Flow defaults: plain wheel zooms cursor-centered + clamped; drag pans).
- Mode `'pan'` → `{ panOnScroll: true, zoomOnScroll: false, zoomOnPinch: true, panOnDrag: true, zoomActivationKeyCode: ['Meta', 'Control'] }`
  (two-finger scroll pans; ⌘/Ctrl+scroll and pinch zoom).

**Rejected alternative:** put the mode in the `?` URL param like `useStageView`.
Rejected because interaction preference is a per-device ergonomic setting (mouse vs.
trackpad), not shareable view state — putting it in the URL would leak a personal
preference into shared links and fight `useStageView` for the query string.

## Files

| Path | Action | Responsibility |
|---|---|---|
| `src/features/roadmap/interaction-mode.ts` | create | Pure module: `InteractionMode` type, `INTERACTION_MODES`, `DEFAULT_INTERACTION_MODE`, `STORAGE_KEY`, `isInteractionMode()` guard, and `interactionFlowProps(mode)` mapping mode → React Flow interaction props. No React, no DOM. |
| `src/features/roadmap/hooks/useInteractionMode.ts` | create | Hook owning mode state + `localStorage` persistence. Returns `{ mode, setMode }`. SSR/no-window safe; reads on mount (client-only SPA), writes on change; tolerates `localStorage` throwing (private mode / quota). |
| `src/components/roadmap/InteractionModeToggle.tsx` | create | `<Panel position="bottom-left">` wrapping `SegmentedControl` (options `Zoom`/`Pan`) + a small `<p>` hint describing the active affordance. Keyboard + ARIA via the existing control. |
| `src/components/roadmap/RoadmapCanvas.tsx` | modify | Call `useInteractionMode()`; remove the hardcoded `panOnScroll`; spread `interactionFlowProps(mode)` onto `<ReactFlow>`; render `<InteractionModeToggle mode={mode} onChange={setMode} />`. Everything else (fitView, minZoom/maxZoom, MiniMap, Controls, Background, LOD, selection, StageToggle, Legend, panels) unchanged. |
| `src/features/roadmap/interaction-mode.test.ts` | create | Unit-test `interactionFlowProps` for both modes + `isInteractionMode` guard (node env). |
| `src/features/roadmap/hooks/useInteractionMode.test.tsx` | create | Unit-test the hook: default, hydrate-from-storage, toggle persists, invalid stored value falls back, no-window fallback, storage-throw tolerance (jsdom pragma). |
| `src/components/roadmap/InteractionModeToggle.test.tsx` | create | Component test: renders both options, switches on click/keyboard, hint text reflects active mode, ARIA tablist/tab roles present (jsdom pragma). |
| `e2e/wheel-zoom.spec.ts` | rewrite | Cover: `'zoom'` mode plain-wheel zoom + clamps; `'pan'` mode plain-wheel pans & ctrl/⌘+wheel zooms; toggle persists across reload. Assert real viewport transform; no arbitrary timeouts. |
| `requirements/canvas-interaction-model.md` | modify | Mark §1 **RESOLVED** — "both modes + toggle" chosen; keep the record, note the decision + default. |
| `requirements/zoomable-roadmap-graph.md` | modify | Reword the wheel-zoom hard requirement to "default wheel-zoom, with a toggle to scroll-pan"; point the Architecture/layout section at `docs/pipeline/timeline-grid-layout/plan.md` as authoritative visual model (carry over the other hard requirements). |

## Data Model / Types

`src/features/roadmap/interaction-mode.ts`:

```ts
export type InteractionMode = 'zoom' | 'pan';

export const INTERACTION_MODES = ['zoom', 'pan'] as const;
export const DEFAULT_INTERACTION_MODE: InteractionMode = 'zoom';
export const INTERACTION_MODE_STORAGE_KEY = 'wc-roadmap:interaction-mode';

export function isInteractionMode(value: unknown): value is InteractionMode {
  return value === 'zoom' || value === 'pan';
}

// Only the interaction-related props; spread onto <ReactFlow>.
export interface InteractionFlowProps {
  zoomOnScroll: boolean;
  panOnScroll: boolean;
  zoomOnPinch: boolean;
  panOnDrag: boolean;
  zoomActivationKeyCode?: string[];
}

export function interactionFlowProps(mode: InteractionMode): InteractionFlowProps;
// 'zoom' → { zoomOnScroll: true,  panOnScroll: false, zoomOnPinch: true, panOnDrag: true }
// 'pan'  → { zoomOnScroll: false, panOnScroll: true,  zoomOnPinch: true, panOnDrag: true,
//            zoomActivationKeyCode: ['Meta', 'Control'] }
```

`useInteractionMode.ts`:

```ts
export function useInteractionMode(): {
  mode: InteractionMode;
  setMode: (mode: InteractionMode) => void;
};
```

- `readStoredMode()`: `typeof window === 'undefined'` → `DEFAULT_INTERACTION_MODE`;
  else read key, validate with `isInteractionMode`, fall back to default; wrap the
  `localStorage.getItem` in try/catch (return default on throw).
- State initialized to `DEFAULT_INTERACTION_MODE`; hydrate from storage in a mount
  `useEffect` (matches `useStageView`'s client-only hydrate, avoids SSR mismatch).
- `setMode`: immutable state set + persist via try/catch'd `localStorage.setItem`;
  never throw to the UI.

`InteractionModeToggle.tsx`:

```ts
interface InteractionModeToggleProps {
  mode: InteractionMode;
  onChange: (mode: InteractionMode) => void;
}
```

- Options: `[{ value: 'zoom', label: 'Zoom' }, { value: 'pan', label: 'Pan' }]`.
- Hint copy: `'zoom'` → `"Scroll to zoom"`, `'pan'` → `"Scroll to pan · ⌘-scroll to zoom"`.
- `ariaLabel="Canvas scroll behavior"`; hint in a `<p>` referenced for context;
  reuse existing token classes (`border-edge bg-surf-1/80 ... backdrop-blur`).

## Test Strategy

Validation lives at the module boundary (mode parsing, props mapping) and is unit-
tested directly; React Flow behavior is asserted in e2e against the real viewport.

### Unit — `interaction-mode.test.ts` (node env)

- `interactionFlowProps('zoom')` → `zoomOnScroll: true`, `panOnScroll: false`,
  `panOnDrag: true`, `zoomOnPinch: true`, and no `zoomActivationKeyCode`.
- `interactionFlowProps('pan')` → `panOnScroll: true`, `zoomOnScroll: false`,
  `zoomActivationKeyCode` includes `'Meta'` and `'Control'`, `zoomOnPinch: true`.
- `isInteractionMode` accepts `'zoom'`/`'pan'`, rejects `'other'`, `null`, `42`, `undefined`.
- `DEFAULT_INTERACTION_MODE === 'zoom'`.

### Unit — `useInteractionMode.test.tsx` (jsdom pragma)

- Default: with empty `localStorage`, `mode === 'zoom'` after mount.
- Hydrate: pre-seed key with `'pan'` → `mode === 'pan'` after mount.
- Invalid stored value (`'garbage'`) → falls back to `'zoom'`.
- `setMode('pan')` updates `mode` and writes `'pan'` to `localStorage`.
- No-window fallback: `readStoredMode` returns default when `window` is undefined
  (test the pure reader with a stubbed/guarded path; never throws).
- Storage throw: `getItem`/`setItem` throwing does not crash the hook (mode still
  usable, default returned / set is a no-op-on-persist).
- `beforeEach` clears `localStorage` for isolation.

### Component — `InteractionModeToggle.test.tsx` (jsdom pragma)

- Renders both `Zoom` and `Pan` tabs (`role="tab"`), wrapped in a `role="tablist"`.
- Active tab has `aria-selected="true"` matching the `mode` prop.
- Clicking `Pan` calls `onChange('pan')`.
- Keyboard activation (Enter/Space on a focused tab) calls `onChange`.
- Hint text reads `"Scroll to zoom"` in zoom mode and contains `"⌘-scroll to zoom"`
  in pan mode.
- `ariaLabel` present on the tablist.

### E2E — `e2e/wheel-zoom.spec.ts` (rewrite)

Helpers: `readScale` + `readTranslate` (parse `a`/`d` and `e`/`f` from the viewport
matrix), `waitForStableScale`/`waitForStableTransform` (poll until two equal reads —
no arbitrary timeouts). A `setMode(page, mode)` helper clicks the toggle tab and
asserts `aria-selected`.

- **Zoom mode (default):** plain wheel (no ctrl) over the centre RAISES scale;
  hard zoom-in clamps at `maxZoom` (≤ 1.8 + ε, > 1.8 − 0.25); hard zoom-out clamps
  at `minZoom` (≥ 0.2 − ε, < 0.2 + 0.25). Assert scale, not translate.
- **Pan mode:** switch to `Pan` via the toggle; a plain wheel changes the translate
  (`e`/`f`) but NOT the scale (Δscale < 0.01); ctrl/⌘+wheel RAISES scale. Assert both.
- **Persistence:** set `Pan`, `page.reload()`, wait for canvas, assert the `Pan`
  tab is `aria-selected="true"` AND a plain wheel still pans (behavioral proof the
  persisted mode rehydrated).
- Sandbox note: browsers may be unavailable in-sandbox; spec is committed and runs
  under `npm run test:e2e`. Document the gap if it cannot execute here.

### Acceptance criteria (testable)

1. With no stored preference, the canvas starts in `'zoom'` mode and a plain mouse
   wheel zooms cursor-centered, clamped to `minZoom=0.2`/`maxZoom=1.8`. (e2e)
2. In `'zoom'` mode, drag pans and ctrl/⌘+wheel still zooms. (e2e / props unit)
3. In `'pan'` mode, a plain wheel/two-finger scroll pans (translate changes, scale
   constant) and ⌘/Ctrl+scroll or pinch zooms. (e2e / props unit)
4. The toggle is rendered in a React Flow `<Panel>`, is a `role="tablist"` of two
   `role="tab"`s, is operable by keyboard, and exposes an `aria-label`. (component)
5. Selecting a mode persists it to `localStorage` and the choice survives a reload. (e2e + hook unit)
6. `useInteractionMode` returns the default without throwing when `window` /
   `localStorage` is unavailable or throws. (hook unit)
7. The active-affordance hint matches the mode (`"Scroll to zoom"` vs.
   `"Scroll to pan · ⌘-scroll to zoom"`). (component)
8. `requirements/canvas-interaction-model.md` §1 is marked RESOLVED (both modes +
   toggle, default zoom) and `zoomable-roadmap-graph.md` wheel-zoom requirement +
   Architecture cross-reference are reconciled. (doc review)
9. All pre-existing unit and e2e tests stay green; `npm run test`, `tsc --noEmit`,
   and `vite build` pass.

**Coverage target:** ≥ 80%. `interaction-mode.ts` and `useInteractionMode.ts` are
fully branch-covered by the unit suites; `InteractionModeToggle` covered by the
component suite. Add both `interaction-mode.ts` and the two hook/toggle modules to
the `vitest.config.ts` coverage `include` globs so they are measured.

## Risks & Open Questions

- **Cross-spec coupling (LOW):** `e2e/timeline-grid.spec.ts` and
  `e2e/per-match-orientation.spec.ts` zoom via a `ctrlWheel` helper. Under the new
  default `'zoom'` mode, React Flow defaults still treat ctrl+wheel as zoom, so
  those specs remain valid without edits. Verify on the first full e2e run; if any
  flake, they only need their explanatory comment updated, not logic. Do NOT change
  their assertions in this work.
- **`zoomActivationKeyCode` shape (LOW):** confirm `@xyflow/react` v12 accepts an
  array (`['Meta','Control']`) for cross-platform ⌘/Ctrl; if only a single string is
  accepted in this version, fall back to `'Meta'` and document Ctrl via the system's
  default ctrl-zoom path (ctrl+wheel zoom works regardless under `panOnScroll`).
- **jsdom wheel/transform (LOW):** React Flow's real zoom math (d3-zoom) is not
  exercised reliably in jsdom; that behavior is intentionally asserted in e2e, while
  unit tests assert the pure props mapping + persistence only. No production risk.
- **Panel position (LOW):** `bottom-left` chosen to avoid overlap with `StageToggle`
  (`top-left`), `Legend` (`top-right`), and `Controls`/`MiniMap` (bottom). Confirm no
  visual collision with `<Controls>` (bottom-left default) — if it collides, use
  `bottom-center` or offset via the Panel className. Verify in visual check.
- **Open question:** none blocking. Hint glyph uses `⌘`; acceptable since the app
  targets modern browsers and the toggle is the primary affordance, with ctrl+scroll
  working on non-mac.

## Acceptance Criteria

1. Default mode is `'zoom'`; a plain wheel zooms cursor-centered, clamped to 0.2/1.8.
2. `'zoom'` mode: drag pans; ctrl/⌘+wheel also zooms; `panOnScroll` is off.
3. `'pan'` mode: plain/two-finger scroll pans (translate changes, scale constant);
   ⌘/Ctrl+scroll and pinch zoom.
4. A keyboard- and ARIA-accessible `SegmentedControl` toggle lives in a `<Panel>`,
   switching modes and showing the active-affordance hint.
5. Mode persists to `localStorage` and survives reload; default applies on first load.
6. `useInteractionMode` is SSR/no-window safe and never throws on storage failure.
7. `RoadmapCanvas` keeps fitView, minZoom/maxZoom, MiniMap, Controls, Background,
   LOD, selection, StageToggle, Legend, and panels unchanged.
8. `e2e/wheel-zoom.spec.ts` covers both modes and persistence, asserting the real
   viewport transform with deterministic (no arbitrary timeout) waits.
9. `canvas-interaction-model.md` §1 marked RESOLVED; `zoomable-roadmap-graph.md`
   wheel-zoom requirement reworded and Architecture pointed at the timeline-grid plan.
10. `npm run test`, `tsc --noEmit`, and `vite build` all pass; all existing tests green.
