# Final Review: Focus-Current-Match Button

**Stage 7 — strategic / closing assessment.** Verdict at the bottom.

This feature had no `requirement.md`; the stage-0 prompt **is** the spec. I judged
satisfaction against that spec and against the relevant `requirements/` files
(`zoomable-roadmap-graph.md`, `canvas-interaction-model.md`,
`per-match-nodes-and-orientation.md`, `timeline-grid-layout.md`) which establish the
camera/Panel/Controls conventions this control plugs into. I re-read the production
code directly and re-ran the gates rather than trusting prior stages.

## Observed Gate Results (re-run at review time)

| Gate | Command | Result |
| --- | --- | --- |
| Tests | `npm run test` | **PASS — 35 files, 398/398** (new: focus-target 19, FocusMatchButton 16, useFocusMatch 6) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS — clean, exit 0** |
| Build | `npm run build` (vite) | **PASS — built in ~1.05s** |
| e2e | `npm run test:e2e` | Not run (optional per spec; Playwright browsers may be unavailable). Documented. |

Confirmed green independently; I did not take the impl-review's word for it. Numbers match
stage 6 (398/398), so nothing regressed between stages.

## 1. Requirement Satisfaction

**Delivered, in full.** The feature does what was asked: a Panel button that jumps the
camera to the live match if one is in play, otherwise the nearest upcoming match, and is
disabled when every match has ended.

