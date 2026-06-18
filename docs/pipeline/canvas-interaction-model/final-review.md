# Final review — Canvas interaction model (both modes + persisted toggle)

**Stage 7 / closing assessment. Date: 2026-06-18.**
**Verdict: SHIP WITH CAVEATS** (two doc-consistency follow-ups; neither blocks).

This is a strategic, whole-effort assessment. The line-level review (stage 6,
`impl-review.md`) already APPROVED the change; this review judges the delivery as a
whole and re-verifies the green state independently.

## Observed gate results (re-run here, not inherited)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS** — exit 0, no errors |
| Unit/integration | `npm run test` (`vitest run`) | **PASS** — 31 files, **329 tests**, 3.33s |
| Build | `npm run build` (`vite build`) | **PASS** — exit 0, ~1.07s; `RoadmapCanvas` chunk 274.69 kB / **gzip 87.93 kB** (under the 300 kB app-page budget) |
| E2E | `npm run test:e2e` (`playwright test`) | **NOT RUN in this sandbox** — no browser launch attempted at this stage. Stage 6 reports it ran on real chromium (`wheel-zoom` 8/8; `timeline-grid` + `per-match-orientation` 2/2). Spec is committed and deterministic. |

The two load-bearing in-sandbox guards (typecheck + build) prove the wiring compiles
and the bundle ships; the behavioral d3-zoom proof lives in e2e, which the prior stage
executed against a real browser. I did not re-launch a browser here, so the e2e result
is carried forward from stage 6, not re-confirmed.

## 1. Requirement satisfaction

Judged directly against the authoritative `requirements/canvas-interaction-model.md`
(§1 RESOLVED = "both modes + toggle", default `'zoom'`) and the carried-over hard
requirement in `requirements/zoomable-roadmap-graph.md`.

**Delivered in full:**

- **Both modes exist and are correct.** `interactionFlowProps('zoom')` →
  `{ zoomOnScroll: true, panOnScroll: false, zoomOnPinch: true, panOnDrag: true }`
  (React Flow defaults: plain wheel zooms cursor-centered, drag pans).
  `interactionFlowProps('pan')` →
  `{ zoomOnScroll: false, panOnScroll: true, zoomOnPinch: true, panOnDrag: true, zoomActivationKeyCode: ['Meta','Control'] }`
  (two-finger/plain scroll pans; ⌘/Ctrl+scroll + pinch zoom). Matches the decision
  record line-for-line.
- **Default = `'zoom'`** — honors the written hard requirement. Asserted three ways:
  `DEFAULT_INTERACTION_MODE === 'zoom'` (unit), hook default-on-empty-store (unit), and
  e2e "default-by-absence" (no stored key, Zoom tab `aria-selected`).
- **Persisted toggle** — `localStorage` key `wc-roadmap:interaction-mode`, not the URL
  (correct: it is a per-device ergonomic preference, not shareable view state). Survives
  reload (hook unit + e2e behavioral proof).
- **Accessible toggle in a `<Panel>`** — reuses `SegmentedControl` (`role="tablist"` of
  native `<button role="tab">` with `aria-selected`), keyboard-operable (Enter/Space
  tested), `aria-label="Canvas scroll behavior"`, plus an active-affordance hint.
- **Focused hook + pure module** — `useInteractionMode` owns state/persistence;
  `interaction-mode.ts` is a React-free, DOM-guarded pure module. SSR/no-window safe and
  storage-throw tolerant, with genuine tests for each branch (the no-window branch is
  tested in the real node env where `window` is actually undefined — not a brittle stub).
- **`RoadmapCanvas` wiring** — derives props from the mode (memoized), spreads onto
  `<ReactFlow>`, renders the toggle. fitView, minZoom/maxZoom (0.2/1.8), MiniMap,
  Controls, Background, LOD (`data-lod`), selection, StageToggle, Legend — all untouched.
- **E2E rewritten** for both modes + persistence, asserting the real viewport transform
  matrix with poll-until-stable waits (no arbitrary timeouts). The old "plain wheel does
  NOT zoom" assertion is gone.
- **Docs reconciled** — `canvas-interaction-model.md` §1 marked RESOLVED (record kept
  intact); `zoomable-roadmap-graph.md` wheel-zoom requirement reworded to "default
  wheel-zoom, with a toggle to scroll-pan" and its Architecture section points at
  `docs/pipeline/timeline-grid-layout/plan.md` as the authoritative visual model.

**Partial / honest gaps:**

