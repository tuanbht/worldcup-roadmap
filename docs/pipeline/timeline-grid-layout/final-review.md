# Final Review — Timeline-grid layout

**Stage 7 (closing assessment).** Reviewer: Final Reviewer. Date: 2026-06-18.
**Implementation gate (stage 6):** APPROVED — no CRITICAL/HIGH.
**This review:** strategic, whole-effort. Verdict at the bottom.

---

## Observed gate results (re-run, not inherited)

| Gate | Command | Observed result |
|------|---------|-----------------|
| Unit/integration suite | `npm run test` | **PASS** — 18 files, **153 tests passed**, ~2.6s |
| Type check | `npm run typecheck` (`tsc --noEmit`) | **PASS** — exit 0 |
| Production build | `npm run build` (vite) | **PASS** — built in ~1s; `RoadmapCanvas` chunk 255.67 kB / **gzip 82.69 kB**, main `index` 226.88 kB / gzip 71.04 kB |
| E2E smoke | `npx playwright test e2e/timeline-grid.spec.ts --project=chromium` | **PASS** — 1 passed (~1.1s) |
| Console-statement scan | `grep console.{log,debug,info}` over `src/`+`server/` (excl. tests) | **clean** — none |

I also **independently re-derived the graph** from the mock fixture (not via the project's own
specs) and confirmed:

- 130 nodes = **104 match** (72 group + 32 bracket) + **14 day-marker** + **12 group-header**;
  **0** positioned `group` table nodes.
- **56 edges**, **every** edge `sourceHandle:'b'`/`targetHandle:'t'`, **every** edge strictly
  downward (`target.y > source.y`), **no duplicate node id, no duplicate edge id**.
- Final at `x = 3816 = CX`, `y = 2696 = max match Y` → center-bottom, exactly as specified.

The final state is genuinely green; the stage-6 numbers reproduce.

---

## 1. Requirement satisfaction

Delivered in full against the authoritative `timeline-grid-layout.md`. Every acceptance criterion
maps to working code and a passing assertion:

- **One node per match, shared day axis.** `computeDayIndex` collapses all match kickoffs to distinct
  UTC calendar days, sorts ascending, and drives `y = HEADER_H + dayIndex * DAY_ROW_PITCH` for *every*
  node — group and knockout on one continuous rail. ✔
- **Group zone = fixed A..L columns.** `computeGroupGridLayout` places each group match at
  `(RAIL_W + colIndex*GROUP_COL_PITCH, day-row)`. Any `(group, day)` cell with two matches splits to
  `x ± SLOT/2`, ordered by kickoff then matchId. The implementation correctly handles the plan's
  **H1** insight that in the mock *every* matchday is same-day-paired, not just MD3 — the rule is
  generic (`placeColumnMatches` buckets by day and pairs whatever it finds), not MD3-special-cased. ✔
