# Plan review: Canvas interaction model — both modes + persisted toggle

**Reviewed:** `docs/pipeline/canvas-interaction-model/plan.md`
**Against:** `requirements/canvas-interaction-model.md` (decision record, §1 RESOLVED = "both modes + toggle"), the task brief, and the live codebase.
**Date:** 2026-06-18

## Summary

This is a strong, codebase-grounded plan. It correctly implements the owner's resolution
(BOTH `zoom` and `pan` modes + a persisted, accessible toggle, default `zoom`), and it
faithfully mirrors established repo patterns. I verified the load-bearing claims against
the actual source rather than trusting the plan:

- `SegmentedControl` (`src/components/ui/SegmentedControl.tsx`) really is a flat
  `role="tablist"` of native `<button role="tab">` with `aria-selected` — so the plan's
  component-test ARIA assertions and "keyboard via native button click" claim hold.
- `useStageView` / `StageToggle` exist with the exact client-only-hydrate-on-mount shape
  the plan says it mirrors; the "localStorage not URL" rationale is sound and avoids
  fighting `useStageView` for the query string.
- `@xyflow/react` v12 types `zoomActivationKeyCode?: KeyCode | null` where
  `KeyCode = string | Array<string>` (`@xyflow/system` general.d.ts:178), so
  `['Meta','Control']` is type-valid — the plan's LOW risk #2 resolves in its favour.
- The `@xyflow/system` panzoom source confirms both modes' e2e assertions are achievable:
  under `panOnScroll`, `createPanOnScrollHandler` zooms only when `event.ctrlKey && zoomOnPinch`;
  under `zoomOnScroll` defaults, plain wheel and ctrl+wheel both zoom. The existing
  `e2e/wheel-zoom.spec.ts` and the two sibling specs already exploit this.
- Tooling exists: `npm run test` (vitest run), `test:e2e` (playwright), `typecheck`, `build`;
  jsdom + Testing Library are installed; new test files under `src/**/*.test.ts(x)` are
  picked up by the vitest `include` glob.

No CRITICAL or HIGH issues. The findings below are MEDIUM/LOW and should be folded in, but
none block the approach.

## Findings

### MEDIUM

**M1 — Doc-consistency contradiction: two e2e specs will carry false comments the plan
forbids touching.**
The plan's *Out of scope* says: "Any change to `e2e/timeline-grid.spec.ts` or
`e2e/per-match-orientation.spec.ts`." But both files open with the header comment
*"The canvas uses `panOnScroll`, so a plain wheel PANS; only ctrl+wheel zooms"*
(timeline-grid.spec.ts:13, per-match-orientation.spec.ts:11). After this change the default
is `zoom` mode, where a plain wheel **zooms** and `panOnScroll` is off — so those comments
become factually wrong, directly undercutting the task's "reconcile spec and code so they
agree" goal. The Risks section even acknowledges they "only need their explanatory comment
updated," which **contradicts** the Out-of-scope line that forbids any change.
*Their assertions stay valid* (they only use `ctrlWheel`, which zooms in both modes, and
assert DOM reachability — verified), so this is a comment-only fix, not a logic risk.
**Fix:** Explicitly permit a comment-only update to those two specs' header blocks (no
assertion/logic change) and move them out of the blanket Out-of-scope ban, OR state plainly
that the stale comments are knowingly deferred and why. Pick one; do not leave the plan
self-contradictory.

**M2 — `pan`-mode zoom mechanism is mis-attributed; `zoomActivationKeyCode` is largely inert
on the wheel path under `panOnScroll`.**
The plan presents `zoomActivationKeyCode: ['Meta','Control']` as what makes ⌘/Ctrl+scroll
zoom in `pan` mode. The system source shows otherwise: in `createPanOnScrollHandler`, wheel
zoom fires on `event.ctrlKey && zoomOnPinch` — i.e. `zoomOnPinch: true` is the actual enabler
(and macOS reports trackpad pinch as `ctrlKey`). `zoomActivationKeyCode` feeds the
`zoomOnScroll`/filter path, not the `panOnScroll` wheel handler. The chosen props still
produce correct behaviour (ctrl/⌘+wheel zooms via `zoomOnPinch`), so this is not a bug — but
the plan's stated rationale and the unit test that asserts
`zoomActivationKeyCode` "includes 'Meta' and 'Control'" risk encoding a misleading mental
model, and a future maintainer may "simplify" by dropping `zoomOnPinch` and silently break
⌘-scroll zoom.
**Fix:** Correct the rationale to state that `zoomOnPinch: true` is what enables ⌘/Ctrl+scroll
+ pinch zoom under `panOnScroll`, and that `zoomActivationKeyCode` is carried as a
defensive/forward-compat flag. Keep `zoomOnPinch` in the asserted pan-mode props. Optionally
add a one-line code comment in `interaction-mode.ts` citing the `panOnScroll` handler so the
coupling is obvious.

