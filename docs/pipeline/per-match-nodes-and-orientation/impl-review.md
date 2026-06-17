# Implementation Review — Per-match nodes + phase-specific orientation

**Verdict: APPROVED** — no CRITICAL or HIGH findings; all gates pass.

## Summary

The implementation faithfully delivers the requirement and the (overwritten, Vite-era)
plan. Every `GROUP_STAGE` match becomes a `match` node in a horizontal lane-per-group
band ordered by kickoff; standings tables remain at each lane start; the knockout is a
vertical top→bottom `d3-hierarchy` tree (R32 top → Final bottom) with parent x =
structural-children midpoint; THIRD_PLACE sits beside the Final; everything lives on one
continuous canvas with downward (top/bottom) handles and feeder edges. The three layout/
build-graph test files were rewritten to the new spec with fixture-derived counts; the
domain/data/lod/server tests are untouched and green. Layout helpers are pure + O(n) and
`buildRoadmapGraph` is an immutable transform.

## Observed gate results

| Gate | Command | Result |
| --- | --- | --- |
| Tests | `npm run test` | PASS — 14 files, **121 tests** green |
| Coverage | `npm run test:coverage` | PASS — overall 93.33% stmts; **build-graph.ts 98.3%**, **group-layout.ts 100%**, **layout/ 100%**, hooks 100% (all ≥80%) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | PASS — exit 0 |
| Build | `npm run build` (vite) | PASS — built in ~1s; RoadmapCanvas chunk 251.65 kB / 81.71 kB gz |
| Lint | `npm run lint` | N/A — no `lint` script in package.json (repo uses `format:check` via prettier; not run as a gate) |
| E2E | `npm run test:e2e` | NOT EXECUTED — Playwright browsers unavailable in this sandbox; spec `e2e/per-match-orientation.spec.ts` is committed and documented (Acceptance #11, plan Risk noted) |

## Acceptance-criteria verification

1. **72 group match nodes** — `build-graph.test.ts` asserts `groupCards().length === groupMatches.length` with a `=== 72` fixture self-check; `group-layout.test.ts` independently asserts `matches.size === 72`. Verified.
2. **Lane ordering by kickoff, strictly increasing x, shared lane y, distinct A..L lane y** — covered by `group-layout.test.ts` (adjacent-pair monotonic x, uniform `GROUP_MATCH_STEP_X`, first x = `TABLE_W + GROUP_GAP`, shared `laneY`, distinct strictly-increasing lane y). Implementation sorts by `kickoff.localeCompare || id` per lane. Verified.
3. **Tables remain, one per group at x=0** — `build-graph.test.ts` asserts 12 `group` nodes all at `x===0`. Verified.
4. **KO y monotonic by depth; parent x = midpoint; THIRD_PLACE adjacent** — `bracket-layout.test.ts` asserts monotonic per-stage y (R32 min → FINAL max), one `STAGE_PITCH_Y` apart, 15 internal parents each at the structural-children midpoint (`toBeCloseTo`), THIRD_PLACE same y as Final and one `LEAF_PITCH_X` to the right. Implementation uses `d3.tree().nodeSize([LEAF_PITCH_X, STAGE_PITCH_Y])` with `[home,away]`-ordered `winnerOf` children and `y = bandOffsetY + (maxDepth - depth) * STAGE_PITCH_Y`. Verified.
5. **All edges downward, no left/right handles** — `HANDLES = {sourceHandle:'b', targetHandle:'t'}` applied to every advance + feeder edge; `build-graph.test.ts` asserts `'b'`/`'t'` on all edges and the absence of `sl/sr/tl/tr`. `MatchNode.tsx` exposes one `id="t"` Top target + one `id="b"` Bottom source; `GroupTableNode.tsx` source handle moved to `Position.Bottom`. `MatchNode.test.tsx` (jsdom) asserts exactly one top + one bottom handle and zero left/right. Grep confirms no `sl/sr/tl/tr` literals remain in `src/` (only the negative-assertion set in the test). Verified.
6. **Continuous canvas: KO below band; feeders group→R32** — `build-graph.test.ts` asserts every group card `y < groupBandHeight + SECTION_GAP` and every KO node `y >= threshold`; feeder count derived from `R32_SEEDING` with resolvable, R32-targeted endpoints. Verified.
7. **`MatchNodeData.group`/`matchday`; "Group A · MD1" label; schema unchanged** — added to `graph-model.ts`; `MatchNode.tsx` renders `Group ${group} · MD${matchday}`; `MatchNode.test.tsx` asserts the label for a group card and its absence for a KO card. `parseTournament`/schema untouched (git confirms no domain/data changes). Verified.
8. **KO via `d3-hierarchy` `d3.tree`** — `bracket-layout.ts` imports `hierarchy, tree` from `d3-hierarchy`; no `package.json` change. Verified.
9. **Pure + O(n); immutable transform** — `computeGroupMatchLanes`, `computeBracketLayout`, and `buildRoadmapGraph` each have a purity test proving structurally-equal output across calls and no mutation of a `deepFreeze`d input. Single-pass + per-lane sort / single d3 pass = O(n) (n small, <300 nodes). Verified.
10. **StageToggle = focus camera, not layout swap; `?focus=` default `all`** — `useStageView` re-keyed to `RoadmapFocus` persisted via `?focus=`; `StageToggle` emits focus; `useFocusCamera` moves the camera (`fitView`/`fitBounds`) without changing graph shape. Verified.
11. **Playwright smoke** — committed (`e2e/per-match-orientation.spec.ts`): load → ctrl+wheel zoom → group card (`/Group [A-L].*MD\d/`) + Final (`[data-final="true"]`) both attached. Not executable here (no browser); gap documented, consistent with plan.
12. **Gates green + ≥80% coverage** — see table above. Verified.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW

- **L1 — `bracket-layout.ts:48` `xOf` 0-fallback can mask a missing d3 x.** `const xOf = (n) => n.x ?? 0` exists only to satisfy the optional `x` typing. In the unreachable event d3 ever produced an `undefined` x, the node would silently collapse to x=0 rather than fail. Acceptable (d3.tree always assigns x post-layout; the midpoint test would catch a regression), but a narrow non-null assertion or invariant would read more honestly.
- **L2 — Coverage gaps are benign defensive branches.** `build-graph.ts:72-73` (`edgeState` `live`/`finished` arms) and `group-layout.ts:26,56` (kickoff tiebreak `|| id` and the `?? []` lane fallback) are uncovered. The mock fixture's matches are all `scheduled` and every group has matches, so these paths don't execute. Optional: a tiny unit covering a `live`/`finished` status and an empty-group lane would close them. Does not affect the ≥80% target (build-graph 98.3%, group-layout 100% stmts).
- **L3 — `data-final` / `data-group` / `data-third` render as `"true"`/`"false"` strings.** `MatchNode.tsx` passes raw booleans to data attributes; React stringifies them, so `[data-final="true"]` (e2e) and `data-[final=true]:` (Tailwind) both work. Correct as written; just note that `[data-final]` presence-only selectors would match both states.

## Notes on scope decisions (acceptable, flagged in plan)

- **Cross-phase keyboard traversal** is intentionally out of scope; `useBracketKeyboard` retains F/0/Esc only (plan Risk + Out-of-scope). The requirement's "traversal spans group + KO" is reasonably read as fit/reset over the unified canvas; net-new node-to-node traversal would need its own focus-management + tests. Consistent with the approved plan; flagged for the orchestrator.
- **`useFocusCamera`** is a new hook not named in the plan's file table but is a clean, in-scope realization of the "focus → camera move" requirement. `nodes` is referentially stable (memoized on `tournament` in `useRoadmapGraph`), so the effect does not churn per render.
- **LOD intact**: `lod.ts` and `lod.test.ts` are unmodified (git confirms); the group-card label and table detail reuse the existing `data-lod-detail` hook with no threshold change.
- **Untouched green tests**: domain (`build-bracket`, `build-mock-tournament`, `standings`), data (`mapper`), `lod`, `datetime`, `d3-hierarchy.smoke`, server, query, and `MatchDetailPanel` all pass unchanged.

## Conclusion

The change set meets every acceptance criterion, the rewritten tests meaningfully constrain
the new vertical/per-match behavior with fixture-derived counts (not weakened to pass), and
all runnable gates are green with healthy coverage. Only LOW polish items remain.

VERDICT: APPROVED
