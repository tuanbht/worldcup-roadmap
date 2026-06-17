# Implementation Review — Zoomable roadmap graph (semantic-zoom LOD + coverage + e2e + budget)

**Verdict: APPROVED** — no CRITICAL or HIGH findings. All runnable gates pass. Lint cannot
run in this repo due to a pre-existing missing ESLint config (not caused by this change); see
note below.

## Observed gate results (run by the reviewer)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **PASS** (exit 0) |
| Unit | `npm run test` | **PASS** — 7 files, **52 tests** (32 new: build-graph 18, lod 14) |
| Coverage | `npm run test:coverage` | **PASS** — `build-graph.ts` **98.43%**, `lod.ts` **100%**; all-files 85.79% (≥80%) |
| Build | `npm run build` | **PASS** (exit 0) |
| E2E | `npm run test:e2e -- --project=chromium` | **PASS** — **17/17** (wheel-zoom clamps, axe, reduced-motion, 4 breakpoints + overflow) |
| Lint | `npm run lint` | **BLOCKED (pre-existing)** — `next lint` prompts for ESLint setup; repo has no `.eslintrc*`/`eslint.config.*`. Not introduced by this change. |

Coverage detail: `build-graph.ts` only uncovered lines are 58–59 (the `decided` branch of
`edgeState` — a real but minor gap covered indirectly via the edge-state assertions).

## Plan conformance — verified

- **No existing file rewritten/recreated.** Modify edits are surgical:
  - `MatchNode.tsx`: single `data-lod-detail` added to the existing `<footer>` (L68). No other change.
  - `GroupTableNode.tsx`: `data-lod-detail` added to the two secondary `<td>` cells (P, GD) (L58–59). Team + Pts stay always-visible. No logic change.
  - `RoadmapCanvas.tsx`: `useZoomLevel` import + `const { lod }` + `data-lod={lod}` on the existing `.pitch-grid` wrapper (L67, L78). No structural change.
  - `globals.css`: `[data-lod]`/`[data-lod-detail]` opacity block inside `@layer components`, plus one `transition: none` line inside the **existing** `prefers-reduced-motion` guard. `--duration-lod: 220ms` token added in `@layer base`. No `.group-node*`/`.segmented*`/`--group-w`/`.react-flow__background` rules added (RC-4 honored).
  - `vitest.config.ts`: `build-graph.ts` + `lod.ts` added to `coverage.include`.
  - `package.json` / `next.config.ts`: analyzer + axe added; analyzer gated on `ANALYZE=true` and loaded lazily.
- **LOD uses `data-lod` + CSS opacity, not node remount.** Detail visibility is driven by the container attribute; node content is never conditionally re-rendered. Compositor-only (opacity), node geometry fixed.
- **Node dimensions unchanged:** MatchNode `h-[96px] w-[260px]`, GroupTableNode `w-[296px]`; layout constants 260×96 / 296×208.
- **New pure layers ≥80%:** `lod.ts` 100%, `build-graph.ts` 98.43%.
- **Data boundary single-validated:** no `parseTournament`/`.parse()` anywhere in `src/features` or `src/components` (only in the data layer + tests). No client re-parse.
- **No disallowed deps:** no dagre/elk/vite as deps; `@vitejs/plugin-react`/`vitest` are test-only tooling.
- **MEDIUM advisory (a) — viewport matrix:** `visual.spec.ts` self-drives viewport via `setViewportSize` and `test.skip`s the `mobile` project, so the 320/768/1024/1440 specs are not double-run. Honored.
- **MEDIUM advisory (b) — RF zoom event under panOnScroll:** `wheel-zoom.spec.ts` documents and uses the `ctrlKey: true` wheel path (RF pinch-zoom), asserts the viewport transform scale (not pan), and includes a plain-wheel-does-not-zoom control test. All three pass. Honored.

## Additional verification

- **Bundle budget (<300 kb gz):** `/` shell First Load JS = **104 kB**. React Flow lives in the lazy `ssr:false` canvas chunks (`1a258343.js` 23.2 kB gz + `697.js` 31.3 kB gz ≈ **54.5 kB gz**). Realistic page total (shell + canvas chunk) ≈ **~158 kB gz**; even the naive sum of every emitted chunk is ~298 kB gz. **Under budget.** MiniMap-drop fallback not needed.
- **`useZoomLevel` StrictMode safety:** the hook writes `prevRef.current` during render. Verified `zoomToLod(z, undefined)` is idempotent with `zoomToLod(z, l1)` for the same `z` across the full `[0.15, 1.85]` domain — no band drift under React 19 StrictMode double-render.
- **Reduced-motion:** the existing guard now also disables the LOD transition; `StatusPill` `livepulse` and `advance-edge--live` animation remain paused. e2e confirms `animationName: none` on the live edge under emulated reduced motion.
- **Visual baselines** are real renders at exactly 320×720 / 768×1024 / 1024×768 / 1440×900.
- No `console.*`/`debugger` in new or modified code; all files < 800 lines.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW

- **L1 — `useZoomLevel.ts:19-20` writes a ref during render.** `prevRef.current = lod` is a
  render-phase side effect. It is provably idempotent here (verified: no StrictMode band drift),
  so it is safe, but the strictly-canonical "previous value" pattern updates the ref in a
  `useEffect`. Optional cleanup; not blocking.
- **L2 — `e2e/types/axe-core-playwright.d.ts` is an interim ambient shim** added for typecheck
  before `@axe-core/playwright` landed. The real devDep is now installed and ships its own
  types; with `skipLibCheck: true` they coexist without error (typecheck passes). The shim is
  now redundant and could be removed to avoid drift, but it is harmless. Not blocking.
- **L3 — Lint gate is unrunnable in this repo (pre-existing).** `next lint` interactively
  prompts for ESLint setup because no `.eslintrc*`/`eslint.config.*` exists. This predates the
  change and is outside the plan's scope. Recommend a follow-up to add an ESLint config so the
  lint gate becomes enforceable, but it does not block this work.

## Conclusion

The implementation matches the plan precisely: the four missing workstreams (semantic-zoom LOD,
unit coverage, e2e extension, bundle budget) are delivered with surgical edits to existing
files, no rewrites, fixed node geometry, a single validated data boundary, and no disallowed
dependencies. Every runnable gate passes (typecheck, unit, coverage ≥80%, build, e2e 17/17).
The only blocked gate (lint) is a pre-existing repo configuration gap, not a regression.
