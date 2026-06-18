# Plan: Make the match-detail sidebar populate from REAL FIFA payloads

> Revision #2 — resolves every Required Change in `plan-review.md`
> (H1 assist-name resolution, H2 lineup name re-pointing, M1 `Match end`,
> M2 exact stoppage strings, M3 per-team Goals). See the "Review resolutions"
> callouts inline and the dedicated section at the end.

## Scope

### In scope
Rework the FIFA **data layer** so the captured real `/timelines` and `/live/football` payloads
validate (lenient zod) and map to a populated `MatchDetail` (events, lineups, derived stats):

- `src/data/providers/fifa/match-detail-schema.ts` — rewrite `rawTimelineSchema` + `rawMatchLiveSchema` to the REAL field names, fully lenient (accept-everything).
- `src/data/providers/fifa/match-detail-mapper.ts` — map real `Event[]`, real `HomeTeam/AwayTeam.Players`, real per-team `Goals/Bookings/Substitutions/Coaches`, real possession fallback; resolve all event player names via a lineup `IdPlayer→name` map; resolve assist `relatedName` by pairing each timeline `Assist` with the adjacent same-side `Goal!`.
- `src/data/providers/fifa/event-labels.ts` — cover the real `TypeLocalized` labels (incl. an explicit `Match end → null` decision) + own-goal/penalty refinement via label/qualifier text.
- `src/data/providers/fifa/match-detail-stats.ts` — confirm/adjust derivation against the real label set (no shape change expected; `StatEvent[]` is shape-independent).
- Replace synthetic fixtures `__fixtures__/match-detail.{live,timeline}.json` with the captured real payloads; update `match-detail-mapper.test.ts`, `event-labels.test.ts` to assert the real shape. (`match-detail-stats.test.ts` stays untouched — it exercises the pure `deriveTeamStats` over synthetic `StatEvent[]`.)
- New integration test proving a populated `MatchDetail` end-to-end (schema → mapper).

### Out of scope (do NOT touch)
- Domain type surface `src/domain/types/match-detail.ts` — **stays byte-identical** (events/lineups/stats interfaces are already correct; keeping them stable means the panel/formation-layout need no changes).
- `MatchDetailPanel` + `match-detail/*` components, `formation-layout.ts`, `useMatchDetailQuery`, the Hono route, `match-detail-client.ts` (fetch path already correct), `win-probability.ts` (already correct, only consumes derived numbers).
- Live FIFA network calls in tests — forbidden; only the captured fixtures are used.
- `Match.providerRef` / `DETAIL_UNAVAILABLE` mock path — already correct; the null-payload degradation test stays.

## Approach

The bug is purely a **shape mismatch at the zod boundary**: the schema/mapper were written against the requirement's *documented* field names but the live FIFA payload diverges in several places (below). Because `fetchSection` calls `schema.parse` and swallows the throw to `null` (verified `match-detail-client.ts:28-38`), every real payload silently becomes `null` and the panel renders empty. The fix keeps the existing pure-mapper architecture and stable domain types, and only corrects (a) the lenient schema field names and (b) the mapper's accessors, then swaps the fixtures for ground-truth payloads and re-asserts. I keep `.passthrough()` + `.optional()/.nullable()/.catch()` everywhere so unknown/extra fields and nulls never reject — the schema's job is to *accept*, the mapper's job is to *degrade*.

