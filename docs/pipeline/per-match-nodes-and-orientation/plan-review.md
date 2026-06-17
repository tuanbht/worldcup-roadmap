# Plan Review: Per-match nodes + phase-specific orientation

## Summary

The plan is strong: it correctly maps the requirement's coordinate model onto the real
codebase, names the right files, derives counts from the fixture (72 group matches is
confirmed: 12 groups x 3 matchdays x 2 = 72), and is honest about the big risks (handle
migration in lock-step, old tests asserting the old model, `RoadmapView` removal touching six
callers, `d3-hierarchy` being absent). The acceptance criteria are concrete and testable, and
the d3-hierarchy direction is consistent with the library-first policy.

However, there are two genuine gaps that block approval as written. The most important is that
the plan's headline component test (behavior #18, MatchNode DOM assertions) is **not runnable in
the current test setup** — Vitest runs in `environment: 'node'` with no jsdom and no Testing
Library installed — yet the plan asserts "≥80% coverage on changed modules" and lists a DOM-level
component test without provisioning that environment. The second is that the d3-hierarchy data
model described in the plan does not match the actual domain types (`home.source`/`away.source`
are `SlotSource` discriminated unions, not bare matchIds), and the plan does not address how the
KO leaf order / midpoint-x maps onto the existing `slotIndex` ordering, which the requirement's
"midpoint of its two children" criterion depends on. Both are cheap to fix in the plan before
coding.

A handful of smaller accuracy issues are noted below (MEDIUM/LOW) — they won't break the build
but will mislead the implementer if left.

---

## Findings

### CRITICAL

_None._

### HIGH

**H1. The component test (behavior #18) has no runnable environment, but coverage depends on it.**
`vitest.config.ts` uses `environment: 'node'` with `include: ['src/**/*.test.ts']` (note: not
`.tsx`), and `package.json` has **no** `@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`, or `jsdom`/`happy-dom`. The plan's test-strategy item #18 ("MatchNode
renders 'Group A · MD1'... renders top + bottom handles; no left/right handles in DOM") cannot run
today, and the plan's Files table does not add the deps, a jsdom environment, a `.tsx` test glob, or
a setup file. Either:
(a) add the Testing Library + jsdom deps, a `vitest` jsdom environment (per-file `// @vitest-environment jsdom` or a `projects`/`environmentMatchGlobs` split so the pure layout tests stay in `node`), the `.tsx` include glob, and a `jest-dom` setup file — and note this is the library-first-mapped stack (the policy already lists Testing Library as "⚠️ add"); **or**
(b) drop the DOM component test and instead assert the handle-id contract purely through
`buildRoadmapGraph` output (edges use `sourceHandle:'b'`/`targetHandle:'t'`) plus a Playwright DOM
check, and restate the ≥80% coverage target against the changed *layout/build-graph* modules only
(which is what `vitest.config.ts` `coverage.include` already scopes). Pick one explicitly; as
written the plan promises a test that the harness cannot execute.

**H2. The d3-hierarchy data model in the plan does not match the domain types, and the midpoint-x
invariant is under-specified.** The plan says to build the hierarchy "rooted at the Final whose
`children` are resolved from each node's `home.source`/`away.source` `matchId` (winnerOf links)".
But in `src/domain/types/bracket.ts`, `BracketSlot.source` is a discriminated union
(`{kind:'group'|'winnerOf'|'loserOf', ...}`) — there is no bare `matchId` on the slot; you must
switch on `kind` and read `source.matchId` only for `winnerOf` (and stop at `kind:'group'` R32
leaves). More importantly, the requirement's acceptance criterion is "each KO parent's x equals the
**midpoint** of its two children's x." `d3.tree().nodeSize(...)` only yields exact parent =
midpoint-of-two-children for a **balanced** binary tree where each node's two children are
contiguous in leaf order. The bracket *is* balanced (16->8->4->2->1), but the **leaf order d3 lays
out must match the existing `slotIndex` pairing** (R32 slot `2k`,`2k+1` feed R16 slot `k`), or the
midpoint relationship will hold against d3's own x but **not** against the structural parent/child
pairing the test asserts. The plan must state that the hierarchy children are enumerated in
`slotIndex` order (top child = `slot*2`, bottom child = `slot*2+1`, matching `build-bracket.ts`
lines 94-97) so d3's midpoint coincides with the structural midpoint. Without this, behavior #8 /
acceptance #4 can fail intermittently. (The hand-rolled fallback already does this via the
`child[2*p]`/`child[2*p+1]` averaging — the d3 version must preserve the same ordering.)

### MEDIUM

