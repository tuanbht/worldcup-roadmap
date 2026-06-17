# Plan Review (round 4): Zoomable family-tree roadmap graph (WC 2026)

**Verdict: APPROVED**

## Summary

Revision #4 of the plan is now correctly grounded in the actual files on disk. I independently
verified every load-bearing claim against the codebase (not just the plan's assertions), and the
plan is accurate. The two prior CRITICAL items — core deliverables wrongly marked **Create**, and a
fictional "orphan CSS / stale-token" workstream — are resolved: `src/app/page.tsx`,
`RoadmapCanvas.lazy.tsx`, and `RoadmapCanvas.tsx` all exist as described and are correctly marked
reuse/Modify, and a `**/*.css` scan confirms `src/app/globals.css` is the only project stylesheet
(no `match-node.css`/`group-table-node.css`/`advance-edge.css`/`match-detail-panel.css`). All 8
Required Changes from round 3 are genuinely addressed.

The deviations from the requirement doc are sound and explicitly justified: no Vite (Next.js 15 App
Router), no Dagre (deterministic `computeBracketLayout` + `computeGroupGrid` already solve layout),
and the real WC-2026 domain rather than a generic `RoadmapItem`/`dependsOn` DAG, reusing the exact
`graph-model.ts` types. The genuinely-missing work is correctly and narrowly scoped: semantic-zoom
LOD (`lod.ts` + `useZoomLevel` — confirmed absent), unit coverage for the pure `buildRoadmapGraph`
and `zoomToLod`, an e2e extension (wheel-zoom / visual / a11y), and a bundle-budget check against
the existing `ssr:false` split. The approach (drive LOD by a container `data-lod` attribute + CSS
opacity transition rather than per-node conditional render, so React Flow never re-measures and
edges stay aligned) is architecturally correct and well-reasoned, including an explicitly rejected
alternative.

## Verification performed (code is authoritative)

- `src/components/roadmap/RoadmapCanvas.tsx` — confirmed `<ReactFlowProvider>` + `<ReactFlow>` with
  `fitView`, `fitViewOptions={{padding:0.18}}`, `minZoom={0.2}`, **`maxZoom={1.8}`**,
  `nodesConnectable={false}`, `edgesFocusable={false}`, `onlyRenderVisibleElements`, **`panOnScroll`**,
  `<Background>`/`<MiniMap>`/`<Controls>`/`<StageToggle>`/inline `Legend`, `onNodeClick`→`MatchDetailPanel`,
  `@xyflow/react/dist/style.css` at **line 14**, `.pitch-grid` wrapper at line 76 (the `data-lod` target).
- `src/features/roadmap/build-graph.ts` — pure `Tournament + view → {nodes,edges}`; groups→`edges:[]`,
  bracket positions from `computeBracketLayout`, advance edges from slot `SlotSource` skipping `group`,
  `feed-…` edges in `full` keyed off `R32_SEEDING` with `sourceHandle:'sr'`/`targetHandle:'tl'`/`state:'undecided'`,
  `edgeState` from status/score, `handlesFor` by relative x. Untested today; excluded from coverage. Matches the plan.
- `MatchNode.tsx` (`<footer>` at line 68) and `GroupTableNode.tsx` (P/GD/Pts `<td>`s) — the LOD detail
  targets the plan names; both are Tailwind-only with no CSS file and the exact `260×96`/`296` dimensions.
- `graph-model.ts` types, `layout-constants.ts` (`NODE_W=260`/`NODE_H=96`/`GROUP_W=296`/`GROUP_H=208`),
  `group-layout.ts` (`computeGroupGrid`/`groupGridWidth`), `seeding.ts` (`R32_SEEDING`) — all match.
- `globals.css` — live `@theme` tokens, `.advance-edge*` inline, and the **`prefers-reduced-motion` guard
  already present** (lines 147–152). Only `--node-w`/`--node-h` are defined (not `--col-gap`/`--row-gap`).
- `vitest.config.ts` `coverage.include` = `domain/**`, `features/roadmap/layout/**`, `data/providers/**`
  (excludes `build-graph.ts` + a future `lod.ts`); `test.include = ['src/**/*.test.ts']`. Matches the plan.
- `package.json` (`@playwright/test` + `test:e2e` already present; no analyzer/axe), `next.config.ts`
  (exists), `playwright.config.ts` (chromium@1440 + iPhone-13, `WC_PROVIDER=mock`, baseURL :3217), and the
  existing `e2e/roadmap.spec.ts` — all match the plan's description.
- Confirmed `lod.ts`, `useZoomLevel.ts`, and any `data-lod` usage do **not** yet exist (the real gap).
- Fixture counts: `build-mock-tournament.test.ts` asserts 104 matches / 12 groups / 32 bracket nodes —
  the plan's fixture-derived test counts (12 / 32 / 44) are correct.

## Findings

No CRITICAL or HIGH issues. The notes below are MEDIUM/LOW and are advisory, not gating.

### MEDIUM

- **M1 — Playwright project matrix vs. fixed-viewport visual specs.** `playwright.config.ts` runs every
  spec under both the `chromium` (1440×900) and `mobile` (iPhone-13) projects. The new `e2e/visual.spec.ts`
  drives 320/768/1024/1440 by setting the viewport per test; under the mobile project those `setViewportSize`
  calls (and the desktop-oriented baseline screenshots) may conflict or double-run. Decide explicitly: scope
  the breakpoint/visual specs to the chromium project (e.g. `test.skip(({ browserName }) ...)` or a project
  filter), or add a dedicated project. Otherwise screenshot baselines and counts get confusing. Non-blocking
  but worth nailing down before writing the spec.

- **M2 — `panOnScroll` wheel-zoom test is the riskiest assertion; pre-confirm the event path.** The plan
  already flags this in Risks, which is good. With `panOnScroll` enabled, a plain `wheel` pans and zoom uses
  React Flow's ctrl/zoom-activation path. The e2e must dispatch the event RF interprets as zoom and assert on
  the `.react-flow__viewport` transform matrix `scale` (clamping at 1.8 / 0.2), not pan offset. Recommend
  verifying the exact event shape against `@xyflow/react@12` behavior (Context7 or a quick spike) before
  committing the assertion, so this test is deterministic rather than discovered-flaky.

### LOW

- **L1 — "Works offline with no env" depends on FIFA failing, not on mock being the default.** Acceptance
  criterion #1 says no-env runs offline via the mock provider. In reality `WC_PROVIDER` defaults to `'auto'`,
  which `selectRepository()` resolves to `new FifaRepository(new MockRepository())` — FIFA *with* mock
  fallback. It only serves mock data offline because the FIFA call fails and falls back. The e2e harness
  pins `WC_PROVIDER=mock` (deterministic — correct). Minor wording nuance; the behavior is fine.

- **L2 — Stale comments in the codebase (not the plan's job).** `layout-constants.ts` comments reference
  `--col-gap`/`--row-gap` tokens that don't exist in `globals.css`, and `StageToggle` sets a `.stage-toggle`
  className that matches no CSS rule. Both are pre-existing no-ops; the plan correctly avoids adding dead CSS
  for them. Out of scope — noted only so the implementer isn't surprised.

- **L3 — Feed-edge target handle.** The `full`-view `feed-…` edges use `targetHandle:'tl'`, which exists on
  `MatchNode`; the source is the group node's `sr` handle (present on `GroupTableNode`). Verified consistent —
  the planned test #3 assertion (`sourceHandle:'sr'`, `targetHandle:'tl'`) is correct.

## What the plan gets right (keep)

- Correct, justified deviations (no Vite, no Dagre, real WC domain, reuse `graph-model.ts`).
- Accurate reuse inventory; core deliverables correctly marked reuse/Modify, not Create.
- LOD via container `data-lod` + CSS opacity (compositor-only, keeps node geometry fixed so handles/edges
  stay aligned), with the inferior conditional-remount alternative explicitly rejected for the right reason.
- Hysteresis (`LOD_ENTER`/`LOD_EXIT` gap) to prevent band flicker, with a dedicated unit test.
- Fixture-derived test counts (never hardcoded); immutability/purity assertion on the builder.
- Single validation boundary preserved (`parseTournament` in the repositories → `/api/worldcup` →
  `useTournament`, no client re-parse); LOD adds no new boundary.
- Bundle budget framed against the real `ssr:false` chunk split; sensible MiniMap-first fallback.
- Reduced-motion handled by the existing guard (tested, not re-implemented); accessibility (keyboard-focusable
  nodes, ARIA labels, focus ring) covered by the a11y spec.

## Verdict

No CRITICAL or HIGH issues remain; all 8 round-3 Required Changes are resolved and verified against
the actual code. **APPROVED.** Address M1/M2 during implementation (they affect test robustness, not
the plan's soundness).