**Verified divergences (confirmed against `docs/fifa-real-payloads/{timeline,live}.sample.json`):**
1. **Possession**: `BallPossession` is top-level **`null`**; `TerritorialPossesion` is **`null`** too. There is no `OverallHome/Away`. → schema makes `BallPossession`/`TerritorialPossesion` accept `null` OR an object; mapper reads `OverallHome/Away` when present, else falls back to `TerritorialPossesion`, else `null` (omit). Possession is **`null`** for this match.
2. **Starter flag**: `Status: 1` = starter (×11 each side, confirmed), `Status: 2` = bench. `FieldStatus` is `0` (not the flag). Keep `isStarter = Status === 1`.
3. **`positionIndex` BUG**: mapper sets `positionIndex = ShirtNumber`. `formation-layout.ts:64` sorts starters by `positionIndex` (lowest = GK) to place them on the pitch — shirt number scrambles outfield order. Real players carry numeric `Position` (0=GK,1=DEF,2=MID,3=FWD), confirmed. → set `positionIndex = (Position ?? 9) * 100 + (ShirtNumber ?? 0)`.
4. **Goal `Type` BUG**: mapper excludes `Goals[].Type === 2` as "own goal", but in the REAL live payload **both legit Mexico goals have `Type: 2`** (confirmed: Quiñones 9', RAÚL 67') → they'd be dropped from the scorer tally. Stop using `Type` to detect own goals. Credit every per-team `Goals[]` entry to its `IdPlayer`; detect own-goal/penalty only from the **timeline** event's label/`Qualifiers`.
5. **Live `Substitutions[]`** use `IdPlayerOff`/`IdPlayerOn` + **`PlayerOffName`/`PlayerOnName`** (both present and populated — e.g. Brian GUTIERREZ off / Luis CHAVEZ on). → schema adds `PlayerOffName`; substitution event `relatedName` (player ON) resolves from these live subs keyed by `IdPlayerOff`.
6. **Timeline `Substitution` events** use a DIFFERENT convention: `IdPlayer` = player coming **ON**, `IdSubPlayer` = player going **OFF**, `IdSubTeam` present (confirmed: `"L.CHAVEZ (in) ... replace Brian GUTIERREZ (out)"`). Timeline carries NO per-event `PlayerName`. → the event's primary `playerId` is set to the OFF player (`IdSubPlayer`) and its `playerName` resolved from the lineup; `relatedName` = the ON player, resolved from live `Substitutions[]` keyed by `IdPlayerOff` (so the panel reads "X off / Y on", matching the existing `relatedName` = player-coming-on convention).
7. **Event player names**: real timeline events have **NO `PlayerName` field** — only `IdPlayer`. Names MUST be resolved from the lineup. (See H2 resolution.)
8. **Coaches**: real `Coaches[]` carry `Role` (0 = head coach, 1 = assistant) + `Alias` (short) + `Name`. Confirmed home Mexico lists **Role:1 (Rafael MARQUEZ) FIRST**, then Role:0 (Javier AGUIRRE) — so reading `Coaches[0]` picks the WRONG coach. Away South Africa lists Role:0 (Hugo BROOS) first. → pick `Coaches.find(Role === 0) ?? Coaches[0]`, name = `pickLocale(Alias) ?? pickLocale(Name)` → home `Javier AGUIRRE`, away `Hugo BROOS`.
9. **MatchMinute** stoppage forms are exactly `"45'+2'"`, `"90'+7'"`, `"90'+2'"` (Montes red), `"45'+5'"`, `"90'+8'"` (confirmed). `parseMinute`'s `/\d+/` extracts the base integer — keep. (See M2 for fixture/assertion exactness.)

**Rejected alternative:** change the *domain* `MatchDetail` types and rewrite the panel to consume raw FIFA fields directly. Rejected because the domain types already match the requirement and the panel/formation-layout already work against them; widening the blast radius to the UI layer adds risk and contradicts the task constraint ("only fix the data layer").

## Files

