# Final Review — Google-style match detail panel (Timeline / Lineups / Stats)

Stage 7 strategic assessment. The line-level review (stage 6) already APPROVED the change; this is a
higher-altitude judgment of the effort as a whole, with the gates re-run independently rather than taken
on faith.

## Observed gate results (re-run this stage, not inherited)

| Gate | Command | Observed result |
|---|---|---|
| Tests | `npm run test` (`vitest run`) | **PASS** — 28 files, **281/281** tests, 3.18s |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS** — clean, exit 0 |
| Build | `npm run build` (`vite build`) | **PASS** — built in ~1.1s; main bundle 226.88 kB (71.04 kB gzip), RoadmapCanvas chunk 273.41 kB (87.50 kB gzip) |
| Coverage | `npm run test:coverage` | **95.89% lines** overall (88.26% branch). New modules: route `match-detail.ts` 100%, `event-labels.ts` 100%, `match-detail/**` 93.54%, `providers/fifa` 92.61%. All comfortably above the 80% AC. |
| Module boundary | `grep -rn "from '.*server/'" src/` | **Clean** — zero `src/ → server/` imports |
| Lint | n/a | No `lint` script in this repo; build + typecheck are the static gates (prettier `format:check` exists but is not wired as a gate) |
| E2E | `e2e/match-detail.spec.ts` | Authored; runs under `test:e2e` (Playwright), not the unit gate. Browsers may be unavailable in the sandbox — documented, not run here. |

The final state is genuinely green. The stage-6 numbers reproduced exactly.

## 1. Requirement satisfaction

Delivered, in full, against all 16 acceptance criteria. Spot-checked the load-bearing claims against source:

- **3-tab panel fed by real FIFA per-match endpoints, on demand** — `useMatchDetailQuery(matchId, isLive)` is
  `enabled` only when a match is selected; the Hono route `GET /api/worldcup/match/:matchId/detail` resolves
  `matchId → providerRef` from the cached tournament and fetches `/live/football/...` + `/timelines/...` in
  parallel (`match-detail-client.ts`).
- **Mock match → graceful `DETAIL_UNAVAILABLE`** — `route` returns HTTP-200 `fail(DETAIL_UNAVAILABLE)` when
  `providerRef` is null (`match-detail.ts:32-36`); the hook maps it to `status:'unavailable'`, not an error.
  Tested both at the route and panel level.
- **Events mapped by `TypeLocalized` label, never numeric `Type`** — confirmed in `event-labels.ts` and the
  mapper; pinned by `event-labels.test.ts` (14 tests) and `match-detail-mapper.test.ts` (28 tests).
- **Stats derived by counting, null omitted not faked** — `match-detail-stats.ts:56-59` hard-sets
  `shotsOnTarget`/`passes`/`passAccuracy` to `null`; `shots: 0` is a real zero count, correctly distinct from
  the omitted-`null` unsourced stats. Verified.
- **Win probability is a labeled estimate or absent** — `estimateWinProbability` returns `null` pre-match /
  unknown scoreline and always stamps `estimated: true`; `renormalize` guarantees `home+draw+away === 100`
  with a two-pass residual absorb that holds under all three overflow directions. Never presented as a FIFA
  figure.
- **FIFA boundary zod-validated + degrade-to-empty** — `fetchSection` returns `null` on HTTP / oversized
  (>4MB) / invalid-JSON / schema failure inside a `try/catch`; the mapper tolerates any combination of
  null sections. No throw reaches the route as a crash.
- **a11y inert/Escape/focus + mobile bottom-sheet preserved**, **header / goalscorer line / formation pitch /
  headshots with initials fallback / higher-stat emphasis** — all present and tested.

**Honest caveats (nothing skipped, but worth stating plainly):**

- **E2E was authored, not executed here.** The Playwright smoke spec exists and is sound, but no browser run
  was observed in this environment. The full "open → switch 3 tabs → Escape" path is therefore verified by
  jsdom component tests (`MatchDetailTabs.test.tsx`, 18 tests) rather than a real browser. This is the
  documented sandbox limitation, not a quality gap — but it is unverified at the integration layer.