- **Target rule (owner's exact phrasing — "the match with ended estimate time nearest in
  the future").** `pickFocusMatchId(matches, nowMs)` in `src/features/roadmap/focus-target.ts`
  computes `estimatedEnd = Date.parse(kickoff) + MATCH_DURATION_MS`, keeps only candidates
  with `estimatedEnd > now` (strict), and selects the minimum end with `kickoff → id`
  tiebreaks. It is **pure** (no clock read inside — the caller passes `Date.now()`, tests pass
  a fixed `NOW`), **O(n)** (single `for...of` + running scalars, no `[...].sort()`), and
  **non-mutating** (verified by a `deepFreeze` test asserting input order is preserved). A
  live match's end sits just ahead of `now`, so "live wins, ending soonest" falls out of the
  min rule rather than being special-cased — exactly the elegant outcome the owner described.
- **Does it jump correctly?** Yes. Node id **equals `match.id`** for both group cards
  (`build-graph.ts:54,72` — `matchNode` sets `id: data.matchId`, `matchId = match.id`) and
  real knockout matches, so `getNode(pickFocusMatchId(...))` resolves. `useFocusMatch` centers
  on `node.position.x + NODE_W/2, y + NODE_H/2` with `FOCUS_ZOOM=1.1` (within canvas
  `minZoom 0.2`/`maxZoom 1.8`) and `FOCUS_DURATION_MS=500` (the existing camera duration), and
  selects the node (opens `MatchDetailPanel`, the same semantic as a node click).
- **UI / a11y.** A single real `<button>` inside a React Flow `<Panel position="top-center">`
  (an unoccupied slot — no collision with StageToggle/Legend/Controls/InteractionModeToggle),
  lucide `LocateFixed` icon, dynamic `aria-label` ("Go to live match" / "Go to current
  match"), `focus-visible:ring-accent` token focus ring, keyboard activation free from native
  button semantics, `disabled` when no target (guarded twice — native `disabled` +
  `handleActivate` null-check), and a `data-live` accent + `animate-livepulse` dot that
  animates only `transform`/`opacity` and is silenced under `prefers-reduced-motion`
  (`global.css:170`).
- **Standards.** Named constants (no magic numbers), immutable derivation in `RoadmapCanvas`
  (`{...node, data:{...}}` display copy, `useMemo` target), no `console.log`, all files < 60
  lines (well under the 800 cap), explicit "no target" handling end to end.

**Partial / deferred (honestly):** **No realtime ticking.** The target is memoized on
`[tournament]` while reading `Date.now()` inside, so between TanStack's 45s refetches a match
that goes live or ends mid-interval is reflected up to ~45s late — the button's label /
enabled state can briefly lag. This was an explicit, documented out-of-scope decision in the
plan (resolve-at-click/re-render, not a live clock). The worst case is a stale **label**,
never a wrong camera move: the click still resolves a fresh target through the same memo on
the next render. Acceptable as designed, and worth keeping on the radar (see Follow-ups).

No gate was skipped; no test is weak (see §5).

## 2. Tradeoffs

- **Imperative `setCenter` vs. extending the declarative `useFocusCamera`.** The team built a
  new `useFocusMatch` calling `setCenter` directly instead of overloading the effect-driven
  `useFocusCamera` (which frames *node sets* via `fitBounds` on a `focus` enum change).
  **Right call.** Focusing the current match is an *idempotent action* — clicking again must
  re-center even when no state value changed — which an effect-on-change model swallows.
  Reusing `setCenter` (the same primitive `useFocusCamera` is built on) honors "reuse the
  existing camera-focus mechanism" while keeping the click path explicit and unit-testable. It
  costs a second small hook, but avoids muddying a clean, already-tested camera hook.
- **Pure time rule vs. status-aware "live always wins".** A `status:'live'` match that has run
  *past* its 115-min window is treated as "ended" and yields focus to the next candidate. This
  is the literal owner phrasing ("ended estimate **time** nearest in the future") and is
  covered by an explicit test (`EXCLUDES a long-running live match…`). The plan committed to it
  rather than adding a speculative `status==='live'` guard that would contradict the spec.
  Defensible and the cleaner choice; the only sacrifice is a rare visual surprise on a match in
  long stoppage/extra-time beyond ~115 min. Flagged as a one-line change if the owner ever
  prefers status-priority.
- **`MATCH_DURATION_MS = 115 min` as a single constant vs. per-match duration.** A flat
  constant keeps the resolver O(n) and the rule legible. For the real World-Cup fixture cadence
  (non-overlapping kickoffs) any value in ~100–130 min yields identical selection, so the
  approximation is sound. Sacrifice: extra-time knockout matches genuinely run longer, so their
  estimatedEnd is slightly optimistic — immaterial to selection here, documented in code.
- **Two O(n) passes for `{ id, isLive }`.** `RoadmapCanvas` calls `pickFocusMatchId` then a
  second `matches.some(...)` to derive `isLive`, instead of returning both from the resolver.
  Keeps `pickFocusMatchId`'s signature a clean `string | null`; negligible for ≤104 matches.
  Acceptable; optional future tidy.

## 3. Architecture & Fit

Strong fit, low friction. The change is surgical — production diff is **only**
`RoadmapCanvas.tsx (+22)` and `vitest.config.ts (+3)`, plus four new small feature files. It
mirrors the established `InteractionModeToggle` precedent exactly: a `<Panel>`-wrapping control,
tested inside `ReactFlowProvider` with a `// @vitest-environment jsdom` pragma over the `node`
default. Domain logic stays inside the roadmap feature (not library-ized, per
`library-first-stack-policy.md`'s intent for domain-specific code). Design tokens (`bg-live`,
`--color-live`, `animate-livepulse`, `ring-accent`) are reused, not reinvented — the live dot
reuses the same class `StatusPill` already uses. "Select on focus" routes through the existing
`setSelected` → `MatchDetailPanel` path, so highlight behavior is consistent with a node click
rather than a divergent path. Nothing here pulls the codebase off its current direction.

## 4. Tech Debt & Risks

- **Stale label window (LOW, by design).** The ~45s memo lag in §1. Not debt so much as a
  scoped boundary; the only realtime-correctness gap. No camera-correctness risk.
- **Two-pass `isLive` derivation (LOW).** Cosmetic; see Tradeoffs.
- **Unreachable defensive branch (NOTE).** `Number.isNaN(Date.parse(kickoff))` guard in
  `focus-target.ts:46-47` is unreachable given `Match.kickoff` is a typed non-null ISO string
  (hence the 84.6% branch coverage). It's correct "never trust external data" hygiene and cheap;
  leave it.
- **Unrelated formatting drift in the diff (LOW, cleanliness).** `git diff` shows two
  *unrelated* files touched —
  `src/data/providers/fifa/__fixtures__/match-detail.support.ts` and
  `.../match-detail-mapper.test.ts` — but the changes are **pure Prettier reflows** (line
  wrapping, `'…\''` → `"…'"` quote normalization), no logic. Likely format-on-save touching
  adjacent files. Harmless, but they pollute an otherwise clean feature diff; split them out
  before committing so the feature PR stays focused.
- **Security / performance posture (system level).** No new attack surface: no user input, no
  network, no `dangerouslySetInnerHTML`, no secrets. Performance is a fire-and-forget compositor
  glide on a ≤104-element scan — no concern. The `RoadmapCanvas` JS chunk is 277 kB / 88.6 kB
  gzipped, over the global landing/microsite JS budgets, but that is **pre-existing**
  `@xyflow/react` weight, not introduced here (this feature adds < 1 kB). Out of scope to fix,
  noted only so the budget overrun isn't mistaken for a regression from this change.

## 5. Test & Quality Posture

**High confidence.** 41 new assertions across three well-aimed specs; the suite is strong
exactly where the risk lives.

- **`focus-target.test.ts` (19) — the core.** Exhaustive on the pure resolver: live-wins,
  nearest-upcoming, null-when-all-ended, empty list, the **strict `> now` boundary** (`=== now`
  excluded, `now+1ms` included), kickoff-before-id tiebreak ordering, id tiebreak, determinism,
  immutability via `deepFreeze`, a 64-element shuffled mixed-status "global minimum" scan, and
  the long-running-live exclusion edge case. This is where confidence comes from.
- **`FocusMatchButton.test.tsx` (16).** Semantic single `<button>`, accessible name, aria-label
  variants, disabled-when-null, no-activate-while-disabled, click + Enter + Space activation
  (each fires exactly once), and the `data-live` affordance including the "never claims live
  when no target" guard.
- **`useFocusMatch.test.tsx` (6).** `setCenter` called with the exact node-center + named
  constants, `onFocused` fired, **missing-node = safe no-op** (the real, permanent case — a
  group match whose grid cell yields no position is skipped at `build-graph.ts:216`), stable
  identity across re-renders, and a stale-closure guard (captured handle routes to the latest
  `onFocused`).
- **Where it's thinner (acceptable):** the `RoadmapCanvas` wiring itself (the `useMemo`
  derivation + `onFocused: setSelected` glue) is not in the coverage allowlist and has no direct
  component test — but its two halves are fully covered by the resolver and hook unit tests, so
  the glue is the only untested seam and it is trivial. No e2e for the end-to-end camera move
  (browsers optional/unavailable); the visual jump is the one thing only an integration/e2e test
  would catch — see Follow-ups. Coverage on the three new files is well above the 80% gate
  (focus-target 100% stmt, useFocusMatch 100%, FocusMatchButton 100% stmt).

## 6. Follow-ups (prioritized)

**Must-do (before commit/merge):**
1. **Un-pollute the diff.** Separate the two unrelated Prettier-only reflows in the
   `match-detail` fixtures/test out of this feature's commit (or commit them as a standalone
   `chore: format` so the feature PR is purely the focus button).

