# Plan Review — Timeline-grid layout

**Reviewer:** Plan Reviewer (stage 2)
**Date:** 2026-06-18
**Plan:** `docs/pipeline/timeline-grid-layout/plan.md`
**Requirement:** `requirements/timeline-grid-layout.md`

## Summary

This is a strong, codebase-grounded plan. It correctly understands the supersession (keep "1 node per
match"; replace lane/vertical-bracket positioning with the timeline grid), reuses `MatchNode` unchanged,
keeps the d3-hierarchy fan-in for X while driving Y from a shared `dayIndex`, and proposes a clean file
decomposition (`day-axis.ts`, rewritten `group-layout.ts` / `bracket-layout.ts` / `build-graph.ts`).
Counts are verified against the real fixture: 72 group + 32 bracket = 104 match nodes, 12 group-headers,
distinct day-rows fully chronological (Jun 11/15/19 group → Jun 28…Jul 19 KO), Final at max day-index.
The signature changes (`computeKnockoutFunnelLayout(tournament, dayIndex, cx)`, `computeGroupGridLayout
(tournament, dayIndex)`) are sound and every KO match resolves to a real kickoff in the mock.

The plan is **not yet approvable** because of a few correctness and coverage gaps that would either ship a
wrong test or break a "must-stay-green" gate. None are deep architectural problems — they are concrete and
cheap to fix in the plan before coding.

## Findings

### CRITICAL
_None._

### HIGH

**H1 — The "MD3 simultaneity" framing is too narrow; in the mock EVERY matchday is same-day-paired.**
The requirement and the plan (test behavior #8, AC #4) describe side-by-side sub-slots as an *MD3* special
case. In the actual mock data (`build-mock-tournament.ts`), each group plays **both** of its matchday-N
matches on the **same calendar day** for **all three matchdays**: MD1 = Jun 11, MD2 = Jun 15, MD3 = Jun 19,
each with two matches at `iso(5, 11+md*4, …, n*30)` differing only by minute. So **every** `(group, day)`
cell holds exactly 2 matches, not just MD3. If the implementation or its test special-cases "MD3", it will
either mis-handle MD1/MD2 or assert a false premise. Fix: spec and implement the generic
"any `(group, day)` cell with 2 matches → `x ± SLOT/2`, ordered by kickoff then matchId" rule (the plan's
prose already says this — make the TEST assert the general rule across all matchdays, and drop the
"MD3-only" wording from AC #4 and behavior #8). Also note this means each group column carries 2 cards on
**every** day-row, so the no-overlap-with-adjacent-column assertion must hold for all rows.

**H2 — `roadmap.spec.ts` is a "must-stay-green" gate the plan does not address.**
`e2e/roadmap.spec.ts` is not in the plan's file table, but it (a) clicks the **Groups** focus tab, (b)
clicks **Knockout**, and (c) clicks `[data-final="true"]` to open the detail panel. The plan removes the
positioned `group` nodes and rewrites `useFocusCamera`'s group-band detection. If "Groups" focus frames an
empty/zero-node subset (because `node.type === 'group'` no longer exists and the new predicate is wrong),
`fitBounds(null)` is skipped and the camera silently does nothing — the test may still pass, but the intent
(frame the group zone) is broken. Confirm `roadmap.spec.ts` stays green and that the rewritten
`isGroupBandNode` returns a non-empty subset (`group-header` nodes + `match` nodes with
`stage==='GROUP_STAGE'`). Add `e2e/roadmap.spec.ts` to the "verified unchanged / re-checked" list explicitly.

**H3 — Coverage strategy is inconsistent with `vitest.config.ts`; the two new node components are not
measured, and the day-key derivation risks the "do-not-touch datetime" constraint.**
The plan claims "≥80% line/branch on… the two new node components." But `coverage.include` in
`vitest.config.ts` is `src/domain/**`, `src/lib/datetime.ts`, `src/features/roadmap/layout/**`,
`build-graph.ts`, `lod.ts`, `useTournamentQuery.ts`, `src/data/providers/**`, `server/routes/**`. It does
**not** include `src/components/**`, so `DayMarkerNode.tsx`, `GroupHeaderNode.tsx`, and `StandingsOverlay`
are not counted toward coverage at all. Either (a) add the new component paths to `coverage.include` and
write the jsdom specs, or (b) state honestly that component coverage is supplemental (visual/jsdom) and the
80% target applies to the layout/build-graph/day-axis modules (which `layout/**` + `build-graph.ts` already
cover). Separately: the plan proposes deriving the sortable day key by adding a token to `lib/datetime.ts`
("Add a `formatDate`-style day token there or reuse `formatDate`"). `formatDate` returns `"11 Jun"`, which
is **not lexically sortable** — reuse would break the ascending day index. And `lib/datetime.ts` is in
`coverage.include` and is on the requirement's "stay GREEN, do not touch" list; adding an exported function
there forces a new datetime test or drops coverage. Decision needed: put `dayKey(iso): 'yyyy-MM-dd'` in
`day-axis.ts` (covered + tested + sortable) and reuse `formatDate` only for the **human rail label**
(`DayMarkerNode`), leaving `datetime.ts` untouched.

### MEDIUM

**M1 — `centerline()` signature is vague.** The data-model sketch shows
`centerline(/* fixed 12-col grid */): number` but also `CX(groupCount)`. The requirement fixes
`CX = RAIL_W + 6 * GROUP_COL_PITCH` (literally column 6 of a 12-col grid). Pin the contract: either a
constant `CX` or `centerline(groupCount = 12)`; the knockout-layout test should assert Final `x ≈ CX` using
the same exported value, not a re-derived literal. Minor, but specs depend on it.

**M2 — R32 leaf fan width vs. group-grid width is unquantified.** With `LEAF_X_PITCH ≈ NODE_W+36` and 16
leaves, the R32 fan spans ~16·296 ≈ 4.7k px centered on CX; the group grid spans 12·`GROUP_COL_PITCH`
(≥ ~580 each → ~7k px). The plan asserts "no visual collision" because KO rows are lower, which is true, but
it does not state whether R32 leaves stay within the group x-extent or splay wider. Not a blocker (Q2
accepts overlap), but add a layout-spec assertion that the funnel narrows monotonically per round
(`max(child x-spread) ≥ parent x-spread`) so "the funnel reads" is actually tested, not just asserted in
prose.

**M3 — `useFitOnChange` listed as "none" but the node-count changes.** The group `table` nodes (12) are
removed and `day-marker` (≈ N distinct days) + `group-header` (12) are added, so total node count changes
but `useFitOnChange` keys on `nodes.length`. That is fine functionally, but confirm the taller canvas's
first `fitView` frame is usable (the plan flags `FIT_PADDING` tuning as non-contract — acceptable). No
change required, just verify it does not regress the existing `useFitOnChange`/`wheel-zoom.spec.ts`
behavior.

**M4 — Edge identity/dedup after group→header source change.** Feeder edges change `source` from
`group-<name>` to `group-header-<name>`, and `feederEdge` ids embed the group name. The advance-edge and
feeder-edge id schemes must remain collision-free and the existing "no duplicate edge id" expectation must
hold. The plan's build-graph spec covers counts and `b`/`t` handles; add an explicit "no duplicate edge id"
assertion since the source-id rename touches every feeder edge id.

### LOW

**L1 — `MatchNodeData.dayLabel?` optional field.** The plan adds an optional `dayLabel` to `MatchNodeData`
"only if the card needs a row label." `MatchNode` is reused **unchanged** and does not read `dayLabel`, so
adding the field is dead weight. Prefer NOT adding it to `MatchNodeData`; the day label lives on
`DayMarkerNodeData`. Keeps the reused contract clean.

**L2 — `StandingsOverlay` accessibility detail.** Plan says "focus-trapped lite" with `role="dialog"`.
Specify Esc-to-close routing (the canvas already owns Esc via `useBracketKeyboard`; ensure the overlay's Esc
handler and the keyboard hook do not both fire / conflict) and restore focus to the originating
`group-header` on close. Minor, but name it so it is not lost.

**L3 — `per-match-orientation.spec.ts` regex still matches.** The existing smoke matches
`/Group [A-L].*MD\d/` and `[data-final="true"]`. Under the new layout, group cards still render
"Group A · MD1" (label unchanged) and the Final still has `data-final="true"`, so the spec likely passes
as-is. The plan proposes rewriting/folding it; that is fine, but confirm the simpler path (leave it, add a
new `timeline-grid.spec.ts`) is not preferable to avoid churn on a passing test.

## Verdict

`VERDICT: CHANGES_REQUESTED`