- **No real FIFA payload was ever captured.** Every fixture is synthetic, shaped from the requirement's
  documented field names. The undocumented `/live` and `/timelines` shapes (`FieldStatus` vs `Status`,
  `PlayerPicture.PictureUrl`, `Tactics` formation string, `BallPossession` units) are unconfirmed against a
  live response. The tolerant schemas make this safe-from-crash, but the feature's *correctness* against real
  data is unproven until a live payload is observed. This is the single biggest "looks done, isn't fully
  validated" item.

## 2. Tradeoffs

- **Parallel data path vs. embedding detail in the Tournament aggregate.** The plan rejected eager-embedding
  (×104 FIFA calls, rate-limit blowout, aggregate coupling) in favour of an on-demand per-match route + cache
  mirroring the proven tournament path. Right call — it matches the "on demand per selected match" requirement
  and keeps the `Tournament` aggregate unpolluted. Cost: a second cache singleton and a second route to
  maintain, which is acceptable duplication of a well-understood pattern.
- **`DETAIL_UNAVAILABLE` as HTTP-200-with-fail-envelope, not 404.** Optimizes for a clean client console and a
  clear "not available" vs "server error" distinction, and lets the unavailable response be cached with the
  standard header. Sacrifices REST-purist status semantics. Reasonable for an internal SPA contract; flagged in
  the plan if 404 is later preferred for CDN cache semantics.
- **Win probability computed locally rather than omitted.** The requirement's default. Optimizes for a richer
  panel; sacrifices authority — it is a heuristic with hand-tuned magic constants (`lead * 18`, `decisiveness
  0.5..0.95`, `drawBase 44 - 30t`). It is *labeled* and *renormalized*, so it can never masquerade as FIFA
  data, but it is also not calibrated against any outcome data. Honest tradeoff, correctly fenced.
- **Synthetic fixtures vs. captured live payload.** Optimizes for shipping without a live probe blocking the
  pipeline; sacrifices real-shape confidence (see §1 caveat and §4 risk). The tolerant-zod + degrade-to-empty
  discipline is the deliberate hedge that makes this tradeoff survivable.

## 3. Architecture & fit

Strong fit. The change is a faithful sibling of the existing tournament path: same browser-like `User-Agent`
header reuse (`BASE`/`FIFA_HEADERS` extracted from `client.ts`), same zod-at-the-boundary discipline, same
cache shape (Map-keyed, liveness-tiered TTL, single-flight, stale-on-error), same `ApiEnvelope`/`ok`/`fail`
contract, same TanStack Query lazy-hook pattern. Files are small and focused (the 800-line ceiling is never
approached; the mapper splits helpers into `match-detail-stats.ts`, `win-probability.ts`, `event-labels.ts`).

The **module boundary is the spine and it holds**: `@` maps to `./src` only, zero `src/ → server/` imports
(grep-confirmed), shared types in `src/domain/types/`, the shared `DETAIL_UNAVAILABLE` constant canonically in
`@/data/detail-codes` reached by both the server route and the client hook. This was the blocker the plan
reviewer raised across all three prior rounds; it is genuinely resolved, not papered over. No new friction or
inconsistency introduced.

## 4. Tech debt & risks

- **(HIGH, latent) Undocumented FIFA endpoints, never observed live.** The two detail endpoints are
  undocumented and the implementation was written against synthetic fixtures. If real field names differ
  (e.g. starter/bench flag, picture URL nesting, possession units, formation key), the feature degrades to
  *empty* (graceful — no crash) but silently *wrong-or-blank*, with no alert. The tolerant schemas protect
  uptime, not correctness. **This is the top post-ship risk.**
- **(MEDIUM) `IdStage` capture is real but unverified against a live calendar row.** The mapper now captures
  `IdStage` from the calendar schema and builds `providerRef` from it, with a correct `null`-fallback if absent
  (`mapper.ts:114`, both branches tested). But the carried L-A/L-1 risk stands: *if live `/calendar/matches`
  rows do not actually carry `IdStage`*, every FIFA match resolves to `providerRef: null` and the feature is
  "dark" (universally `DETAIL_UNAVAILABLE`) — no crash, but no data either. One live probe retires this.
- **(LOW) Win-probability magic constants are uncalibrated** and live inline. Fine as a labeled estimate;
  would need real data if it ever becomes load-bearing.