- **Spec/code reconciliation is incomplete by one detail.** The task's stated goal was
  "resolve the conflict so spec and code agree." Two sibling e2e specs still carry the
  now-false header comment *"The canvas uses `panOnScroll`, so a plain wheel PANS; only
  ctrl+wheel zooms"* (`e2e/timeline-grid.spec.ts:13`, `e2e/per-match-orientation.spec.ts:11`).
  After this change the **default** is wheel-zoom; a plain wheel zooms. The assertions in
  those specs are still valid (they only use `ctrlWheel`, which zooms in both modes), so
  this is a comment-only inaccuracy — but it is exactly the kind of spec/code drift this
  effort set out to eliminate. The plan-review (M1) and impl-review (LOW) both flagged
  it; it was not fixed. **Evidence: confirmed by direct read at this stage.**

No gate was skipped at the unit/typecheck/build level. The e2e gate was executed by the
prior stage on a real browser but not re-run here.

## 2. Tradeoffs

- **Both-modes-plus-toggle over a one-line A-or-B pick.** The owner explicitly rejected
  the binary. The cost is a hook, a pure module, a component, and an expanded e2e suite
  vs. a single prop change. The benefit is honoring the literal hard requirement (wheel
  zoom) as the default *and* serving trackpad users. Right call: it removes a standing
  HIGH conflict between spec and code that two prior reviews had flagged, and the surface
  added is small and well-tested.
- **`localStorage` over URL state.** Sacrifices shareability of the preference; gains
  not leaking a personal ergonomic into shared links and not fighting `useStageView` for
  the query string. Correct — interaction preference is device-scoped, not view state.