| Path | Action | Responsibility |
|---|---|---|
| `src/data/providers/fifa/match-detail-schema.ts` | modify | Lenient zod for real `/timelines` (`Event[]` incl. `EventId, IdTeam, IdPlayer?, IdSubPlayer?, IdSubTeam?, MatchMinute(string), Period(number), Type, Qualifiers, TypeLocalized, EventDescription, VarNotificationData?, HomeGoals, AwayGoals, PositionX/Y?`) + real `/live/football` (`HomeTeam/AwayTeam`: `IdTeam, Tactics, TeamName, Players[], Coaches[], Goals[], Bookings[], Substitutions[]`; top-level `BallPossession`/`TerritorialPossesion` nullable-or-object). All `.optional().nullable()` + `.passthrough()` so the real payload always validates. |
| `src/data/providers/fifa/match-detail-mapper.ts` | modify | Build a `lineupName` map (`IdPlayer→name`) from BOTH squads' `Players[]`; map events (parse minute, label→kind, `IdTeam→side`, **name via `lineupName`**, substitution `relatedName` from live subs, **assist `relatedName` via adjacent-Goal pairing**); map lineups (`Players` split by `Status`, `positionIndex` from `Position`, captain, photoUrl, shirt#, formation=`Tactics`, coach via `Role`); badges from **per-team `Goals/Bookings/Substitutions`**; derive stats; possession fallback. **Remove both `raw.PlayerName` accessors (lines 244 and 285-290).** |
| `src/data/providers/fifa/event-labels.ts` | modify | `LABEL_TO_KIND` covers the real labels; **`'match end' → null` (explicit, documented)**; counting/ignored labels stay `null`. `classifyGoalKind` reads label/qualifier text for own-goal/penalty. |
| `src/data/providers/fifa/match-detail-stats.ts` | modify (no-op likely) | Confirm shot=`attempt at goal`, corner/foul/offside/card counting against real labels. `Goal Prevention`/`Coin Toss`/`Delay`/`Resume`/`VAR`/`Match end` not counted. |
| `src/data/providers/fifa/__fixtures__/match-detail.live.json` | replace | Byte-copy of `docs/fifa-real-payloads/live.sample.json` (real Mexico v South Africa lineups). |
| `src/data/providers/fifa/__fixtures__/match-detail.timeline.json` | replace | Byte-copy of `docs/fifa-real-payloads/timeline.sample.json` (real 80-event timeline). |
| `src/data/providers/fifa/match-detail-mapper.test.ts` | rewrite | Assert against the REAL shape (counts, names from lineup, formation, starters=11, possession null, label mapping, badges from per-team Goals, substitution/assist relatedName, graceful null path). Update `REF.idMatch` to `'400021443'`. |
| `src/data/providers/fifa/event-labels.test.ts` | modify | Add real labels (`Goal!`, `Red card`, `Substitution`, `VAR`, `Start Time`, `End Time`) and a **deterministic `Match end → null` assertion**; confirm counting labels (`Attempt at Goal`, `Corner`, `Foul`, `Offside`, `Goal Prevention`, `Coin Toss`, `Delay`, `Resume`) return `null`. |
| `src/data/providers/fifa/match-detail-stats.test.ts` | unchanged | Pure `deriveTeamStats` over synthetic `StatEvent[]`; shape-independent. No change (review L2). |
| `src/data/providers/fifa/match-detail-integration.test.ts` | create | NEW: run BOTH captured real payloads through `rawMatchLiveSchema.parse` + `rawTimelineSchema.parse` + `mapFifaMatchDetail` and assert a POPULATED `MatchDetail` (the sidebar-fills proof). |

## Data Model / Types

**Domain types unchanged** (`src/domain/types/match-detail.ts` stays identical). Only the lenient *raw* schemas change. Target raw shapes (all fields `.optional().nullable()`, objects `.passthrough()`):