- **(LOW) Inactive tabs' `aria-controls` reference non-rendered panel ids** (stage-6 L-1). Only the active
  `tabpanel` is in the DOM; the two inactive tabs point at ids that don't exist. Most AT tolerates the dangling
  reference; APG prefers it resolve. Cosmetic-a11y, non-blocking.
- **(LOW) No `coverage.thresholds` block** (stage-6 L-3). The ≥80% AC is enforced by observation (95.89%
  actual), not by a failing gate, so a future regression below 80% would not break CI.
- **(LOW) Dead `IdGroup` capture** in the calendar schema (stage-6 L-2) — captured, never consumed.
- **Security/performance posture (system level):** no secrets, no `console.log`, no `dangerouslySetInnerHTML`.
  Headshots are hotlinked from `digitalhub.fifa.com` with `referrerPolicy="no-referrer"` + `loading="lazy"` +
  explicit `width`/`height` + initials `onError` fallback. The 4MB payload cap bounds memory. On-demand
  per-match fetch + per-match cache + live-only `refetchInterval` bounds the FIFA call rate. Bundle is within
  budget (71 kB gzip entry). No regressions.

## 5. Test & quality posture

Confidence is **high at the unit/component layer, moderate at the live-integration layer**.

- **Strong:** pure logic is exhaustively pinned — mapper (28), event labels (14), stats derivation (8),
  win-probability incl. all three sum-to-100 overflow directions (9), formation layout (5), view helpers (14),
  cache behaviours (8), route incl. single-flight + unavailable + 429-mapping (9), tabs ARIA + keyboard (18),
  panel a11y guards (13). 281 total, all green. 95.89% line coverage. The tests assert behaviour (correct
  minute/side/player, null omitted, higher emphasized, labeled-or-absent), not just rendering.
- **Thin:** (a) no live FIFA contract test — everything upstream of the mapper is synthetic; (b) E2E not
  executed in this environment, so the real browser slide-in/tab-switch/Escape path is unverified end-to-end;
  (c) win-probability is tested for invariants (sums, labeling, null) but not for output *reasonableness*
  against realistic match states beyond a few cases.

This is the correct shape for the constraints (can't hit live FIFA in CI), but the suite's signal stops at the
boundary the synthetic fixtures define.

## 6. Follow-ups

**Must-do before trusting this against real data:**
1. **Capture one real `/live/football/...` and one `/timelines/...` payload** from a finished 2026 fixture;
   diff field names against the synthetic fixtures and adjust accessors only. Retires the top HIGH risk.
2. **Live-probe one `/calendar/matches` row for `IdStage`.** If absent, derive `idStage` from the stage list
   so FIFA matches don't go dark. Retires the MEDIUM risk.

**Nice-to-have:**
3. Run the Playwright smoke spec in an environment with browsers; wire `test:e2e` into CI once stable.
4. Add a `coverage.thresholds` block (e.g. 80% lines/branches) so the ≥80% AC self-enforces.
5. Fix inactive-tab `aria-controls` — render all three panels with `hidden`, or emit `aria-controls` only for
   the active tab.
6. Remove the dead `IdGroup` calendar capture (or wire it).
7. If win-probability ever becomes prominent, calibrate the constants against historical outcomes or replace
   with a documented model.

## Verdict

**SHIP WITH CAVEATS.**

The implementation is complete, faithful, well-tested at the unit/component layer, architecturally consistent,
and all four gates (test / typecheck / build / coverage) are green on independent re-run. The module boundary
blocker that dogged three planning rounds is genuinely resolved.

The caveats are integration-confidence, not code-quality:

- **C1 — Correctness against real FIFA payloads is unproven.** Everything is built on synthetic fixtures;
  tolerant schemas guarantee no-crash, not no-blank. Capture a live payload before relying on the data
  (follow-up 1).
- **C2 — `IdStage` presence in live calendar rows is unverified.** If absent, the feature is silently dark for
  all FIFA matches (graceful, but empty). One probe retires this (follow-up 2).
- **C3 — E2E unexecuted here.** The real browser flow is covered only by jsdom component tests; run Playwright
  where browsers exist (follow-up 3).

None of these block a ship behind the existing graceful-degradation behavior; all three are concrete, cheap to
close, and already flagged in the plan's Risks section. Ship it, then run the two live probes promptly.
