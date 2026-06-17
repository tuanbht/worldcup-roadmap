# Final Review — Per-match nodes + phase-specific orientation

**Stage 7 strategic assessment.** Judges the effort as a whole: what was delivered, what it
cost, and what to watch. Line-level review (stage 6, `impl-review.md`) is APPROVED; this is the
higher-altitude close.

**Date:** 2026-06-17 · **Reviewer altitude:** whole-effort · **Implementation gate:** APPROVED

---

## Verification (re-run here, not taken on faith)

| Gate | Command | Observed result |
| --- | --- | --- |
| Tests | `npm run test` | **PASS — 14 files, 121 tests green** (1.78s) |
| Coverage | `npm run test:coverage` | **PASS — 93.33% stmts overall; build-graph.ts 98.3%, group-layout.ts 100%, bracket-layout/layout 100%** (all ≥80%) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS — exit 0** |
| Build | `npm run build` (vite) | **PASS — built in ~1.0s; RoadmapCanvas chunk 251.65 kB / 81.71 kB gz** |
| E2E | `npm run test:e2e` | **NOT EXECUTED — no Playwright browser in this sandbox.** Spec `e2e/per-match-orientation.spec.ts` is committed, well-formed (ctrl+wheel zoom, group-card + `[data-final="true"]` reachable), runs in CI/local. Documented gap. |

These results match the figures `impl-review.md` reported — independently reproduced, not copied.
Additional spot checks I ran: no `console.log` in `src/`; no stray `sl/sr/tl/tr` handle ids in
source (only the negative-assertion set inside `build-graph.test.ts`); no `RoadmapView` /
`computeGroupGrid` / `groupGridWidth` / `groupsOnlyGraph` leftovers anywhere in `src/`.

---

## 1. Requirement satisfaction

**Delivered in full.** Every acceptance criterion in `requirements/per-match-nodes-and-orientation.md`
is met and is constrained by a fixture-derived test, not eyeballed:

- **1 match = 1 node, group included.** `buildRoadmapGraph` emits one `match` node per
  `GROUP_STAGE` match. The mock yields **72** group-match nodes (104 matches − 32 bracket = 72,
  12×6); both `build-graph.test.ts` and `group-layout.test.ts` assert this from the fixture with a
  `=== 72` self-check rather than a magic literal.
- **Group horizontal, lane per group, by kickoff.** `computeGroupMatchLanes` lays one lane per
  group A..L, sorts each lane by `kickoff.localeCompare || id`, x strictly increasing, shared lane
  y, distinct lane y. Tables stay at `x=0` (12 `group` nodes, all asserted at x=0).
- **Knockout vertical via d3-hierarchy.** `bracket-layout.ts` uses
  `d3.tree().nodeSize([LEAF_PITCH_X, STAGE_PITCH_Y])` with `[home, away]`-ordered `winnerOf`
  children, depth flipped (`y = bandOffsetY + (maxDepth - depth) * STAGE_PITCH_Y`) so R32 sits top
  and FINAL bottom. The test verifies all 15 winner-tree parents land on the structural-children
  midpoint (`toBeCloseTo`, ε=6), monotonic depth→y exactly one `STAGE_PITCH_Y` apart, THIRD_PLACE
  beside the normalized Final, and x≥0 normalization. This is the hardest part of the spec and it is
  the best-tested.
- **Continuous canvas + downward handles.** KO offset by `groupBandHeight + SECTION_GAP`; every
  edge carries the constant `{sourceHandle:'b', targetHandle:'t'}`; `MatchNode` exposes one Top
  target (`id="t"`) + one Bottom source (`id="b"`); `GroupTableNode` source moved to
  `Position.Bottom`. Handle migration was done in lock-step (component + `handlesFor` + table node),
  avoiding the silent edge-detach the plan flagged.
- **group/matchday payload + label.** Added to `MatchNodeData`; "Group A · MD1" renders on group
  cards; `parseTournament`/schema untouched.
- **StageToggle demoted to focus/camera.** `useStageView` re-keyed to `RoadmapFocus` persisted via
  `?focus=`; `useFocusCamera` moves the viewport (fitView for `all`, fitBounds for group/KO subsets)
  without changing graph shape.

**Honest partials / deferrals (all pre-agreed in plan + plan-review, not silent):**