**Nice-to-have (post-merge, in priority order):**
2. **One Playwright e2e** for the real camera move: render the canvas, click "Go to current
   match", assert the viewport transform changed / the target node is centered and selected.
   This is the only check that exercises the full glue + actual `setCenter` geometry the unit
   tests stub out. Gate it behind browser availability.
3. **Light realtime freshness** if the stale-label window proves noticeable: a low-frequency
   `useMemo` key tick (e.g. derive on a coarse `Math.floor(Date.now()/30_000)`) so live/ended
   transitions surface without waiting for the 45s refetch. Cheap; only if the lag is felt.
4. **Optional tidy:** have `pickFocusMatchId` (or a sibling) return `{ id, isLive }` to drop the
   second `matches.some(...)` pass in `RoadmapCanvas`. Pure cosmetics.
5. **Decision to record (not code):** confirm with the owner that a live match past its ~115-min
   window should yield to the next match (current behavior). If not, it's a one-line
   status-priority guard — but it would contradict the literal spec, so do not add it
   speculatively.

---

## Verdict: **SHIP WITH CAVEATS**

The feature is correct, well-tested, idiomatic, and all gates are green (398/398, typecheck
clean, build OK) — verified independently at review time. The button jumps to the live/next
match correctly via the spec's exact rule, with sound edge-case handling and accessibility.

Caveats (none blocking the feature itself):
1. **Separate the unrelated Prettier-only formatting drift** in the two `match-detail` test
   files out of this feature's commit before merging.
2. **Accepted ~45s stale-label window** (no realtime ticking) — by design; revisit only if felt.
3. **No e2e** for the actual camera move — add one when browsers are available; unit/hook tests
   cover the logic but not the integrated jump.
