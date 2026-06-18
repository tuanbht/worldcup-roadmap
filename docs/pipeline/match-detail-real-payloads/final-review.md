# Final Review — match-detail real payloads

**Stage 7 — strategic / holistic assessment**
Scope: rework the match-detail data layer so the REAL FIFA `/live/football` + `/timelines`
payloads validate at the zod boundary and map to a populated `MatchDetail`, so the
three-tab right sidebar (Timeline / Lineups / Stats) actually fills.

---

## 0. Observed final state (re-run, not taken on trust)

| Gate | Command | Observed result |
|---|---|---|
| Tests | `npm run test` (vitest run) | **32 files, 357 tests — all pass** (3.28s) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **clean, exit 0** |
| Build | `npm run build` (vite) | **built in 1.08s, exit 0** |

The new real-payload integration spec (`match-detail-integration.test.ts`, 11 tests) and the
rewritten mapper spec (`match-detail-mapper.test.ts`, 31 tests) both pass. No lint script exists
in `package.json` (only `format` / `format:check` via prettier), so there is no lint gate to run.

I independently re-derived the ground-truth facts from the raw JSON rather than trusting the
prior stages:

- Fixtures are **byte-identical** to the captured ground truth (`diff -q` of both
  `__fixtures__/match-detail.{live,timeline}.json` vs `docs/fifa-real-payloads/*.sample.json` → IDENTICAL).
- Timeline has **80 events**; distinct labels match the README (Goal! ×2, Assist ×2, Yellow card ×3,
  Red card ×3, Substitution ×9, VAR ×1, Attempt at Goal ×19, Corner ×4, Foul ×18, Offside ×2, plus
  Coin Toss / Start/End Time / Delay / Resume / Goal Prevention / Match end).
- Per-side stat split re-counted from raw `IdTeam`: home shots **16** / away **3**, fouls **10/8**,
  corners **3/1**, offsides **1/1** — exactly the asserted `FACTS`.
- Lineups: **11 starters/side** (`Status===1`), formations **home 4-1-2-3 / away 5-3-2** from `Tactics`.
- Possession: `BallPossession` **null** AND `TerritorialPossesion` **null** → correctly mapped to `null`.
- Coaches roles: home `[1,0,1]` (Role-0 head coach is NOT `Coaches[0]`), away `[0,1]` — the mapper
  picks `Role===0`, so Mexico's head coach resolves to Javier AGUIRRE, not the assistant Rafael MARQUEZ.
- VAR event at 82' carries **no IdTeam** (teamless) and is still surfaced into the timeline.

---

## 1. Requirement satisfaction

Judged against `requirements/match-detail-panel.md` (honoring the plan's documented, codebase-grounded
divergences from the synthetic fixtures).

**Delivered — the root cause is fixed.** The regression was: schema built for synthetic shapes →
`zod.parse` threw on the real payload → section null → empty panel. The rewritten lenient schema
(`rawMatchLiveSchema` / `rawTimelineSchema`) now **accepts** the captured payloads without throwing
(proven by the integration spec, and schema is at 100% coverage per the impl-review), and the pure
mapper produces a populated `MatchDetail`: events, both lineups with formation/starters/captain/photo,
and derived stats. The end-to-end integration test is the concrete "sidebar fills" proof
(`events.length > 0`, `home/away.starters` length 11, formations set, a goal + a card with a
lineup-resolved name, stats derived).

Acceptance-criteria mapping:

- **Schema validates + degrades (AC: "FIFA payloads zod-validated; missing/blocked → empty state"):**
  Met. Every field `.optional()/.nullable()`, every object `.passthrough()`; the fetch wrapper
  (`match-detail-client.ts`) wraps `parse` in try/catch and returns `null` on HTTP/oversized/invalid/
  schema failure. Both real payloads parse cleanly.
- **Timeline (goal/card/sub with correct minute, side, player):** Met. Events mapped by
  `TypeLocalized` label (never numeric `Type`); `MatchMinute` string parsed to base minute
  (`"90'+2'"` → 90); `IdTeam` → home/away; player names resolved through the lineup map (real events
  carry no `PlayerName`). Substitution `relatedName` = player ON; assist `relatedName` = paired scorer.