**M1. Behavior #8 asserts "parent x == midpoint of its two children (±ε)" but the THIRD_PLACE and
Final-sibling handling can violate the x-origin normalization.** The plan places THIRD_PLACE at
`{x: finalX + LEAF_PITCH_X, y: finalY}` *after* the tree pass, then "normalize the x origin to 0+."
If normalization (a global x-shift) is applied to the tree nodes but THIRD_PLACE is positioned
relative to the *post-shift* finalX, fine — but the plan describes computing THIRD_PLACE from finalX
and *also* normalizing, with no stated order. Specify that THIRD_PLACE is placed relative to the
**final, normalized** Final x (and is excluded from the midpoint assertion, since it has no children
in the tree). Otherwise tests and layout can disagree by the normalization offset.

**M2. `computeBracketLayout` signature change is a breaking ripple not fully traced.** The plan
changes the signature to `computeBracketLayout(bracket, bandOffsetY)`. The existing
`build-graph.test.ts` (lines 87, 157) calls `computeBracketLayout(tournament.bracket)` with one arg,
and the plan's Files table marks `bracket-layout.test.ts` for rewrite but the *build-graph* call
sites and the old `full`/`bracket`/`groups` view tests in `build-graph.test.ts` (which the plan says
to "rewrite") must also drop the `groupGridWidth`/`computeGroupGrid` imports if those are deleted.
The plan flags this generally ("existing tests assert the OLD model") but should explicitly state
that `build-graph.test.ts` is **replaced wholesale** (not patched) and that any remaining import of
a deleted `computeGroupGrid`/`groupGridWidth` will break `tsc`. Confirm whether `computeGroupGrid`
has callers beyond build-graph + its test before deleting (grep: only those two reference it, plus
`groupsOnlyGraph`, which is itself being removed — so deletion is safe; say so).

**M3. Plan overstates existing keyboard traversal.** The plan repeatedly says "keyboard traversal
now spans group + KO in date/structural order." But `useBracketKeyboard.ts` does **not** implement
any node-to-node traversal — it only binds F (fit), 0 (reset zoom), Esc (clear selection). There is
no traversal to "extend." Either descope this to "retune fit padding for the taller canvas" (the
only real change needed) or explicitly scope *new* traversal as added work with its own tests. As
written it implies modifying behavior that doesn't exist.

**M4. Smoke-test wording: "wheel-zoom" is `panOnScroll` + ctrl+wheel, not plain wheel.** The canvas
sets `panOnScroll`, so a plain wheel pans; zoom requires ctrl+wheel (the existing
`e2e/wheel-zoom.spec.ts` documents and relies on exactly this). The plan's smoke (#19/#10) says
"wheel-zoom"; the implementer must dispatch **ctrl+wheel** (reuse the `ctrlWheel` helper pattern in
`wheel-zoom.spec.ts`) or the zoom won't happen and the test will be flaky/meaningless. State this so
the e2e author doesn't write a plain-wheel zoom.

### LOW

**L1. Tailwind is already installed; the styling note is slightly stale.** `package.json` already
has `tailwindcss@^4.3.1` + `@tailwindcss/postcss`, and `MatchNode`/`GroupTableNode` are already
Tailwind-classed (not the "bespoke CSS" the policy's add-list implies). The plan's `globals.css`
edit is fine, but the group-card label/variant should be **Tailwind utilities on the component**
(consistent with the existing nodes), with `globals.css` reserved for the `.advance-edge`/band
affordances that already live there. Minor — just align with the existing pattern.

**L2. `MatchNodeData` is a view model, not the Zod schema.** Good that the plan adds `group`/
`matchday` here; note (so the implementer doesn't chase it) that `parseTournament`/the
`tournament-schema` need **no** change — the domain `Match` already carries `group`/`matchday`
(confirmed in `src/domain/types/match.ts`), and `MatchNodeData` is populated in `matchData()` in
`build-graph.ts`. The plan's `matchData()` reuse is correct; just spell out that `matchData` must
now also read `match.group`/`match.matchday` (and emit `null` for the bracket-node-without-match
fallback branch).

**L3. `data-final="true"` selector is already present** (`MatchNode` renders `data-final={isFinal}`),
so the smoke selector `[data-final="true"]` is valid as-is — good. The existing `e2e/roadmap.spec.ts`
already uses it (line 27). No action; noted to confirm the smoke is feasible.

---

## Verdict

VERDICT: CHANGES_REQUESTED

H1 (no runnable env for the promised component test, while claiming ≥80% coverage) and H2
(d3-hierarchy data model mismatch + under-specified midpoint-x ordering) must be resolved in the
plan before implementation. The MEDIUM items should be folded in to avoid wasted implementer churn.
