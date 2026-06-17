# Plan Review: Per-match nodes + phase-specific orientation (Revision #2)

## Summary

This second-revision plan is strong and clears the bar. Every prior HIGH/MEDIUM/LOW item from the
first review (H1, H2, M1–M4, L1–L3) is addressed explicitly and the resolutions hold up against the
actual code:

- **H1 (no runnable env for the DOM component test):** resolved by taking Option (b) — assert the
  handle-id contract through `buildRoadmapGraph` output, push the rendered-handle/label check into
  the Playwright smoke, and restate ≥80% coverage against the `coverage.include`-scoped
  `layout/**` + `build-graph.ts` modules only. Verified: `vitest.config.ts` is `environment: 'node'`,
  `include: ['src/**/*.test.ts']` (no `.tsx`), `coverage.include` is exactly those modules, and
  `package.json` has no Testing Library/jsdom. The plan no longer promises an unrunnable test.
- **H2 (d3 data model + midpoint ordering):** resolved correctly. The plan now switches on
  `slot.source.kind` (`bracket.ts` confirms `SlotSource` is a discriminated union with no bare
  `matchId`), enumerates children in `[home, away]` = `slot*2`/`slot*2+1` order (matches
  `build-bracket.ts:94-97`), and explains why that makes `d3.tree`'s parent-x coincide with the
  *structural* midpoint. This reasoning is sound: a 16→8→4→2→1 bracket is a balanced binary tree,
  where Reingold-Tilford with uniform `nodeSize` places each parent exactly at its two children's
  midpoint.
- **M1–M4, L1–L3:** all folded in (THIRD_PLACE placed after x-normalization and excluded from the
  midpoint assertion; wholesale test-file replacement with the deleted-symbol/`tsc` note;
  `computeGroupGrid` deletion confirmed safe; keyboard descoped to fit-padding only; smoke uses
  ctrl+wheel via the existing `ctrlWheel` helper; Tailwind-on-component for the label; no schema
  change since domain `Match` already carries the fields; `data-final` selector confirmed valid).

The plan satisfies all of the requirement's acceptance criteria, uses `d3-hierarchy` per the
library-first policy (with a justified hand-rolled fallback), migrates handles to top/bottom in
lock-step across `MatchNode` + `handlesFor` + `GroupTableNode`, and derives all counts from the
fixture (72 group matches = 12 × 3 × 2, confirmed in `build-mock-tournament.ts`).

No CRITICAL or HIGH issues remain. A few MEDIUM/LOW refinements would save implementer churn but
none block. **Approved.**

---

## Findings

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM

**M1. `matchData()` has no described construction path for a group-stage match.**
`matchData(node: BracketNode, match)` derives `matchId`, `stage`, `roundLabel`, `isFinal`,
`isThirdPlace` from a `BracketNode`. Group-stage matches have **no** bracket node, yet the plan emits
one `match` node per group match (Scope; Acceptance #1). The plan's `matchData()` section (plan
lines 143–148) only adds `group`/`matchday` to the two existing *bracket-keyed* branches and never
specifies how a bare `Match` becomes `MatchNodeData`. Fix in the plan: add a `groupMatchData(match)`
helper (or refactor `matchData` to source stage/label/flags from the `Match` when no node is given),
with `roundLabel = STAGE_LABELS['GROUP_STAGE']` and `isFinal/isThirdPlace = false`. Acceptance test
#16 forces this, but it should be named so the implementer doesn't improvise the contract.

**M2. The Playwright smoke must defeat `onlyRenderVisibleElements` to make both nodes "reachable in
the DOM."** The canvas sets `onlyRenderVisibleElements` (`RoadmapCanvas.tsx:90`) and `panOnScroll`
(`:93`). The new canvas is very wide (a lane ≈ table 296px + 6 × ~316px) and tall (group band +
SECTION_GAP + 5 KO stages), so after a ctrl+wheel zoom-in a group match node and the Final are
unlikely to co-occupy the viewport — and an off-screen node is **not in the DOM** here. Behavior #18
says both are "reachable in the DOM" but doesn't say how. Specify the approach (e.g. assert at the
fit/overview zoom where both still render, or drive `setCenter`/focus to each in turn), and make this
the place that explicitly asserts the top/bottom handle sides + the "Group · MD" label — since that
is the only coverage of the handle/label rename (the components are outside `coverage.include`).

**M3. Feeder edges leave the group *table* node, not the last group match — confirm the visual
"flow."** The plan keeps feeders `group-{name}` (table) → R32, which satisfies the requirement
literally. But with 72 new group-match cards trailing rightward from each table, the band only
"flows into" the KO if the table-anchored feeder reads correctly alongside the lane of match cards.
This is a design/visual decision, not a contract break; flag it for the visual baseline review so
the screenshots are blessed deliberately.

### LOW

**L1. Make the `?view=` → default-focus fallback sweep explicit across all four e2e specs.**
Beyond the `view=groups` toggle assertion (`roadmap.spec.ts:23`), every `page.goto('/?view=bracket')`
(`visual.spec.ts:59,74`, `wheel-zoom.spec.ts:71`, `a11y.spec.ts:45,57,70`, `roadmap.spec.ts:14,21`)
becomes a no-op once the enum changes, silently resolving to default `'all'`. Harmless, but list the
goto-URL updates so none are missed and baselines shift predictably. The plan already flags baseline
regeneration.

**L2. "reuses the existing `data-lod-detail` hook" is a mild mischaracterization.** `data-lod-detail`
is a plain attribute the CSS keys on (`globals.css:109–116`), faded via the `[data-lod]` band on the
`.pitch-grid` wrapper — there is no hook. Decide deliberately whether the "Group A · MD1" label is
detail-tier (hidden at overview/titles) or title-tier identity (always shown). A group-identifying
label likely wants to stay visible; pick intentionally rather than by copy-paste.

**L3. Confirm THIRD_PLACE's `finalX + LEAF_PITCH_X` offset doesn't visually clash with the SF
column.** Pure tuning; the tests assert the *relation* (`x == finalX + LEAF_PITCH_X`), so layout and
test stay self-consistent regardless — just eyeball it in the visual pass.

---

## Checklist verdict

- **Completeness:** All requirement acceptance criteria covered. One construction detail
  (group-match → `MatchNodeData`) unstated (M1).
- **Feasibility:** Every cited symbol/line verified against the live code; all accurate. Approach realistic.
- **Architecture:** Pure layout helpers, single immutable `buildRoadmapGraph`, lock-step handle
  migration, focus-enum replaces layout-swap. No needless coupling or scope creep.
- **Reuse:** Adopts `d3-hierarchy` per library-first; domain logic stays hand-rolled per Non-goals;
  fallback justified.
- **Test strategy:** RED/GREEN-able, fixture-derived counts, ≥80% on scoped modules. Component-render
  coverage rests on the smoke — tighten it (M2).
- **Non-functionals:** No security surface (pure transform, no user input/secrets). Perf budget met
  (~116 nodes < 300). A11y/visual deferred to e2e baselines.
- **Risks:** Real risks (handle detach, signature ripple, enum removal across 6 files, baseline
  regen, width/height growth, d3 install/SSR) named with mitigations.

---

## Verdict

VERDICT: APPROVED