- **Knockout = center-converging funnel.** `computeKnockoutFunnelLayout` uses d3-hierarchy rooted at
  the Final over the real `winnerOf` topology; each parent x is the midpoint of its two children;
  leaves are re-centered so the mean sits on `CX`. Y is each match's real day-row, so `parent.y >
  child.y` always. Final lands at `CX`/max-Y; THIRD_PLACE x-adjacent at its own earlier day-row. ✔
- **Guides + edges.** One `day-marker` per distinct day on the left rail; one `group-header` per group
  across the top; feeder edges `group-header-<name>` → seeded R32; downward advance edges; all
  `b`→`t`, zero left/right handles. ✔
- **Standings moved out of the grid** into an on-demand `StandingsOverlay` (`role="dialog"`, Esc +
  click-out + focus management). The matrix stays match-centric. ✔
- **MatchNode reused unchanged** (108px, t/b handles, "Group A · MD1" label, `data-final`) — verified
  by the untouched `MatchNode.test.tsx`. ✔
- **Topology sourced from the existing `buildBracket` `winnerOf` map**, not invented FIFA adjacency —
  exactly as mandated until `fifa-regulation-accurate-bracket` lands (which is correctly *not*
  invented). ✔

**Nothing partial or silently deferred.** The one documented gap is environmental, not functional:
the webkit/mobile Playwright projects cannot run in-sandbox (missing browser binary). The chromium
project passes and the spec documents the caveat. This is honest and acceptable for a sandbox; CI with
`npx playwright install` closes it.

**TDD honesty.** The three superseded Phase-3 specs (`build-graph`, `bracket-layout`, `group-layout`)
were genuinely rewritten to the new spec — fixture-derived counts (72/32/14/12), relations not magic
absolutes, graph built inside each test. The "stay-green" domain/datetime/derive-matchdays/MatchNode/
panel/server/LOD/query specs are untouched and pass. No gate was skipped or weakened to go green.

---

## 2. Tradeoffs

1. **Y = real day-row, not bracket-tree depth (round smear accepted).** The most consequential
   decision. d3-hierarchy is used *only* for the X midpoint fan-in; Y comes from the shared day axis.
   This makes the timeline truthful (a round legitimately spans several day-rows) at the cost of the
   tidy "one row per round" bracket look. The requirement explicitly accepts smear and the funnel
   still reads because X narrows monotonically per round. **Right call** — it is the whole point of the
   re-layout, and the alternative (tree-depth Y) would have broken the single continuous timeline.

2. **`dayKey` derived locally in `day-axis.ts`, not in `lib/datetime.ts`.** `formatDate` returns
   `'dd MMM'` ("11 Jun"), which is *not* lexically sortable, and `datetime.ts` is on the do-not-touch +
   coverage-included list. Putting a real UTC `'yyyy-MM-dd'` key (`date-fns-tz/formatInTimeZone`) in
   the covered, tested `day-axis.ts` keeps `datetime.ts` pristine and the key correctly sortable across
   timezone offsets. `formatDate` is reused only for the human rail label. **Right call** — avoids both
   a wrong sort and a constraint violation.

3. **Standings as a modal overlay vs. an inline expandable header.** The overlay is a larger surface
   change but preserves the "matrix stays match-centric" property the requirement asked for; an inline
   panel would have been smaller but reintroduced table chrome into the grid. **Reasonable** — matches
   the stated intent. The cost is one more interactive surface to keep accessible (see §4 L1).

4. **Layout takes the full `Tournament`, not just `Bracket`.** Necessary because KO node Y must come
   from each match's *real* kickoff, and `BracketNode` carries no kickoff. Slightly widens the function
   input but keeps both passes pure and O(n) with a single shared `dayIndex`. **Correct and unavoidable.**

---

## 3. Architecture & fit

The change fits the codebase's grain rather than fighting it.

- **Clean pipeline preserved:** domain (`build-bracket`, `derive-matchdays`, `standings`) → pure layout
  passes (`day-axis` / `group-layout` / `bracket-layout`) → immutable `buildRoadmapGraph` → React Flow
  view. The new `day-axis.ts` slots in as a first-class layout primitive; the rewritten group/bracket
  passes keep the same shape (pure function, `ReadonlyMap` output) the codebase already used.
- **Domain logic was not library-ized** and `buildBracket` topology is reused as-is — exactly the
  instruction. No domain types were forked.
- **MatchNode reuse is real**, not cosmetic: the build-graph flattener feeds the existing card view
  model unchanged, and the existing component test is the contract guard.
- **File hygiene:** all in-scope files are small and focused (largest, `build-graph.ts`, is 208 lines;
  layout modules 36–102 lines). High cohesion, single responsibility per file. Constants are documented
  as tuning-not-contract, with the `CX`/`centerline(12)` single-source-of-truth pinned in a spec.
- **Friction introduced:** minimal. `useFocusCamera` was correctly rewritten so "Groups" frames
  `group-header` + group `match` nodes (a guaranteed non-empty subset) after the `group` table nodes
  were removed — the stage-2 H2 risk was addressed, not left dangling.

No inconsistency or architectural smell. This is additive, idiomatic, and reversible.

---

## 4. Tech debt & risks

Low overall. No CRITICAL/HIGH debt; the items below are MEDIUM/LOW and mostly pre-existing or cosmetic.

- **M1 — No ESLint gate (pre-existing).** `package.json` has `format`/`format:check` but no `lint`
  script, while the web ruleset assumes an ESLint entrypoint. Not introduced by this change; source is
  Prettier-clean and type-clean. Worth adding a project-local ESLint gate as a follow-up, but it does
  not block this change.
- **L1 — `StandingsOverlay` backdrop is a clickable `<div>`** (`StandingsOverlay.tsx:40`). Click-out is
  wired on a non-interactive element. **Mitigated:** a real `<button aria-label="Close standings">`
  receives focus on open, Esc closes (capture-phase, `stopPropagation` so it doesn't also clear the
  match selection), and `role="dialog"`/`aria-modal` are set. Keyboard users are not blocked; this is a
  strictness nit, not an a11y defect.
- **L2 — Return-type intent.** `RoadmapGraph.nodes/edges` are built as mutable locals then returned;
  purity is proven by the frozen-input test, so this is cosmetic. `ReadonlyArray` at the boundary would
  tighten intent.
- **L3 — webkit/mobile e2e unrun in-sandbox** (missing binary). Chromium passes; run
  `npx playwright install` in CI to exercise all projects and the visual-regression snapshots.
- **Scale/edge posture:** the canvas is tall (~14 day-rows here, ~30–35 for a full tournament) but
  still <300 DOM nodes, so React Flow is comfortable; pan/zoom + `fitView` carry it. Layout is pure and
  O(n) — re-derivation is cheap and memoized. **Documented future edge:** if a live provider omits
  later-round matches, `buildBracket` emits synthetic ids with no kickoff; the code falls back to
  `HEADER_H`/Final-row Y (`bracket-layout.ts:76,85`; `build-graph.ts:200`). The mock has all 32 KO
  matches real, so this path is unexercised — a real-data follow-up, called out honestly in the plan
  (Q3), not a hidden assumption.
- **Security/perf at system level:** no new network, secrets, user-input, or query surface; this is a
  pure presentational re-layout. No injection/XSS/auth surface touched. Bundle stays within reason
  (RoadmapCanvas gzip 82.69 kB — above the 30kb *landing* CSS/80kb *microsite* budgets in the ruleset,
  but this is an interactive app page, not a microsite; no regression introduced here).

---

## 5. Test & quality posture

**Confidence: high** for the geometry/transform core; **medium** for cross-browser visual fidelity
(env-limited, not code-limited).

**Strong where it counts.** The pure layer — `day-axis`, `group-layout`, `bracket-layout`,
`build-graph` — is the high-risk surface and it is the most heavily and honestly tested:

- Coverage (stage-6 observed, in `coverage.include` scope): `build-graph.ts` 98.62%, `bracket-layout.ts`
  100%, `day-axis.ts` 100%, `group-layout.ts` 92.98%, `layout-constants.ts` 100% — all well above 80%.
- Tests assert **relations** (chronological rows, fixed columns, midpoint fan-in, monotone per-round
  narrowing, no adjacent-column overlap on any row, Final ≈ CX/max-Y), so they will catch real
  regressions without being brittle to constant tuning.
- The two new node components have jsdom specs (`DayMarkerNode`, `GroupHeaderNode`: label render, handle
  presence/absence, click callback). `MatchNode.test.tsx` is the reuse contract guard.

**Thin spots (acknowledged, acceptable):**

- `src/components/**` (the two node components, `StandingsOverlay`, `RoadmapCanvas` wiring) is *outside*
  `coverage.include` by existing config, so those lines are not counted toward 80%. The plan made this
  explicit (supplemental jsdom + E2E coverage) rather than quietly widening the gate — an honest scoping
  decision, but it does mean overlay/canvas-wiring behavior leans on the e2e smoke for confidence.
- Visual regression + a11y e2e (`visual.spec.ts`, `a11y.spec.ts`) and webkit/mobile projects did not run
  in-sandbox. The tall-canvas first-frame/`fitView` framing and both-theme visual fidelity are therefore
  verified by reasoning + chromium, not by a green visual-regression run here. CI must run them.

---

## 6. Follow-ups (prioritized)

**Must-do (before relying on this in CI / live data):**
1. **Run the full Playwright matrix in CI** (`npx playwright install` → chromium + mobile/webkit +
   `visual.spec.ts` + `a11y.spec.ts`). This is the only meaningful unverified surface; it gates
   cross-browser scrolling/zoom, the tall-canvas first frame, and both-theme visuals.
2. **Decide the synthetic-KO-id behavior for live data.** When a provider omits later rounds,
   KO nodes currently fall back to `HEADER_H` Y (top of canvas) — visually wrong. Either skip the node,
   or assign a stage-ordered placeholder day. Add a test once `fifa-regulation-accurate-bracket` or a
   partial-bracket fixture exists.

**Nice-to-have:**
3. **Add a project-local ESLint gate** (`lint` script) to match the web ruleset; source is already
   clean so this is low-friction and catches future drift.
4. **Tighten `StandingsOverlay` backdrop strictness** (L1): make the scrim a `<button>` or mark it
   `aria-hidden`, so click-out has a keyboard-equivalent semantics rather than a click handler on a
   `<div>`.
5. **Return `ReadonlyArray` from `buildRoadmapGraph`** (L2) to make the immutable-output intent
   type-enforced rather than test-enforced.
6. **Consider widening `coverage.include`** to the new presentational components if component coverage
   should count toward the 80% gate (currently supplemental by design).

---

## Verdict

**SHIP WITH CAVEATS**

The implementation realizes the authoritative requirement faithfully and completely; all three local
gates (test/typecheck/build) plus the chromium e2e smoke are green, and the acceptance facts reproduce
under independent re-derivation. The architecture fits the codebase, the layout is pure and O(n), the
transform is immutable, and the TDD rewrite is honest. No CRITICAL or HIGH issues. It is shippable.

Caveats (none blocking, but track them):
- **C1 — Cross-browser/visual/a11y e2e is unverified in-sandbox** (webkit/mobile binaries absent; visual
  + a11y specs not run). Confidence on those surfaces rests on chromium + reasoning. **Run the full
  Playwright matrix in CI before tagging a release.**
- **C2 — Live/partial-bracket data is unexercised.** Synthetic KO ids with no kickoff fall back to the
  canvas top; fine for the mock (all KO matches real), but resolve before pointing this at a real
  provider.
- **C3 — Presentational components + standings overlay are outside the coverage gate** (supplemental
  coverage only) and the overlay backdrop has a minor a11y-strictness nit (L1).