- **Pure-mapping + e2e-for-behavior split.** Unit tests assert the props mapping and
  persistence; the actual d3-zoom math is proven only in e2e. Sacrifices in-sandbox
  behavioral coverage (jsdom can't exercise d3-zoom reliably) for honest, non-brittle
  tests. Standard for this repo and defensible — but it means the in-sandbox guarantee is
  "it compiles and the props are right," not "it zooms."
- **`zoomActivationKeyCode` carried in `'pan'` props.** Stage-5 plan-review (M2)
  correctly noted that under `panOnScroll` the wheel-zoom path is actually enabled by
  `zoomOnPinch: true` (macOS reports trackpad pinch / ⌘ as `ctrlKey`), and
  `zoomActivationKeyCode` is largely inert on that handler. The prop is harmless and
  forward-compatible, and the code comment in `interaction-mode.ts` documents it — but a
  future maintainer who "simplifies" by dropping `zoomOnPinch` would silently break
  ⌘-scroll zoom. The risk is mitigated by the e2e test that asserts ctrl/⌘+wheel zooms in
  pan mode, which would catch exactly that regression.

## 3. Architecture & fit

Strong fit, low friction. The change mirrors the established `useStageView` +
`StageToggle` pattern exactly (client-only hydrate-on-mount, presentational toggle in a
`<Panel>`, persistence in a focused hook), so a maintainer who knows one knows the other.
Clean separation: a React-free pure module (`interaction-mode.ts`) holds the seam and is
unit-testable without rendering; the hook owns state/persistence; the component is
presentational; `RoadmapCanvas` just spreads. No domain logic was library-ized, no new
dependencies, all files are small (module 84 lines, hook 35, toggle 49). Immutability is
respected throughout (fresh props object and fresh activation-key array per call;
`setMode` replaces, never mutates; the `displayNodes` injection stays an immutable copy).
This is consistent with the codebase's direction, not a deviation from it.

## 4. Tech debt & risks

- **(LOW, debt) Stale comments in two e2e specs** — described in §1. Comment-only; no
  behavioral risk, but a documentation-truth gap that the effort's own charter targets.
- **(LOW, debt) Misleading mental model around `zoomActivationKeyCode`** — §2. Mitigated
  by a code comment and the pan-mode ctrl-wheel e2e test. Worth a one-line clarifying
  comment in `interaction-mode.ts` if not already crisp.
- **(LOW, risk) `aria-describedby` on a non-focusable wrapper** —
  `InteractionModeToggle.tsx:35` puts `aria-describedby={hintId}` on a `<div>` wrapping
  `SegmentedControl`, not on the focusable `<button role="tab">`s inside it. Screen
  readers announce `aria-describedby` from the *focused* element, so most AT will not read
  the affordance hint on tab focus. The hint is still visible, and the tablist has a
  descriptive `aria-label`, so this is an enhancement gap, not a barrier. (Flagged MEDIUM
  in impl-review; downgraded here at the system level because the primary control is fully
  accessible and the hint is on-screen.)
- **(LOW, risk) Panel position** — `bottom-center` instead of the plan's `bottom-left`;
  a documented, plan-sanctioned deviation to avoid colliding with `<Controls>` (RF's
  default bottom-left). Acceptable; visual placement was verified by the prior stage's
  e2e run. No system-level risk.
- **Security/performance posture:** No new attack surface — `localStorage` read/write is
  try/catch-wrapped, validated through `isInteractionMode`, never echoes untrusted data
  into the DOM, no secrets, no network. Performance is neutral: props are memoized on
  `mode`, the bundle is unchanged in shape and within budget (gzip 87.93 kB vs. 300 kB).
  No CSP/header concerns introduced by this change.

No CRITICAL or HIGH debt. Nothing here will break under scale (the data path is
untouched) or under the documented edge conditions (no-window, storage-throw,
invalid-stored-value are all tested).

## 5. Test & quality posture

High confidence. **329 tests pass.** Coverage (per stage 6's `test:coverage`) is overall
95.96% lines / 88.36% branch, with `features/roadmap` at 98.69% and `components/roadmap`
at 100%; the three new modules are explicitly in the coverage `include` globs, so the
numbers are real, not diluted by exclusion.

- **Strong:** the pure module (`interaction-mode.test.ts`, 26 tests) covers both prop
  mappings, the guard against 8 invalid inputs, purity/freshness, and the genuine
  no-window branch in the real node env. The hook (11 tests) covers default, hydration,
  garbage-rejection, round-trip persistence, remount survival, immutability, stable
  identity, and both storage-throw paths. The component (11 tests) covers ARIA structure,
  aria-selected, click + keyboard (Enter/Space) activation, and hint correctness in both
  modes. The e2e asserts the real viewport matrix and both clamps with deterministic waits.
- **Thin (by design):** in-sandbox there is **no behavioral proof of the d3-zoom math** —
  that lives entirely in e2e, which was not re-run at this stage. The `RoadmapCanvas`
  *wiring* (that it actually spreads the props and renders the toggle) is guarded
  in-sandbox only by typecheck + build; its behavioral correctness rests on e2e. This is
  a deliberate, repo-consistent split, but it means an environment without a browser
  cannot independently confirm "it zooms" — only "it should."

## 6. Follow-ups (prioritized)

**Must-do (before considering the reconciliation complete):**

1. **Fix the two stale e2e comments** in `e2e/timeline-grid.spec.ts:13` and
   `e2e/per-match-orientation.spec.ts:11`. Reword to e.g. "ctrl+wheel zooms under both
   interaction modes; the default is now wheel-zoom." Comment-only, no assertion change.
   This closes the last spec/code drift — the explicit goal of the task.

**Nice-to-have:**

2. **Thread the hint to the focusable tabs for AT.** Add an optional
   `describedById` / `aria-describedby` pass-through in `SegmentedControl` so the
   active-affordance hint is announced on tab focus (currently on a non-focusable wrapper).
3. **Add a one-line clarifying comment** in `interaction-mode.ts` near the pan-mode props
   stating that `zoomOnPinch: true` (not `zoomActivationKeyCode`) is what enables
   ⌘/Ctrl+scroll zoom under `panOnScroll`, so a future "simplification" doesn't silently
   break it. (The ctrl-wheel pan-mode e2e test is the safety net.)
4. **Run `npm run test:e2e` in CI** on every change to this area so the behavioral proof
   isn't only asserted in environments that happen to have a browser.

## Verdict

**SHIP WITH CAVEATS.**

The feature is correct, well-architected, well-tested, and fully satisfies the resolved
requirement — both modes, persisted toggle, wheel-zoom default, accessible control, docs
reconciled. Typecheck, 329 unit/integration tests, and the production build are green in
this sandbox; the e2e behavioral proof was executed on a real browser by the prior stage.

Caveats (none blocking):

1. **Two sibling e2e specs still carry now-false `panOnScroll` comments** — the one
   remaining spec/code-truth gap, and the task's own reconciliation goal. Fix is
   comment-only (follow-up #1).
2. **`aria-describedby` hint does not reach the focusable tabs**, so the affordance hint
   isn't announced on tab focus (follow-up #2). Visible on screen; primary control fully
   accessible.
3. **In-sandbox confidence in the zoom behavior rests on typecheck + build**; the d3-zoom
   proof is e2e-only and was not re-run at this stage.

Ship it, and fold follow-up #1 in promptly to truly close the spec/code reconciliation.
