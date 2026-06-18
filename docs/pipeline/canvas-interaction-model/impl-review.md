# Implementation review — Canvas interaction model (both modes + persisted toggle)

**Verdict: APPROVED** — no CRITICAL or HIGH issues; all gates pass.

## Summary

The implementation faithfully resolves `canvas-interaction-model.md` §1 by shipping
**both** zoom-interaction modes behind a persisted, accessible toggle — exactly the
owner's chosen "both modes + toggle" resolution, not a binary A-or-B pick.

- Pure mode → React Flow prop mapping in `src/features/roadmap/interaction-mode.ts`:
  `'zoom'` → `{ zoomOnScroll: true, panOnScroll: false, zoomOnPinch: true, panOnDrag: true }`
  (React Flow defaults: plain wheel zooms cursor-centered, drag pans); `'pan'` →
  `{ panOnScroll: true, zoomOnScroll: false, zoomOnPinch: true, panOnDrag: true, zoomActivationKeyCode: ['Meta','Control'] }`
  (two-finger scroll pans; ⌘/Ctrl+scroll + pinch zoom). Matches the plan precisely.
- `useInteractionMode` owns state + `localStorage` persistence, default `'zoom'`,
  SSR/no-window safe, storage-throw tolerant, immutable set, stable `setMode` identity.
- `InteractionModeToggle` reuses the accessible `SegmentedControl` inside a React Flow
  `<Panel>`, with an active-affordance hint ("Scroll to zoom" / "Scroll to pan · ⌘-scroll to zoom").
- `RoadmapCanvas` derives interaction props from the mode (memoized) and spreads them
  onto `<ReactFlow>`; the hardcoded `panOnScroll` is gone. fitView, minZoom/maxZoom
  (0.2/1.8), MiniMap, Controls, Background, LOD (`data-lod`), selection, StageToggle,
  Legend, and panels are all untouched.
- Both requirement docs are reconciled with the shipped behavior.

The most load-bearing verification — that a real browser viewport actually zooms vs.
pans per mode and rehydrates the persisted mode — was run on real chromium and passes.

## Observed gate results

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | PASS (no errors) |
| Unit/integration | `npm run test` | PASS — 31 files, **329 tests** |
| Coverage | `npm run test:coverage` | PASS — overall **95.96% lines / 88.36% branch** (≥80%); `features/roadmap` 98.69%, `components/roadmap` 100% |
| Build | `npm run build` (`vite build`) | PASS — built in ~1.1s; `RoadmapCanvas` chunk 274.69 kB / **gzip 87.93 kB** (under the 300 kB app-page budget) |
| Lint | n/a | No `lint` script or eslint config in repo — not applicable |
| E2E (new) | `npx playwright test e2e/wheel-zoom.spec.ts --project=chromium` | PASS — **8/8** (zoom clamps at 1.8/0.2, pan translates w/ constant scale, ctrl-wheel zooms in both modes, persistence across reload) |
| E2E (coupling) | `npx playwright test e2e/timeline-grid.spec.ts e2e/per-match-orientation.spec.ts --project=chromium` | PASS — **2/2** (ctrl-wheel zoom still reachable under default `'zoom'`) |

Sandbox note: Playwright chromium was available locally, so the e2e behavior was
genuinely executed (not just committed). The spec also runs under `npm run test:e2e`.

## Acceptance criteria — verified

1. Default `'zoom'`; plain wheel zooms cursor-centered, clamps at 0.2/1.8 — e2e PASS.
2. `'zoom'` mode: drag pans, ctrl/⌘+wheel zooms, `panOnScroll` off — props unit + e2e PASS.
3. `'pan'` mode: plain wheel pans (translate changes, scale constant), ctrl/⌘+wheel zooms — e2e PASS.
4. Toggle in a `<Panel>`, `role="tablist"` of two `role="tab"`s, keyboard-operable,
   `aria-label="Canvas scroll behavior"` — component tests PASS.