```ts
// --- /timelines ---
const localized = z.array(z.object({ Locale: z.string(), Description: z.string() }).passthrough()).optional();

const rawTimelineEvent = z.object({
  EventId: z.union([z.string(), z.number()]).nullable().optional(),
  IdTeam: z.string().nullable().optional(),
  IdPlayer: z.string().nullable().optional(),
  IdSubPlayer: z.string().nullable().optional(),     // timeline sub: player OFF
  IdSubTeam: z.string().nullable().optional(),
  MatchMinute: z.string().nullable().optional(),     // "4'", "45'+2'"
  Period: z.number().nullable().optional(),
  Type: z.number().nullable().optional(),
  Qualifiers: z.array(z.unknown()).nullable().optional(),
  TypeLocalized: localized,                          // event LABEL source
  EventDescription: localized,
  HomeGoals: z.number().nullable().optional(),
  AwayGoals: z.number().nullable().optional(),
}).passthrough();

export const rawTimelineSchema = z.object({
  IdMatch: z.string().nullable().optional(),
  Event: z.array(rawTimelineEvent).nullable().optional(),
}).passthrough();

// --- /live/football ---
const rawPlayer = z.object({
  IdPlayer: z.string().nullable().optional(),
  IdTeam: z.string().nullable().optional(),
  ShirtNumber: z.number().nullable().optional(),
  Status: z.number().nullable().optional(),          // 1 starter, 2 bench
  Position: z.number().nullable().optional(),        // 0 GK..3 FWD → positionIndex
  Captain: z.boolean().nullable().optional(),
  PlayerName: localized,
  ShortName: localized,
  PlayerPicture: z.object({ PictureUrl: z.string().nullable().optional() }).passthrough().nullable().optional(),
}).passthrough();

const rawCoach = z.object({
  Role: z.number().nullable().optional(),            // 0 = head coach
  Name: localized,
  Alias: localized,
}).passthrough();

const rawGoal = z.object({
  IdPlayer: z.string().nullable().optional(),
  IdAssistPlayer: z.string().nullable().optional(),  // NULL in real data
  Type: z.number().nullable().optional(),            // NOT used for own-goal detection
  Minute: z.string().nullable().optional(),
}).passthrough();

const rawBooking = z.object({
  IdPlayer: z.string().nullable().optional(),
  Card: z.number().nullable().optional(),            // 1 yellow, 2 second-yellow(→red)
  Minute: z.string().nullable().optional(),
}).passthrough();

const rawSubstitution = z.object({
  IdPlayerOff: z.string().nullable().optional(),
  IdPlayerOn: z.string().nullable().optional(),
  PlayerOffName: localized,
  PlayerOnName: localized,
  Minute: z.string().nullable().optional(),
}).passthrough();

const rawTeamSquad = z.object({
  IdTeam: z.string().nullable().optional(),
  Tactics: z.string().nullable().optional(),         // "4-1-2-3" formation
  TeamName: localized,
  Players: z.array(rawPlayer).nullable().optional(),
  Coaches: z.array(rawCoach).nullable().optional(),
  Goals: z.array(rawGoal).nullable().optional(),     // PER-TEAM (top-level has none)
  Bookings: z.array(rawBooking).nullable().optional(),
  Substitutions: z.array(rawSubstitution).nullable().optional(),
}).passthrough();

const possessionObj = z.object({
  OverallHome: z.number().nullable().optional(),
  OverallAway: z.number().nullable().optional(),
}).passthrough();

export const rawMatchLiveSchema = z.object({
  IdMatch: z.string().nullable().optional(),
  HomeTeam: rawTeamSquad.nullable().optional(),
  AwayTeam: rawTeamSquad.nullable().optional(),
  BallPossession: possessionObj.nullable().optional(),       // top-level null in real data
  TerritorialPossesion: possessionObj.nullable().optional(), // FIFA's spelling (one 's'); null in real data
}).passthrough();
```

### Mapper rules (concrete — every changed accessor named)

1. **Lineup name map (the central fix).** Build `lineupName: Map<string,string>` from BOTH squads' `Players[]`: for each player set `lineupName.set(IdPlayer, pickLocale(ShortName) ?? pickLocale(PlayerName))`. This is the single source for every event's player name (real events have no `PlayerName`).

2. **H2 — replace BOTH `raw.PlayerName` sites:**
   - `mapEvent`'s `playerName` (currently `match-detail-mapper.ts:244` `pickLocale(raw.PlayerName)`) → `lineupName.get(raw.IdPlayer ?? '') ?? null`. (For substitution events `raw.IdPlayer` is the ON player; use `raw.IdSubPlayer` (the OFF player) for the event's primary `playerId`/`playerName`, per divergence #6.)
   - The `scorerName` builder (currently `match-detail-mapper.ts:285-290`, sourced from `raw.PlayerName`) → **remove it entirely.** It is only used to feed the old `scorerByAssist` map, which is replaced by the adjacent-Goal pairing in rule 3. Goal-event `playerName` is resolved through `lineupName` like any other event.

3. **H1 — assist `relatedName` via adjacent-Goal pairing (no reliance on `IdAssistPlayer`).** `IdAssistPlayer` is `null` in real live `Goals[]`, so the old `scorerByAssist` map is dead. Instead, in a single pass over the *timeline* events (already sorted by original order, which is chronological): when an `Assist` event is immediately followed by (or shares the same minute + same side as) a `Goal!` event, set the assist event's `relatedName = lineupName.get(goalEvent.IdPlayer)` and (optionally) the goal event's own `relatedName = lineupName.get(assistEvent.IdPlayer)`. Confirmed pairs in the sample:
   - Assist 9' `IdPlayer 419518` (Erik LIRA) → Goal! 9' `IdPlayer 429157` (Quiñones). Assist `relatedName === 'Julian QUINONES'`.
   - Assist 67' `IdPlayer 403585` (Roberto ALVARADO) → Goal! 67' `IdPlayer 356731` (RAÚL). Assist `relatedName === 'RAÚL'` (or the lineup short name).
   Implementation note: iterate the raw timeline events in array order; for each `Assist` event, scan forward to the next event on the same side at the same `MatchMinute` whose label maps to `goal`. Resolve names via `lineupName`. This is deterministic and uses only the timeline + lineup (no `IdAssistPlayer`).