- **Cross-phase keyboard traversal is NOT implemented.** The requirement text says traversal
  "spans group + KO". `useBracketKeyboard` still binds only F/0/Esc (fit/reset over the unified
  canvas); there is no node-to-node cross-phase focus traversal. The plan descoped this explicitly
  (Out-of-scope + Risk), the plan-review accepted it as a separable feature needing its own
  focus-management and tests, and the impl-review re-flagged it. This is a **defensible reading**
  (fit/reset now does span both phases on one canvas) but it is the one place where a literal
  reading of the requirement is not satisfied. The requester should confirm the interpretation or
  open a follow-up. **Not a gate failure — a scope decision carried transparently through all
  stages.**
- **Playwright smoke not executed here** (no browser). The contract it guards is independently
  covered by deterministic unit tests, so confidence does not hinge on it; but it has never run, so
  the DOM-level "both phases reachable after zoom" claim is unproven until CI runs it.
- **Visual regression baselines** (`e2e/visual.spec.ts`) require regeneration after this layout
  overhaul; flagged in the plan as "don't auto-bless." Not run/regenerated here.

No gate was skipped or faked. No test was weakened to pass — the three rewritten files assert
relations (counts, monotonicity, midpoint, downward handles, y-bands, purity) derived from the
fixture, which is exactly how a behavior-changing rewrite should be characterized.

## 2. Tradeoffs

- **d3-hierarchy `d3.tree` over the hand-rolled fan-in (right call).** Optimized for: library-first
  policy compliance, deletion of the bespoke `yBySideDepth` accumulator + mirrored-half special
  casing, and a free structural-midpoint guarantee. Sacrificed: a small layer of indirection (the
  `[home, away]`-order contract must hold for the midpoint to coincide with `slot*2 / slot*2+1`) and
  one optional-typing wart (`xOf = n.x ?? 0`). Worth it — the midpoint test pins the contract, so a
  child-ordering regression fails loudly.