5. Mode persists to `localStorage` and survives reload; default applies first load — e2e + hook unit PASS.
6. `useInteractionMode` SSR/no-window safe, never throws on storage failure — hook unit PASS.
7. Active-affordance hint matches mode — component tests PASS.
8. e2e asserts the real viewport transform with deterministic (poll-until-stable) waits, no arbitrary timeouts — verified.
9. `canvas-interaction-model.md` §1 marked RESOLVED; `zoomable-roadmap-graph.md` wheel-zoom
   requirement reworded to "default wheel-zoom, with a toggle to scroll-pan" and Architecture
   section points at `docs/pipeline/timeline-grid-layout/plan.md` — verified.
10. All gates pass; all pre-existing tests green.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

- **`aria-describedby` on a non-focusable wrapper does not reach the tabs** —
  `src/components/roadmap/InteractionModeToggle.tsx:35`. The hint is associated via
  `aria-describedby={hintId}` on a `<div>` wrapping the `SegmentedControl`. Screen
  readers announce `aria-describedby` from the **focused** element; the focusable
  controls are the `<button role="tab">`s rendered *inside* `SegmentedControl`, and the
  describedby lives on a non-focusable parent `div`, so most screen readers will not
  announce the hint when a tab gains focus. The hint is still visible and the tablist
  has a descriptive `aria-label`, so this is a minor enhancement gap, not a blocker.
  Concrete fix: thread an optional `describedById`/`aria-describedby` through
  `SegmentedControl` onto each `<button>` (or render the hint with an `id` that the
  control's buttons reference), so assistive tech reads the active affordance on focus.

### LOW

- **Stale "uses `panOnScroll`" comments in sibling e2e specs** —
  `e2e/timeline-grid.spec.ts:13` and `e2e/per-match-orientation.spec.ts:11` still read
  "The canvas uses `panOnScroll`, so a plain wheel PANS; only ctrl+wheel zooms." After
  this change the **default** mode is `'zoom'` (plain wheel zooms). Those specs use
  `ctrlWheel`, which zooms in both modes, so they correctly pass — but the comments are
  now factually wrong and misleading. The plan's "Cross-spec coupling" risk explicitly
  anticipated updating "their explanatory comment, not logic"; that comment update was
  missed. Fix: reword both comments to "ctrl+wheel zooms under both interaction modes;
  the default is now wheel-zoom" (no assertion change).

- **Panel position deviates from the plan's `bottom-left`** —
  `src/components/roadmap/InteractionModeToggle.tsx:33` uses `position="bottom-center"`
  rather than the plan's `bottom-left`. This is a *documented, codebase-grounded*
  deviation: the plan's Risks note explicitly allows `bottom-center` to avoid collision
  with `<Controls>` (React Flow's default bottom-left). Acceptable as-is; noting only for
  traceability. No action required.

## Notes (non-findings, verified good)

- No `console.log`/debug statements in any new file.
- Immutable throughout: `interactionFlowProps` returns a fresh object and a fresh
  activation-key array per call (unit-tested); `setMode` replaces state, never mutates;
  `displayNodes` injection in `RoadmapCanvas` stays an immutable copy.
- Files are small and focused (interaction-mode.ts 84 lines, hook 35, toggle 49).
- `zoomActivationKeyCode: ['Meta','Control']` array shape is accepted by `@xyflow/react`
  v12 at runtime — proven by the passing "ctrl/⌘+wheel still zooms in pan mode" e2e test
  (resolves the plan's LOW open question on array vs. string shape).
- Coverage `include` globs already list `interaction-mode.ts`, `useInteractionMode.ts`,
  and `InteractionModeToggle.tsx`, so the new code is genuinely measured.
- No new dependencies; no domain-logic library-ization; pattern mirrors the existing
  `useStageView` + `StageToggle`.
- LOD (`data-lod={lod}`) and selection (`onNodeClick`/`onPaneClick`) wiring unchanged.
