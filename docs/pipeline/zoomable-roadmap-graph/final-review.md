# Final Review — Zoomable roadmap graph (WC 2026)

**Stage 7, closing assessment.** Scope under review: the four narrow workstreams the plan
scoped (semantic-zoom LOD, unit coverage for the pure builder + LOD, an e2e extension, and a
bundle-budget check) layered onto an already-~90%-built feature. Every gate below was re-run by
this reviewer; results are observed, not inherited from prior stages.

## Observed final-state gates (re-run by this reviewer)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **PASS** (exit 0) |
| Unit | `npm run test` | **PASS** — 7 files, **52 tests** (32 new: build-graph 18, lod 14) |
| Coverage | `npm run test:coverage` | **PASS** — `build-graph.ts` **98.43%**, `lod.ts` **100%**, all-files **85.79%** (≥80%) |
| Build | `npm run build` | **PASS** (exit 0) — `/` First Load JS **104 kB** |
| E2E | `npm run test:e2e -- --project=chromium` | **PASS** — **17/17** in 10.4s |
| Lint | `npm run lint` | **BLOCKED (pre-existing)** — `next lint` prompts for ESLint setup; no `.eslintrc*`/`eslint.config.*` in repo |

This matches the stage-6 impl-review exactly; nothing regressed between stages.

## 1. Requirement satisfaction

The requirement doc (`requirements/zoomable-roadmap-graph.md`) is an idealized generic spec
(Vite + Dagre + a generic `RoadmapItem` DAG). The plan deviated deliberately and the
deviations were approved twice: the real app is Next.js 15 App Router + `@xyflow/react@12`
rendering the actual WC-2026 domain, with deterministic `computeBracketLayout`/`computeGroupGrid`
instead of Dagre. Judged against the **plan's acceptance criteria** (the authoritative spec),
delivery is complete:

- **Smooth, cursor-centered, clamped wheel zoom** — pre-existing (d3-zoom under React Flow),
  now *proven* by `wheel-zoom.spec.ts`: scale rises and clamps at `maxZoom=1.8`, falls and
  clamps at `minZoom=0.2`, and a plain (non-ctrl) wheel does not zoom under `panOnScroll`. All 3
  pass. This is the requirement's one hard ask and it is now under regression test.
- **Semantic-zoom LOD (the one real feature gap)** — delivered as designed: a pure
  `zoomToLod(zoom, prev?)` with a hysteresis gap (`LOD_ENTER` 0.45/0.85 vs `LOD_EXIT` 0.35/0.7),
  a `useZoomLevel` hook reading `s.transform[2]`, a `data-lod` attribute on the `.pitch-grid`
  wrapper, `data-lod-detail` hooks on `MatchNode`'s `<footer>` and `GroupTableNode`'s P/GD cells,
  and a compositor-only opacity transition behind the existing reduced-motion guard. Node
  geometry stays fixed (260×96 / 296×208) so React Flow never re-measures and edges don't drift.
- **Unit coverage** — `build-graph.test.ts` (18 tests) and `lod.test.ts` (14 tests), with both
  files newly added to `coverage.include`. Counts derive from the fixture
  (`parseTournament(buildMockTournament('2026-06-17T00:00:00Z'))`), never hardcoded — verified:
  the suite reads `tournament.groups.length` and `bracket.rounds.flatMap(r => r.nodes)`.
- **e2e extension** — wheel-zoom, visual/responsive at 320/768/1024/1440 (with `scrollWidth <=
  clientWidth` overflow guard), and a11y (axe smoke + keyboard focus + reduced-motion). All green.
- **Bundle budget (<300 kb gz)** — analyzer + axe added; `next.config.ts` analyzer gated on
  `ANALYZE=true` and lazy-loaded. Independently measured: `/` shell First Load JS = 104 kB;
  React Flow sits in the lazy `ssr:false` chunks (~54.5 kB gz combined). Realistic page total
  ~158 kB gz; even the naive sum of every emitted chunk is **295 kB gz** — under budget without
  the MiniMap-drop fallback.