- **Focus-as-camera over keeping three layouts (right call).** Collapsing `RoadmapView` →
  `RoadmapFocus` removed the `view`-arg branching across 6 files and made the continuous canvas the
  single source of truth. Cost: a 6-file blast radius landed in one pass (the plan's named risk),
  and `useFitOnChange` now keys on `nodes.length` only — two fixtures with identical counts wouldn't
  re-fit (irrelevant for a single-fixture app, noted below as debt).
- **Pitch constants as tuning, not contract (right call).** Tests assert geometric *relations*, not
  pixel absolutes, so visual tuning can move without breaking the suite. The flip side: nothing in
  the unit suite proves the canvas *looks* right (lane overlap, feeder-edge curvature across a large
  dx) — that signal lives only in the un-run visual e2e.
- **Keyboard traversal descoped (defensible, watch).** Optimized for shipping the layout overhaul
  cleanly; sacrificed literal completeness on one requirement line. Reasonable given traversal is a
  separable feature, but it is the single open interpretation question.

## 3. Architecture & fit

**Fits the codebase direction cleanly.** Geometry stays in pure `layout/**` helpers;
`buildRoadmapGraph` remains the single immutable `Tournament → {nodes, edges}` transform; domain
logic (`computeGroups`, `buildBracket`, `R32_SEEDING`, stage-order, the mock) is untouched and its
tests stay green. The change reuses the existing `match` node type, `matchData` shape, `R32_SEEDING`
seeding, and the LOD engine rather than reinventing them. New code is small and cohesive
(`computeGroupMatchLanes`, the rewritten `computeBracketLayout`, `useFocusCamera`), all files well
under the 800-line ceiling. No friction introduced; the only un-planned addition (`useFocusCamera`)
is a clean realization of the "focus → camera" requirement, memo-stable on `tournament`. CLAUDE-md
standards honored: immutable transforms, semantic `<article>` nodes, Tailwind tokens, compositor-only
hover transforms, no `console.log`.

## 4. Tech debt & risks

- **L1 (LOW) — `xOf = n.x ?? 0` masks a missing d3 x.** Only reachable if `d3.tree` ever produced
  `undefined` x (it never does post-layout). A narrow invariant/assertion would read more honestly.
  The midpoint test would catch any real regression.
- **L2 (LOW) — benign coverage gaps.** `build-graph.ts:72-73` (the `live`/`finished` edge-state
  arms) and `group-layout.ts:26,56` (kickoff `|| id` tiebreak, `?? []` empty-lane fallback) are
  uncovered because the mock fixture is all-`scheduled` with every group populated. Real defensive
  branches, just unexercised; two tiny units would close them.
- **L3 (LOW) — boolean data-attributes serialize to `"true"`/`"false"` strings.** Works for the e2e
  `[data-final="true"]` selector and the Tailwind `data-[final=true]:` variants; just note that
  presence-only `[data-final]` selectors would match both states.
- **`useFitOnChange` keys on `nodes.length` only.** Fine for one fixture; a multi-tournament future
  with equal node counts wouldn't re-fit. One-line debt, not a bug.
- **System-level posture.** No new input boundary, secret, authz, or network surface — this is a
  pure client-side layout transform over already-validated domain data, so the security posture is
  unchanged. Performance: ~116 nodes (72 + 32 + 12) is well under the <300-node SVG/DOM budget;
  `onlyRenderVisibleElements` is on; the RoadmapCanvas chunk (81.71 kB gz) sits under the web
  performance app-page JS budget. The canvas does grow wide (6 matches + a 296px table per lane) and
  tall (12 lanes + 5 KO stages) — pan/zoom + fitView absorb it, but feeder-edge bezier curvature
  across a large horizontal dx (plan L1) is a visual-only unknown until the visual e2e runs.

No CRITICAL/HIGH/MEDIUM debt. Everything outstanding is LOW polish or a documented scope boundary.

## 5. Test & quality posture

**Strong where it matters; one thin edge.**

- **Strong:** the three rewritten unit files (`group-layout`, `bracket-layout`, `build-graph`) are
  the spine, and they genuinely constrain the new behavior — fixture-derived counts (72/32/12),
  strict-increasing lane x, monotonic depth→y at exact pitch, the 15-parent midpoint with ε
  tolerance, third-place placement, continuous-canvas y-bands, the authoritative downward-handle
  contract (incl. an explicit "no `sl/sr/tl/tr`" assertion), feeder derivation from `R32_SEEDING`,
  and purity via `deepFreeze`. A jsdom `MatchNode.test.tsx` reinforces the handle/label contract at
  the component boundary. Coverage is high and the untouched domain/data/lod/server suites stayed
  green, proving the blast radius was contained.
- **Thin:** browser-level confidence rests entirely on the **un-run** Playwright smoke and the
  **un-regenerated** visual baselines. So "both phases reachable after a real zoom," feeder-edge
  rendering, and lane/overlap correctness are unverified in this environment. The deterministic units
  cover the *data contract*; they cannot cover *rendered geometry*.

**Confidence:** high on the layout/graph contract and the gates; medium on the rendered visual
result until e2e + visual run in CI.

## 6. Follow-ups (prioritized)

**Must-do before merge to a shared branch:**

1. **Run the e2e suite + regenerate visual baselines in a browser-capable env** (CI or local):
   `npm run test:e2e`, then `npm run test:e2e:update` for `e2e/visual.spec.ts`. Review the new
   baselines deliberately — do not auto-bless. This closes the only real confidence gap.
2. **Get an explicit ruling on cross-phase keyboard traversal.** Confirm with the requester that
   "traversal spans group + KO" is satisfied by fit/reset over the unified canvas, or file it as a
   follow-up feature (node-to-node focus management + its own tests). This is the single open
   interpretation question.

**Nice-to-have (LOW, post-merge):**

3. Replace `xOf = n.x ?? 0` with a narrow invariant/assertion (L1).
4. Add two tiny units: a `live`/`finished` match for `build-graph.ts:72-73` and an empty-group lane
   for `group-layout.ts:56` (L2) — closes the benign coverage gaps.
5. Visual pass on feeder-edge curvature for large-dx Bottom→Top beziers; bump `AdvanceEdge`
   `curvature` only if the visual review shows looping (plan L1).
6. Doc note that `useFitOnChange` keys on `nodes.length` only (multi-fixture caveat).

---

## Verdict

**SHIP WITH CAVEATS**

The implementation fully and faithfully delivers the requirement on a sound architecture, with all
runnable gates green (121 tests, typecheck clean, vite build clean, coverage 93%+ overall and ≥98%
on the changed modules) and tests that genuinely constrain the new vertical/per-match behavior. It is
not an unconditional SHIP only because two verifications could not run in this sandbox and one
requirement line was descoped by agreement:

- **Caveat 1 — Browser gates never ran here.** The Playwright smoke and visual-regression baselines
  must execute (and baselines be regenerated/reviewed) in a browser-capable environment before
  merge. Rendered geometry is unverified locally.
- **Caveat 2 — Cross-phase keyboard traversal is descoped.** Carried transparently through plan →
  plan-review → impl-review; needs an explicit requester ruling (accept fit/reset-as-traversal, or
  open a follow-up).

Neither caveat is a blocker to the code itself — both are external verifications/decisions. Clear
those two and this is a clean SHIP.