**M3 — `readStoredMode` testability for the "no-window" case is under-specified.**
Acceptance #6 and the hook unit suite require asserting the `typeof window === 'undefined'`
fallback. Inside jsdom, `window` is always defined, and deleting/stubbing global `window`
mid-test is brittle. The plan hints "test the pure reader with a stubbed/guarded path" but
the *Files* table puts `readStoredMode` inside `useInteractionMode.ts` without stating it is
**exported**. If it is a private closure, the no-window branch is effectively untestable in a
clean way (and the "fully branch-covered" coverage claim is at risk).
**Fix:** Either (a) export `readStoredMode()` as a standalone pure function (ideally from the
React-free `interaction-mode.ts`, taking `Storage | undefined` / using a guarded
`globalThis.window` read) so it can be unit-tested in the node env without `window`, or
(b) specify the exact stubbing strategy (e.g. `vi.stubGlobal('window', undefined)` with
restoration) the test will use. Make the no-window branch genuinely reachable by a test.

### LOW

**L1 — Panel position collides with `<Controls>` default (bottom-left).**
The plan picks `<Panel position="bottom-left">` for the toggle, but `<Controls>` renders
bottom-left by default and `RoadmapCanvas` uses `<Controls showInteractive={false} />` with
no reposition. The plan flags this as a LOW risk to "verify in visual check," which is
acceptable, but since it's already knowable from the code, prefer deciding now (e.g.
`bottom-center`, or offset via Panel `className`) to avoid a guaranteed overlap and a rework
loop. `top-left` is taken by `StageToggle`, `top-right` by `Legend`.

**L2 — Coverage `include` globs must be added for the new modules.**
The plan correctly notes new files must be added to `vitest.config.ts` coverage `include`
(the current globs do not match `src/features/roadmap/interaction-mode.ts`,
`.../hooks/useInteractionMode.ts`, or `src/components/roadmap/InteractionModeToggle.tsx`).
Confirmed against the live config — the globs are explicit allow-lists, so this step is
mandatory, not optional, for the ≥80% target to mean anything. Keep it as an explicit task
checkbox so it isn't dropped.

**L3 — `RoadmapCanvas` test coverage gap for the wiring.**
`RoadmapCanvas.tsx` is not in the coverage include list today and the plan does not add a
component/integration test for the *wiring* (that the canvas spreads `interactionFlowProps`
and renders the toggle). The mode→props mapping and the toggle are each unit-tested in
isolation, and the integration is covered by e2e — which is reasonable per the repo's
"e2e carries the React Flow behavior" stance. No change required, but note explicitly that
`RoadmapCanvas` wiring relies on e2e (which "may be unavailable in-sandbox"), so a typecheck
+ build pass is the only in-sandbox guard that the spread compiles. Acceptable; just be
deliberate about it.

**L4 — Hint copy uses a literal `⌘` glyph.**
Per the brief this is the intended affordance text ("⌘-scroll to zoom"). Fine for modern
targets; the toggle is the primary, platform-neutral affordance and ctrl+scroll works on
non-mac. No change needed — flagging only so the implementer keeps the glyph in a constant
(not duplicated) and the component test matches on a substring, as the plan already says.

## Checklist verdict

- Completeness: all task requirements addressed (both modes, persisted toggle, default zoom,
  hook, component, e2e for both modes + persistence, both doc edits). ✅
- Feasibility: verified against real types, panzoom source, patterns, and tooling. ✅
- Architecture: pure module + hook + presentational toggle; mirrors `useStageView`/`StageToggle`;
  no library-ization; small files. ✅
- Reuse: reuses `SegmentedControl`, `Panel`, established hook/persistence shape. ✅
- Test strategy: RED/GREEN clear; ≥80% target with explicit coverage-include step; edge cases
  (invalid stored value, storage throw, no-window) enumerated. One gap: M3 no-window testability. ⚠️
- Non-functionals: a11y inherited from `SegmentedControl` (verified roles); localStorage wrapped
  in try/catch; no secrets; compositor-only — fine (no new animation). ✅
- Risks: real risks named; M1/M2 are accuracy corrections to the risk framing, not new blockers. ⚠️

## Verdict

The approach is correct and low-risk. The issues are MEDIUM/LOW (documentation consistency,
a mis-attributed mechanism, and a testability detail) — none CRITICAL or HIGH. Per the gate
(approve only with no CRITICAL/HIGH), this **passes**, conditioned on folding in M1–M3
before/while implementing.

**VERDICT: APPROVED**
