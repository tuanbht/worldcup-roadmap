# Implementation Review — match-detail real payloads

**Verdict: APPROVED**

The data layer was reworked exactly as the plan and requirement demand: the lenient zod
schema now ACCEPTS the captured real FIFA `/live/football` and `/timelines` payloads (the
root-cause regression — parse-throw → null section → empty panel), and the pure mapper
produces a fully populated `MatchDetail` (events, lineups, derived stats). All gates pass.
The fix is confined to the data layer; domain types, panel/components, hooks, and routes are
untouched.

## Observed gate results

| Gate | Command | Result |
|---|---|---|
| Tests | `npm run test` | 32 files, **357 tests, all pass** |
| Coverage | `npm run test:coverage` | **96.17%** lines overall; changed files: schema 100/100, mapper 98.36/72.15, stats 100/100, event-labels 100/100 |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | clean |
| Build | `npm run build` (vite) | built in ~1.1s, no errors |
| Lint | n/a | no `lint` script in package.json |

No live FIFA network access in any test (fixtures are byte-copies). No `console.log` in the
fifa data layer. All changed files < 800 lines (schema 130, mapper 429, labels 45, stats 66).

## Verification against acceptance criteria

Ground-truth facts independently re-derived from the raw JSON and cross-checked against the
implementation and `FACTS` in `match-detail.support.ts`:

- **Schema accepts (AC 1–2):** `rawMatchLiveSchema.parse` and `rawTimelineSchema.parse` do
  not throw; top-level `BallPossession: null` and `TerritorialPossesion: null` accepted;
  unknown fields (`Officials`, `Stadium`, `Weather`, `Qualifiers`, `IdSubTeam`) survive via
  `.passthrough()`. Verified by integration spec + schema 100% coverage.
- **Events > 0 (AC 3):** 80 raw events map to a populated, chronologically-sorted list;
  counting labels (`Attempt at Goal`/`Corner`/`Foul`/`Offside`/`Goal Prevention`/`Coin Toss`/
  `Delay`/`Resume`/`Match end`) correctly excluded.
- **11 starters / side (AC 4):** `Status === 1` → 11 each (15 bench), confirmed from payload.
- **Formations (AC 5):** home `4-1-2-3`, away `5-3-2` read from `Tactics` — both verified.
- **Goal + card with lineup-resolved name (AC 6):** Quiñones 9', RAÚL 67' (both home, `Type 2`
  NOT treated as own-goals); names resolved from the lineup `ShortName` map (events carry no
  `PlayerName`). RAÚL's formal `PlayerName` is "Raul JIMENEZ" yet the mapper correctly surfaces
  the display `ShortName` "RAÚL" — verified in the payload.
- **relatedName (AC 7):** substitution `relatedName` = player ON via live `PlayerOnName`
  (GUTIERREZ off → CHAVEZ on, keyed by `IdPlayerOff`); assist `relatedName` = paired scorer via
  adjacent same-minute same-side `Goal!` (Assist precedes Goal! in array order at both 9'/67' —
  forward-scan pairing is sound). Does not depend on the null `IdAssistPlayer`.
- **Badges from per-team Goals (AC 8):** scorers credited from `HomeTeam.Goals[]` (Quiñones 1,
  RAÚL 1); `AwayTeam.Goals === []`; no top-level `Goals` lookup.
- **Derived stats (AC 9):** home shots 16, corners 3, fouls 10, offsides 1; away shots 3,
  corners 1, fouls 8, offsides 1 — all re-counted from the raw timeline and matching.
  `possession === null` (no faked figure); passes/passAccuracy/shotsOnTarget null.
- **positionIndex (AC 10):** `(Position ?? 9)*100 + ShirtNumber` orders GK (Position 0) first;
  consumed by `formation-layout.ts:64` sort. Verified.
- **Coach Role 0 (AC 11):** home `Javier AGUIRRE` (Mexico lists assistant Rafael MARQUEZ Role 1
  FIRST — `Coaches[0]` would be wrong), away `Hugo BROOS`. Verified against payload roles.
- **Label mapping (AC 12):** all real labels map; `Match end → null` pinned deterministically.
- **Graceful degradation (AC 13):** `(null,null,ref)` → `EMPTY_MATCH_DETAIL`; `(live,null,ref)`
  → empty events, populated lineups/formation; `(null,timeline,ref)` → empty events (no sides
  to resolve). All tested.
- **Integration test (AC 14):** `match-detail-integration.test.ts` runs both captured payloads
  through schema + mapper and asserts a populated detail (the sidebar-fills proof).
- **No out-of-scope edits (AC 15):** `src/domain/types/match-detail.ts`, `formation-layout.ts`,
  `MatchDetailPanel.tsx`, `win-probability.ts`, `match-detail-client.ts`, the Hono route, and
  `match-detail-stats.test.ts` all predate this work's edits (mod-time verified) and are
  unchanged. `DETAIL_UNAVAILABLE` mock path intact (route tests pass).
- **Gates (AC 16):** test/typecheck/build all green; no live FIFA; no `console.log`.

## Findings

No CRITICAL or HIGH issues.

### MEDIUM
None blocking.

### LOW

- **L1 — mapper branch coverage 72.15%.** Uncovered lines are the `periodLabel` switch arms
  (62,66,69,71,73) for FIFA `Period` codes absent from this single fixture (extra-time,
  penalties, half-time, full-time). Statement coverage is 98.36% and the data-layer total comfortably
  exceeds the 80% bar; these are pure, side-effect-free lookups. Optional: a tiny table-test over
  `periodLabel` would close the gap. Not blocking.
- **L2 — `match-detail-client.ts` shows 0% coverage.** This is the live-network fetch wrapper
  (out of scope, untouched, predates this work). It cannot be exercised without hitting live
  FIFA, which the task forbids. The schema fix means real payloads no longer throw at its
  `parse` boundary. Acceptable as-is; if desired, `fetchSection`'s degradation branches could
  be unit-tested with a mocked `fetch`. Not blocking.
- **L3 — assist pairing assumes Assist precedes Goal! in array order** within the same minute
  (true for both real pairs). If FIFA ever reversed the order, the forward-scan would miss the
  scorer and `relatedName` would be null — a graceful, non-crashing degradation, and the code
  comments document the assumption. Acceptable for the captured shape.

## Conclusion

The implementation resolves the root cause (zod rejecting the real payload), maps every
required field correctly with names resolved from the lineup, derives stats from the real
event shape, and degrades gracefully — all proven by an end-to-end integration test over the
captured ground-truth payloads. Tests, typecheck, and build are green.

**VERDICT: APPROVED**