**Honest gaps / partials:**

- **Lint is unenforceable** (see §4). Not introduced by this change, but it means the lint gate
  in the plan's AC #14 is *not actually green* — it's *unrunnable*. Stated plainly: one of the
  four named verify commands cannot pass in this repo's current configuration.
- **Coverage micro-gap:** `build-graph.ts` lines 58–59 (the `decided` branch of `edgeState`) are
  uncovered as a direct unit; the e2e/edge-state assertions exercise the live/decided/undecided
  states indirectly. 98.43% is comfortably over the 80% bar; this is a note, not a deficiency.
- Both deferrals are explicitly out of the plan's scope — nothing in-scope was skipped.

## 2. Tradeoffs

- **`data-lod` + CSS opacity over conditional node re-render.** The right call, and the central
  decision. The rejected alternative (remounting node sub-content on band change) would change
  measured node size, forcing React Flow to re-measure handles and risking edge drift. The chosen
  path keeps geometry fixed and is compositor-only. Cost: detail is always in the DOM (just faded),
  so there's no DOM-size win at low zoom — acceptable at <300 nodes and the correct correctness/
  simplicity trade.
- **Ref-write-during-render in `useZoomLevel`.** Optimized for a one-render, no-effect hysteresis
  read; sacrifices the strictly-canonical "update ref in `useEffect`" idiom. Proven idempotent
  across `[0.15, 1.85]` (no StrictMode band drift), so safe — but it's a deliberate shortcut, not
  the textbook pattern. Reasonable for a tiny pure mapping; flagged as LOW debt below.
- **Characterization tests over true TDD for `build-graph.ts`.** Because the builder already
  shipped and works, its tests are GREEN-on-arrival by design (correct per the brief). The trade
  is that the tests lock in *current* behavior rather than having driven it; they're a safety net,
  not a design record. Acceptable and intended.
- **Keeping the existing `panOnScroll` model.** Means wheel zoom requires ctrl/pinch, diverging
  from the requirement's "scroll wheel zooms by default" wording. Pre-existing canvas behavior,
  left intact deliberately; the e2e documents and tests the real path rather than changing UX.

## 3. Architecture & fit

Strong fit. The change is almost entirely *additive at the seams*: two new pure/near-pure files
(`lod.ts`, `useZoomLevel.ts`), two new test files, three new e2e specs, and **surgical** one-line
attribute/config edits to six existing files. No existing component was rewritten; the reuse
inventory was honored. The new code reuses the exact `graph-model.ts` types, the single
`parseTournament` validation boundary is preserved (no client re-parse — confirmed no `.parse()`
in `src/features` or `src/components`), and the LOD design follows the codebase's established
"pure transform + thin client hook" shape (`build-graph.ts` + `useRoadmapGraph` is the precedent).
CSS stays in the single `globals.css` source using live `@theme` tokens. No friction introduced.

## 4. Tech debt & risks

- **HIGH (pre-existing, not a regression): lint gate is unrunnable.** `next lint` interactively
  prompts for ESLint setup because the repo has no `.eslintrc*`/`eslint.config.*`. This predates
  the change and is outside the plan's scope, but it means there is no enforced static-analysis
  gate in CI. It should be fixed so the project has a real lint signal.
- **LOW: `useZoomLevel` writes a ref during render** (`prevRef.current = lod`). Proven idempotent;
  the canonical pattern moves this into `useEffect`. Cosmetic/hygiene.
- **LOW: redundant ambient shim** `e2e/types/axe-core-playwright.d.ts` remains after the real
  `@axe-core/playwright` devDep landed. Harmless under `skipLibCheck`; remove to avoid drift.