4. **`positionIndex = (Position ?? 9) * 100 + (ShirtNumber ?? 0)`** (GK lowest → forwards highest; shirt# is a stable, deterministic tiebreak within a line). *Intra-line L/R order is an approximation by shirt number — `LineupX/Y` is null in this payload (review L1).*

5. **Substitution `relatedName` (player ON):** from live `Substitutions[]` keyed by `IdPlayerOff`, value `pickLocale(PlayerOnName)` (present and populated in real data). The timeline sub event's `playerId`/`playerName` is the OFF player (`IdSubPlayer`).

6. **Coach:** `Coaches.find(c => c.Role === 0) ?? Coaches[0]`, name = `pickLocale(Alias) ?? pickLocale(Name)`. (Home Mexico lists Role:1 first; reading `Coaches[0]` would pick the wrong coach.)

7. **Possession:** `BallPossession?.OverallHome ?? TerritorialPossesion?.OverallHome ?? null` (and Away). Both null here → `null` (omitted). The `match-detail-mapper.ts:302-303` accessors `live?.BallPossession?.OverallHome` already read correctly once the schema accepts `null`; add the `TerritorialPossesion` fallback.

8. **M3 — Goal badge tally from PER-TEAM arrays.** Credit every `HomeTeam.Goals[].IdPlayer` / `AwayTeam.Goals[].IdPlayer` (drop the `Type === 2` exclusion entirely). `buildEnrichment(squad)` already iterates `squad.Goals` per team — keep that per-team iteration; the implementer must **not** regress to a top-level `Goals` lookup (there is no top-level `Goals`; `AwayTeam.Goals` is `[]`, `HomeTeam.Goals` has Quiñones + RAÚL).

## Test Strategy

### Behaviors to test

**Schema (boundary, lenient-accept) — integration test:**
- `rawMatchLiveSchema.parse(realLive)` does NOT throw; `rawTimelineSchema.parse(realTimeline)` does NOT throw.
- Extra/unknown fields (`Officials`, `Staffs`, `VarNotificationData`, `PositionX/Y`, `GoalGatePositionX/Y`, `Weather`, `Stadium`, `IdSubTeam`, `SpecialStatus`) survive via passthrough and never reject.
- Top-level `BallPossession: null` AND `TerritorialPossesion: null` are accepted.

**event-labels (unit):**
- Real labels map: `Goal!`→`goal`, `Assist`→`assist`, `Yellow card`→`yellow`, `Red card`→`red`, `Substitution`→`substitution`, `VAR`→`var`, `Start Time`/`End Time`→`period`.
- **M1 — `labelToKind('Match end')` returns `null` (deterministic assertion).**
- Counting/ignored labels → `null`: `Attempt at Goal`, `Corner`, `Foul`, `Offside`, `Goal Prevention`, `Coin Toss`, `Delay`, `Resume`.
- `classifyGoalKind` returns `own-goal`/`penalty-goal` from synthetic label text (`'Own Goal'`, `'Goal! (Penalty)'`), else `goal` (real sample has no own/penalty goals).

**mapper (unit, against real fixtures):** `REF.idMatch = '400021443'`.
- `matchId === '400021443'`.
- Events: maps Mexico's two goals (Quiñones 9', RAÚL 67') to `kind:'goal' side:'home'` with the minute and **`playerName` resolved from the lineup** (non-null). Cards: Sithole `red` 49' (away), Montes `red` `"90'+2'"`→minute 90 (home), GUTIERREZ `yellow` 23' (home). Substitutions mapped with `relatedName` = player ON (e.g. off=Brian GUTIERREZ → on='Luis CHAVEZ'). `VAR` event mapped (82'). `Assist` events (9', 67') mapped to home with `relatedName` = the paired scorer (H1).
- Non-domain labels excluded from `events` (`Attempt at Goal`/`Corner`/`Foul`/`Offside`/`Goal Prevention`/`Coin Toss`/`Delay`/`Resume`/`Match end`).
- Events sorted by minute ascending.
- Lineups: `home.formation === '4-1-2-3'`, `away.formation === '5-3-2'` (read `Tactics` from the real sample; integration test asserts the home value as ground truth — the implementer must read the actual `AwayTeam.Tactics` string from the fixture and assert that literal). `home.starters.length === 11`, `away.starters.length === 11` (Status:1); bench = remaining (Status:2); captain flagged (Montes home, Williams away — read the actual captain from the fixture); shirt numbers read; at least one starter `photoUrl` contains `digitalhub.fifa.com`; coach `Javier AGUIRRE` (home, Role 0) / `Hugo BROOS` (away).
- `positionIndex` orders GK first (Position 0) → forwards last so `layoutFormation` yields a GK at lowest y.
- Badges (M3): scorers credited from per-team `Goals` (Quiñones 1, RAÚL 1) despite `Goal.Type === 2`; booked players flagged; subbed off/on minutes recorded.
- Stats: `homeStats.shots > 0`; `possession === null` (BallPossession null, TerritorialPossesion null); cards/corners/fouls/offsides derived; passes/passAccuracy/shotsOnTarget null.
- Graceful: `mapFifaMatchDetail(null,null,ref)` → `EMPTY_MATCH_DETAIL`; `(live,null,ref)` → empty events but populated lineups/formation.