- **Lineups (starters on a formation pitch, shirt #, captain, headshots):** Met at the data layer.
  Formation from `Tactics`, 11 starters via `Status===1`, captain flag, `positionIndex` ordered GK-first
  (`(Position ?? 9)*100 + ShirtNumber`) so `formation-layout.ts` places the keeper correctly, real
  `digitalhub.fifa.com` photo URLs passed through.
- **Stats (possession + derived shots/corners/fouls/offsides/cards; omit unavailable; labeled win prob):**
  Met. Counts derived from raw timeline labels per side; passes/passAccuracy/shotsOnTarget stay `null`
  (never faked 0); possession `null` (no faked figure); win probability is a labeled estimate summing
  to 100 or omitted.
- **Mock / DETAIL_UNAVAILABLE path:** Preserved. Route returns typed `DETAIL_UNAVAILABLE` on null
  `providerRef`; route tests pass.

**Partial / deferred (honest notes):**

- **No live end-to-end proof.** Correctly out of scope — the task forbids hitting live FIFA, and the
  captured fixtures are the contract. The implication: this proves the panel fills *for this one
  captured fixture* (match 400021443, a fully-played group match). Pre-match, in-play, knockout
  extra-time/penalties, and other fixtures are unproven against real data (see Risks).
- **Win-probability / panel rendering** were already implemented in prior work and are not re-validated
  visually here; this run is data-layer only. The Playwright tab-switching smoke from the requirement's
  verification section is not part of this run's gates.

---

## 2. Tradeoffs (the meaningful decisions)

1. **Lenient "accept-everything" schema vs. strict validation.**
   Chosen: maximal leniency (optional/nullable/passthrough/no refinements). This is the right call and
   is the whole point — the regression was *strictness rejecting real data*. The schema's only job is to
   not throw; correctness is the mapper's responsibility. **Sacrifice:** the schema provides almost no
   validation signal — a structurally wrong upstream change (e.g. `Players` moves) will pass `parse`
   silently and surface as an empty section, not a loud error. Acceptable given the "never block the
   panel" requirement, but it means the *mapper* and its tests are now the real contract.

2. **Resolve event player names via the lineup map, not the event payload.**
   Real timeline events carry only `IdPlayer`; names come from `HomeTeam/AwayTeam.Players[].ShortName`.
   Correct and necessary. **Consequence:** an event for a player absent from the lineup arrays (e.g. a
   data gap) yields `playerName: null` — a graceful degradation the panel already tolerates.

3. **Adjacency-based assist→goal pairing over raw array order.**
   `IdAssistPlayer` is null in real data, so assists are paired with the next same-minute, same-side
   `Goal!`. Pragmatic and works for both real pairs. **Sacrifice / fragility:** depends on Assist
   preceding Goal! in array order within a minute (true here, documented in code). If FIFA reversed the
   order, `relatedName` would be null — graceful, not a crash (see L3).

4. **ShortName for events/related, full PlayerName for the lineup card.**
   The same player can read "RAÚL" in the timeline and "Raul JIMENEZ" on the pitch card. This is a
   deliberate, documented convention (display vs. formal name), matching what Google's card does. Worth
   noting because it looks like an inconsistency until you know it's intentional.

5. **Win probability computed-and-labeled, not omitted.**
   Matches the requirement's default ("compute + label estimate"). Tradeoff: it is a *model output*, not
   FIFA data — acceptable only because it is explicitly flagged `estimated: true` and never presented as
   official.

---

## 3. Architecture & fit

Strong fit. The change stays inside the established layered design: lenient zod at the provider
boundary → pure, side-effect-free mapper → stable domain types → cache → Hono route → TanStack Query
hook → panel. No new patterns invented.

- **Data-layer-only discipline held.** Mod-time inspection confirms only `match-detail-schema.ts`
  (14:18) and `match-detail-mapper.ts` (14:20) were edited in this run, plus fixtures/tests/support.
  Domain types (`match-detail.ts`, 12:14), `formation-layout.ts` (12:36), `MatchDetailPanel.tsx` (13:02),
  and the route (12:45) **predate** this run and are unchanged — the panel/hook/route consume the same
  domain shape, so no field rename leaked upward. This is exactly the constraint the task set.
- Files are small and cohesive: schema 130, mapper 429, event-labels 45, stats 66 lines — all well
  under the 800 cap, single-responsibility.
- Immutability and explicit-degradation conventions are honored; no `console.log` anywhere in the fifa
  data layer; no secrets.

One mild friction point: the mapper at 429 lines is the heaviest file and concentrates a lot of
domain logic (side resolution, name resolution, enrichment, assist pairing, period labels, stats
glue). It is still readable and under budget, but it is the natural place future detail logic will
accrete; watch for it crossing into "extract a module" territory.

---

## 4. Tech debt & risks

**Undocumented-endpoint risk (inherent, called out in the requirement).** Both FIFA endpoints are
unofficial. The lenient schema is the right mitigation, but it converts "shape drift" into *silent
empty sections* rather than alerts. There is no telemetry/canary that would notice if, say, `Players`
moved or `Tactics` was renamed — the panel would just quietly stop populating. This is the single
biggest systemic risk and is by design unbounded.

**Single-fixture generalization.** Everything is proven against one fully-played group-stage match.
Untested-against-real-data conditions:

- **Pre-match / empty payloads** — covered by unit degradation tests (null/partial → empty) but not by
  a real empty FIFA capture.
- **Period codes** the mapper's `periodLabel` switch handles (half-time, full-time, extra-time,
  penalties) are absent from this fixture → those arms are unexercised (impl-review L1: mapper branch
  coverage 72.15%; statement 98.36%). Pure lookups, low risk, but a knockout match with ET/pens is
  unproven.
- **Own-goal / penalty-goal** classification (`classifyGoalKind`) relies on label/qualifier substrings
  ("own goal", "penalty") that don't appear in this fixture's two goals — covered only by synthetic
  label tests, not real data.