- **LOW: LOD thresholds are unverified by eye.** Bands (`detail`≈0.85, `titles`≈0.45) were chosen
  by reasoning, and the plan itself flags tuning "during visual regression." The visual snapshots
  are baselined but their *aesthetic* correctness (does detail fade at a pleasing zoom?) is a human
  judgment not captured by an assertion.
- **Security/perf posture (system level):** No new untrusted boundary — LOD operates on a numeric
  zoom from React Flow's own store. No secrets, no `dangerouslySetInnerHTML`, no new network path
  (45s poll unchanged). Perf is bounded by the <300-node scale and the lazy canvas split; the LOD
  transition is opacity-only. Nothing alarming at the system level.

## 5. Test & quality posture

- **Strong where it matters most.** The pure builder — the real engine of the feature — went from
  *untested and excluded from coverage* to **98.43%** with 18 behavior-named tests covering all
  three views, advance-edge derivation, handle routing, edge-state, feed edges, and immutability/
  purity (deep-frozen input). `lod.ts` is **100%** including both hysteresis directions. This is a
  genuine quality uplift, not box-ticking.
- **e2e is real and deterministic.** 17/17 on chromium. The two riskiest assertions from plan
  review are handled: the wheel-zoom spec uses the documented `ctrlKey` RF pinch path (with a
  source reference) plus a plain-wheel control test, and polls the transform to a stable read
  instead of arbitrary timeouts; the visual specs self-drive viewports and `test.skip` the mobile
  project to avoid double-run.
- **Thin spots:** the LOD *visual fade* is asserted only indirectly (axe + overflow + screenshots),
  not by a dedicated "detail opacity goes to 0 at overview zoom" assertion — the band logic is unit-
  tested but the CSS wiring's runtime effect leans on the baselined screenshots. The one uncovered
  `decided` branch (build-graph 58–59) is exercised only indirectly.
- **Confidence: high.** The change surface is small, additive, and well-fenced; all runnable gates
  are green; node geometry invariants are double-guarded (build-graph width/height asserts + visual
  regression).

## 6. Follow-ups (prioritized)

**Must-do (before this is "done done" at the project level):**
1. **Add an ESLint config** (`eslint.config.*` with `eslint-config-next`, already a devDep) so
   `npm run lint` is non-interactive and enforceable. This is the only gate not green; it's a
   project-health blocker even though it predates this change.

**Nice-to-have:**
2. Add one direct unit covering the `decided` `edgeState` branch (build-graph 58–59) to close the
   coverage micro-gap and make the intent explicit.
3. Add a focused e2e/visual assertion that `[data-lod-detail]` computed `opacity` is `0` at an
   overview zoom and `1` at detail zoom, so the LOD wiring (not just the band math) is regression-
   guarded directly.
4. Move the `prevRef` write in `useZoomLevel` into a `useEffect` for idiomatic cleanliness.
5. Remove the now-redundant `e2e/types/axe-core-playwright.d.ts` shim.
6. Eyeball and, if needed, tune the LOD thresholds during a real interactive pass (the plan
   anticipated this as a non-gating tuning step).

## Verdict

**SHIP WITH CAVEATS.**

The scoped work is complete and every runnable gate is green (typecheck, 52/52 unit, coverage
≥80% with the two new pure files at 98–100%, build, 17/17 e2e). The feature satisfies the
authoritative plan; the implementation is surgical, additive, well-tested, and architecturally
consistent. Caveats, none of which block shipping this change:

- **C1 (project-level):** the `lint` gate is unenforceable (pre-existing missing ESLint config).
  Add a config as the top follow-up. It is not a regression from this work, but it means one of
  the four verify commands cannot pass today.
- **C2 (minor):** the LOD's runtime fade is regression-guarded only indirectly (band math is unit-
  tested; the CSS effect leans on baselined screenshots). Add a direct opacity assertion (follow-up #3).
- **C3 (cosmetic):** ref-write-during-render in `useZoomLevel` and a redundant axe type shim —
  both harmless, both trivial cleanups.