**integration (new — the sidebar-fills proof):**
- Parse both captured real payloads through the schemas, run the mapper, assert:
  `events.length > 0`; `home.starters.length === 11 && away.starters.length === 11`;
  `home.formation === '4-1-2-3'`; ≥1 `kind:'goal'` event AND ≥1 card event mapped;
  `homeStats` has a derived numeric `shots`/`fouls`; `possession === null` (omitted, not faked);
  at least one goal event has a non-null `playerName` from the lineup.

### M2 — Exact captured `MatchMinute` strings (fixtures + any string-equality)
The fixtures are byte-copies of the captured samples, so the strings are already exact: `"45'+2'"`, `"45'+4'"`, `"45'+5'"`, `"90'+2'"` (Montes red), `"90'+7'"`, `"90'+8'"`. Tests assert the *parsed* minute (e.g. Montes red minute `=== 90`) rather than the raw string; any test that does compare a raw `MatchMinute` MUST use the exact apostrophe-plus form above. Do not normalize the fixture strings.

### Acceptance criteria (testable)
See numbered list below.

### Coverage target
≥80% line/branch across the changed data-layer files (`match-detail-schema.ts`, `match-detail-mapper.ts`, `event-labels.ts`, `match-detail-stats.ts`). The real-payload mapper test + integration test exercise the full happy path; the null/partial tests cover degradation branches; `classifyGoalKind` own/penalty branches are covered by synthetic label-string unit tests.

## Risks & Open Questions

- **`Match end` (Type 26):** RESOLVED (M1) — `labelToKind('Match end') === null`, pinned by a deterministic assertion in `event-labels.test.ts`. It is not in the requirement's documented set and carries no team; emitting it as a chip adds noise. It must never crash.
- **Assist `relatedName` (H1):** RESOLVED — paired against the adjacent same-minute, same-side `Goal!` event and resolved via `lineupName`; does NOT depend on `IdAssistPlayer` (null in real data) or `raw.PlayerName` (absent).
- **Own-goal / penalty detection:** real sample has neither, and `Qualifiers` is `[]` for all goals. `classifyGoalKind` reads label/qualifier text defensively but is asserted positively only via synthetic strings. Not blocking.
- **`EventId` type:** real `EventId` is a numeric-looking string (e.g. `"1600191489"`); schema uses `z.union([z.string(), z.number()])` defensively and the mapper coerces to string for the domain `id`.
- **`AwayTeam.Tactics` / captains:** the plan asserts `home.formation === '4-1-2-3'` (confirmed in README/sample). For `away.formation` and the captain names, the implementer reads the literal values from the captured fixture and asserts those exact strings (avoids guessing a value not directly verified byte-for-byte here).

Open questions: **none blocking.** All shapes are confirmed from the captured samples.

## Review resolutions (plan-review.md)