**Assist-pairing order assumption (L3)** — documented, degrades to `null` if violated. Acceptable.

**`match-detail-client.ts` at 0% coverage (impl-review L2).** The live fetch/parse/degrade wrapper
can't be exercised without hitting FIFA (forbidden). Its degradation branches (`!res.ok`, oversized,
JSON throw, schema throw → null) are untested. Low risk (small, defensive, try/catch-wrapped) but it is
the exact seam where a real upstream change lands, so it is the most valuable place to add a
mocked-`fetch` unit test.

**Security/performance posture (system level):** clean. No secrets; the only network surface is the
existing FIFA client with a browser-like UA; a 4 MB byte cap guards against pathological payloads before
zod runs; per-match cache (liveness-tiered TTL) absorbs refetch storms; mapper is pure and O(events).
Photo URLs are external (`digitalhub.fifa.com`) and rendered lazily by pre-existing panel code.

---

## 5. Test & quality posture

Confidence in the change: **high for the captured shape, medium for the long tail.**

**Strong:**
- The integration test is a genuine end-to-end contract over the *production path*
  (`schema.parse → mapFifaMatchDetail`), not a mock of it — it is the real "sidebar fills" proof and a
  durable regression guard against the original parse-throw bug.
- The mapper spec (31 tests) asserts specific, independently-verified ground truth: exact scorers,
  minutes, sides, stoppage-time collapse, captain/coach/keeper identity, per-side stat counts,
  Goal.Type===2-not-own-goal, and graceful degradation for all three null combinations.
- `FACTS` are centralized in `match-detail.support.ts` (single source), so the integration and mapper
  specs can't drift apart, and fixtures are byte-copies of the ground truth.
- Coverage on the three changed pure files is high (schema 100, stats 100, event-labels 100 per
  impl-review); overall 96%+.

**Thin:**
- One real fixture only — no real pre-match/knockout/ET/penalty capture.
- `periodLabel` ET/HT/FT/pens arms and own-goal/penalty-goal classification are unexercised by real data.
- The fetch wrapper's degradation branches are untested (network forbidden).
- This run does not re-validate the panel rendering or the Playwright tab-switch smoke; it is correctly
  scoped to the data layer, but "the user sees a filled sidebar" is inferred from the data contract +
  unchanged consumer code, not re-screenshotted here.

---

## 6. Follow-ups (prioritized)

**Must-do (before relying on this in production across all fixtures):**

1. **Add a mocked-`fetch` unit test for `match-detail-client.fetchSection`** covering the four
   degradation branches (non-200, oversized, invalid JSON, schema throw → null). Closes the 0%-coverage
   gap on the exact seam where undocumented-endpoint drift surfaces. Concrete, fast, no network.
2. **Capture a second real fixture from a different match state** — ideally a knockout match with
   extra-time and/or penalties, plus one pre-match (empty) payload — and run them through the same
   integration harness. This is what actually de-risks the single-fixture generalization (period labels,
   pens, empty-state).

**Nice-to-have:**

3. **Add lightweight drift detection** for the lenient schema: a tiny assertion (in the client or a
   monitored log) that at least one of `HomeTeam.Players` / `timeline.Event` is non-empty for a
   *played* match, so a future shape change becomes visible instead of silently emptying the panel.
4. **Table-test `periodLabel`** across all FIFA period codes (3–11) to close the branch-coverage gap on
   the ET/HT/FT/pens arms (impl-review L1) — pure lookups, trivial.
5. **Real-data test for own-goal / penalty-goal classification** once a fixture containing one is
   captured (currently only synthetic-label coverage).
6. **Re-run the Playwright tab-switch smoke** from the requirement's verification section against a
   played FIFA match to confirm the visual sidebar fills end-to-end (out of this run's data-layer scope).
7. **Watch `match-detail-mapper.ts` (429 lines)** — if more detail logic accrues, extract the name
   resolution / enrichment helpers into a sibling module before it approaches the 800-line cap.

---

## Verdict

**SHIP WITH CAVEATS.**

The root-cause regression is genuinely fixed: the lenient schema accepts the real FIFA payloads, the
mapper produces a fully populated `MatchDetail`, and an end-to-end integration test over the production
path proves the sidebar fills. All gates re-run green (357 tests, typecheck clean, build clean). The
change is correctly confined to the data layer; consumers are untouched.

Caveats (none blocking; all are scope-honest, not defects):

- Proven against **one** captured fixture (a played group match). Pre-match, knockout extra-time/
  penalties, and own-goal/penalty-goal paths are unexercised by real data — generalization across all
  fixtures is inferred, not demonstrated.
- The lenient schema turns upstream shape drift into **silent empty sections** with no alerting; the
  undocumented endpoints can change without notice.
- The live fetch/degrade wrapper (`match-detail-client.ts`) has **0% coverage** (network forbidden in
  tests) — the exact seam where drift would land.

Address follow-ups 1 and 2 to convert this from "fills for the captured match" to "robust across match
states."