- **H1 (assist relatedName):** Mapper rule 3 — pair each timeline `Assist` with the adjacent same-side same-minute `Goal!`, resolving both names through `lineupName` (`IdPlayer→name`). The old `IdAssistPlayer`-keyed `scorerByAssist` map is removed. Test asserts assist 9' `relatedName` = Quiñones, assist 67' `relatedName` = RAÚL.
- **H2 (playerName / scorerName re-pointing):** Mapper rule 2 — `mapEvent`'s `playerName` (line 244) is re-sourced from `lineupName`; the `scorerName` builder (lines 285-290) is **deleted** (its only consumer, `scorerByAssist`, is gone). Every event now gets its name from the lineup map, so AC #6 passes.
- **M1 (`Match end`):** `labelToKind('Match end') === null` in `event-labels.ts`, with a deterministic assertion in `event-labels.test.ts`.
- **M2 (exact stoppage strings):** Fixtures are byte-copies; the canonical forms are `"45'+2'"`, `"90'+7'"`, `"90'+2'"` (Montes red). Tests assert parsed minutes; raw-string comparisons (if any) use these exact forms.
- **M3 (per-team Goals):** Badges credited from `HomeTeam.Goals` / `AwayTeam.Goals` (`AwayTeam.Goals === []`, `HomeTeam.Goals` = Quiñones + RAÚL); no top-level `Goals` exists and the mapper must not regress to one. `buildEnrichment(squad)` already iterates per-team — keep it.

## Acceptance Criteria

1. `rawMatchLiveSchema.parse(docs/fifa-real-payloads/live.sample.json)` and `rawTimelineSchema.parse(docs/fifa-real-payloads/timeline.sample.json)` both succeed without throwing (the core regression fix), including top-level `BallPossession: null` and `TerritorialPossesion: null`.
2. Unknown/extra real fields (`Officials`, `Staffs`, `VarNotificationData`, `PositionX/Y`, `Stadium`, `Weather`, `IdSubTeam`, `SpecialStatus`) never cause a parse rejection.
3. `mapFifaMatchDetail(realLive, realTimeline, ref)` returns a `MatchDetail` with `events.length > 0`.
4. `home.starters.length === 11` and `away.starters.length === 11` (split by `Status === 1`).
5. `home.formation === '4-1-2-3'`; `away.formation` equals the literal `AwayTeam.Tactics` from the fixture (both read from `Tactics`).
6. At least one `kind:'goal'` event is mapped to the home side with a **non-null `playerName` resolved from the lineup map** (not `raw.PlayerName`), and at least one card event (`'yellow'` or `'red'`) is mapped.
7. Substitution events carry `relatedName` = the player coming on (from live `Substitutions[].PlayerOnName`); each `Assist` event carries `relatedName` = the paired scorer (adjacent same-minute same-side `Goal!`), resolved via the lineup map — assist 9' → Quiñones, assist 67' → RAÚL.
8. Player badges: every per-team `Goals[]` scorer is credited (Quiñones 1, RAÚL 1) even though `Goal.Type === 2`; booked players are flagged; subbed off/on minutes recorded. No top-level `Goals` lookup is used.
9. `homeStats`/`awayStats` derive numeric `shots`, `corners`, `fouls`, `offsides`, `yellowCards`, `redCards` from the real timeline; `possession === null` (BallPossession null, no territorial fallback); `passes`/`passAccuracy`/`shotsOnTarget` are `null` (never faked as 0).
10. `positionIndex` is derived from `Position` (`(Position ?? 9)*100 + ShirtNumber`) so `layoutFormation` places the goalkeeper on the own goal line (lowest y) and forwards highest.
11. Coach is read from `Coaches` (`Role === 0`): home `Javier AGUIRRE`, away `Hugo BROOS` (NOT `Coaches[0]`, which is Role:1 for Mexico).
12. Event labels map correctly (`Goal!`/`Assist`/`Yellow card`/`Red card`/`Substitution`/`VAR`/`Start Time`/`End Time`); `Match end` returns `null`; counting labels (`Attempt at Goal`/`Corner`/`Foul`/`Offside`/`Goal Prevention`/`Coin Toss`/`Delay`/`Resume`) return `null`.
13. `mapFifaMatchDetail(null, null, ref)` returns `EMPTY_MATCH_DETAIL` (no throw); `(realLive, null, ref)` returns empty events but populated lineups/formation.
14. The new `match-detail-integration.test.ts` runs the captured payloads through schema + mapper and asserts a populated detail (criteria 3–9 combined), including ≥1 goal and ≥1 card event and `possession === null`.
15. Domain types in `src/domain/types/match-detail.ts` are unchanged; no panel/component/hook/route file is modified; `match-detail-stats.test.ts` is unchanged.
16. `npm run test`, `npm run typecheck`, and `npm run build` all pass; no live FIFA network access in any test; no `console.log`.
