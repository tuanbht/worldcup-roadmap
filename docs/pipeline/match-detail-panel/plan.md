# Plan: Google-style match detail panel (Timeline / Lineups / Stats)

> Revision #4 — resolves the two remaining Required Changes in `plan-review.md` (rev #3): **H-1**
> (client→`server/` import of `DETAIL_UNAVAILABLE` — move the constant under `src/`) and **M-1**
> (`vitest.config.ts` missing from the Files table for the `coverage.include` edit).
> Carries forward every resolved item from rev #1–#3 (H1–H4, M1–M6, L1–L4, H-A, M-A, M-B, M-C, L-A, L-C).
> Re-verified against source this round: `match.ts`, `team.ts`, `group.ts`, `errors.ts`, `envelope.ts`,
> `tournament-schema.ts`, `fifa/mapper.ts`, `fifa/schema.ts`, `fifa/client.ts`, `tournament-cache.ts`,
> `repository-factory.ts`, `env.ts`, `worldcup.ts`/`worldcup.test.ts`, `server/index.ts`, `main.tsx`,
> `queryClient.ts`, `useTournamentQuery.ts`, `RoadmapCanvas.tsx`, `SegmentedControl.tsx`, `Flag.tsx`,
> `MatchDetailPanel(.test).tsx`, `standings.test.ts`, `derive-matchdays.test.ts`, `vite.config.ts`,
> `vitest.config.ts`, `tsconfig.json`. Literal-site enumeration re-confirmed by grepping `providerMatchId:`.

## Scope

### In scope
- New domain types in `src/domain/types/`: `MatchEventKind`, `MatchEvent`, `LineupPlayer`, `Lineup`, `TeamStats`, `WinProbability`, `MatchDetail` (nullable-everywhere for graceful partial data) + an `EMPTY_MATCH_DETAIL(matchId)` factory. **These live under `src/domain` so BOTH the Hono route and the frontend hook import them via the `@` alias — never from `server/`.**
- Add `ProviderRef` + a **required** `readonly providerRef: ProviderRef | null` to the `Match` domain type, its zod schema (`tournament-schema.ts`), the FIFA mapper (populated), the **mock builder** (set to `null`), **and the three test-only `Match`-literal sites** (`null`) — see H-A.
- FIFA boundary: new zod schemas + a mapper + a fetcher under `src/data/providers/fifa/` that call the FIFA v3 `/live/football/...` and `/timelines/...` endpoints and normalize to `MatchDetail`. Includes `TeamStats` derivation (event counting + `BallPossession`) and a clearly-labeled win-probability estimate.
- New per-match cache (`Map`-keyed by `matchId`, liveness-tiered TTL, single-flight, stale-on-error) mirroring the existing tournament cache.
- New Hono endpoint `GET /api/worldcup/match/:matchId/detail` → `ApiEnvelope<MatchDetail>`; resolves `matchId` → `providerRef` via the cached tournament; returns a typed `DETAIL_UNAVAILABLE` **HTTP-200** fail envelope when `providerRef` is null (mock match) or the match id is unknown.
- A shared, **client-importable** `DETAIL_UNAVAILABLE` code constant under `src/data/` (H-1) imported by the route, the hook, and both tests.
- Frontend: `useMatchDetailQuery(matchId, isLive)` (TanStack Query, lazy, live-aware refetch) + a redesigned 3-tab `MatchDetailPanel` (Timeline / Lineups / Stats) with header, goalscorer summary, formation pitch, stats comparison, win-probability bar, skeleton / empty / error states, and a **complete ARIA tabs pattern** (tabpanel + aria-controls + arrow-key nav).
- Unit tests for the FIFA detail mapper, stats derivation, win-probability computation, formation layout, view helpers, event labels, and the panel/tab components; extend the existing `MatchDetailPanel.test.tsx`; add a route test and a Playwright smoke spec (documented if browsers unavailable). Add the new dirs to `vitest.config.ts` `coverage.include` (M-1).

### Out of scope
- Performance / Age / Club lineup sub-tabs (requirement marks them phase 2).
- Any change to the timeline-grid layout / `RoadmapCanvas` graph beyond passing the selected `Match`'s liveness into the panel (a one-line derivation at the existing call site).
- Real per-match data for mock matches (mock intentionally returns `DETAIL_UNAVAILABLE`).
- Changing the `/api/worldcup` route **behaviour**, tournament cache, or repository contract (we only DRY-extract a shared error mapper from `worldcup.ts` with identical behaviour).
- Live websocket / SSE; refetch is interval-based via TanStack Query.
- Persisting the active tab in the URL (kept in component state per requirement).
- **No new `@` alias for `server/`, and no file in `src/` importing from `server/`** — the module boundary is preserved (the H-1 fix is precisely to honor this).

## Approach

Build a second, parallel data path that mirrors the proven tournament path rather than threading detail through the `Tournament` aggregate. The FIFA detail fetch lives entirely server-side in the Hono process (reusing the browser-like `User-Agent`/`Accept` headers + zod-at-the-boundary discipline of `client.ts`), is wrapped in a dedicated per-match cache singleton (same three behaviours as `tournament-cache.ts` but `Map`-keyed by `matchId`), and is exposed as a new on-demand route. The client fetches it lazily through a focused TanStack Query hook only when a match is selected. The detail route resolves `matchId → providerRef` by reading the already-cached tournament snapshot (`getCachedTournament(selectRepository())`), so no new id-plumbing is needed beyond adding `providerRef` to `Match`; a null `providerRef` (mock, or unknown id) short-circuits to a typed `DETAIL_UNAVAILABLE` envelope and the panel renders a clean empty state.

**Module-boundary discipline (the spine of the design).** The `@` alias maps to `./src` only (`vite.config.ts`, `vitest.config.ts`, `tsconfig.json` all verified). There is no alias for `server/`, and zero files under `src/` currently import from `server/`. Therefore: (a) ALL shared types live in `src/domain/types/` (framework-agnostic); (b) the FIFA detail schema + mapper + fetch live in `src/data/providers/fifa/`; (c) the new `server/routes/match-detail.ts` only orchestrates (fetch → cache → map) and imports DOWN into `src/domain` + `src/data` — never the reverse; (d) any constant shared by both the server route and the client hook (i.e. `DETAIL_UNAVAILABLE`) has its canonical home under `src/data/` so both sides reach it via the `@` alias.

**Rejected alternative:** eagerly fetching every match's detail and embedding it inside the `Tournament` snapshot. Rejected because it would multiply FIFA calls by ~104, blow the cache/rate-limit budget, couple unrelated concerns into one aggregate, and contradict the "on demand per selected match" requirement.

### Resolutions to this round's Required Changes (rev #3 review)

- **H-1 — `DETAIL_UNAVAILABLE` moved to a client-importable location under `src/` (layering fixed).** The canonical home of the shared code constant is a **new** `src/data/detail-codes.ts` (`export const DETAIL_UNAVAILABLE = 'DETAIL_UNAVAILABLE'`), reachable from BOTH sides via the `@` alias: the Hono route (`server/routes/match-detail.ts`), the client hook (`src/features/roadmap/hooks/useMatchDetailQuery.ts`), the route test, and the panel test all `import { DETAIL_UNAVAILABLE } from '@/data/detail-codes'`. The previous plan put it in `server/routes/error-mapping.ts`, which the SPA build cannot reach (no `server/` alias) and which would invert the dependency direction (first-ever `src/ → server/` crossing, pulling a `server/routes/*` module into the client bundle). `error-mapping.ts` is now purely server-side error mapping (`mapError`/`isRepositoryErrorShape`/`CACHE_CONTROL`) and **may re-export** `DETAIL_UNAVAILABLE` from `@/data/detail-codes` for the route's convenience, but the canonical definition is under `src/`. No `src/` file imports from `server/`. (Chosen over the "hook compares the literal string" option because one shared constant under `src/` keeps route/hook/tests in lockstep.)
- **M-1 — `vitest.config.ts` now appears in the Files table with the exact `coverage.include` additions.** Verified against `vitest.config.ts:26–39`: `coverage.include` currently globs `src/domain/**`, `src/lib/datetime.ts`, `src/features/roadmap/layout/**`, `src/features/roadmap/build-graph.ts`, `src/features/roadmap/lod.ts`, `src/features/roadmap/hooks/useTournamentQuery.ts`, `src/data/providers/**`, `server/routes/**`. The new modules under `src/data/providers/**` and `server/routes/**` are already covered, but `src/components/panel/**`, `src/data/cache/**`, and `src/features/roadmap/hooks/useMatchDetailQuery.ts` are **not** — so without this edit the ≥80% AC (AC15) would silently exclude the new panel/cache/hook code. The Files table entry adds exactly: `src/components/panel/match-detail/**`, `src/data/cache/match-detail-cache.ts`, and `src/features/roadmap/hooks/useMatchDetailQuery.ts`.

### Carried-forward resolutions (rev #2/#3, unchanged except where H-1 supersedes)

- **H-A — `providerRef` (required) typecheck blast radius fully enumerated.** `providerRef` stays a **required** field `readonly providerRef: ProviderRef | null`. Grepping `providerMatchId:` (the reliable signal for an actual `Match` object literal) yields exactly **five** construction sites, all in the Files table with the precise edit:
  1. `src/data/providers/fifa/mapper.ts` — populate from `IdStage`/`IdMatch` + env (else `null`).
  2. `src/data/providers/mock/build-mock-tournament.ts` — `makeMatch` adds `providerRef: null` (covers group / third-place / Final paths, all routed through `makeMatch`).
  3. `src/domain/bracket/standings.test.ts` — the `gm()` helper (`: Match`, lines 21–36) adds `providerRef: null`. The `scheduled` spread (line 60) inherits via `gm`; no separate edit.
  4. `src/domain/derive-matchdays.test.ts` — the `mkMatch()` helper (`: Match`, lines 13–27) adds `providerRef: null`.
  5. `src/components/panel/MatchDetailPanel.test.tsx` — the `FINAL_MATCH: Match` fixture (lines 39–52) adds `providerRef: null`.
  Verified non-sites (type annotations only, no literal — no edit): `assemble-tournament.ts`, `derive-matchdays.ts`, `build-bracket.ts`, `standings.ts`, `build-graph(.test).ts`, `group-layout(.test).ts`, `roadmap-fixtures.ts` (derives via `buildMockTournament`+`parseTournament`), `tournament.ts`. With all five carrying `providerRef`, `npm run typecheck` (AC15) holds.
- **M-A — `TeamRef`-vs-`Team` id-matching seam explicit.** `StandingRow.team` is a full `Team` (`group.ts`) while `Match.home/away` is the `TeamRef` union `{ kind:'team'; team:Team } | { kind:'placeholder'; label:string }` (`team.ts`). The pure helper keeps `standingPositionLabel(groups, groupLetter: string | null, teamId: string | null) → string | null`. The **unwrap happens at the call site** in `MatchDetailHeader`: `const teamId = ref.kind === 'team' ? ref.team.id : null;`. A placeholder/knockout ref (`teamId === null`) or null `groupLetter` → helper returns `null` → no standing line. The header passes a `string | null`, never a `TeamRef`.
- **M-B — `Group.table` field name pinned.** Standings live on `Group.table` (`group.ts:26`), a `readonly StandingRow[]` — not `.rows`/`.standings`. The helper reads `groups.find(g => g.name === groupLetter)` then `group.table.find(r => r.team.id === teamId)`, mapping 1-based `row.position` to the ordinal ("1st".."4th"). The `match-detail-view.test.ts` fixture shapes groups as `{ name:'A', table:[ /* StandingRow */ ] }`.
- **M-C — dead `DetailUnavailableError` dropped in favour of the shared code constant.** The route handles `providerRef === null` (and unknown id) **structurally** — returns `c.json(fail(DETAIL_UNAVAILABLE, …), 200)` directly without throwing — so an error *class* would be dead code. `fail(code, message)` (`envelope.ts`) takes exactly those two args. `errors.ts` is **not modified**. (H-1 moves the constant's home from `error-mapping.ts` to `@/data/detail-codes`.)
- **L-A — `IdStage` presence is an assumption, flagged prominently (see Risks §).** The feature hinges on the FIFA `/calendar/matches` row carrying `IdStage` so the mapper can build `providerRef`. `rawMatchSchema` currently only `.passthrough()`es it (`schema.ts:22–44`) — no captured fixture proves it exists. The requirement asserts it; accepted as authoritative; the graceful-`null` path means a missing `IdStage` yields "detail unavailable", not a crash. **PROMINENT RISK: if live calendar rows lack `IdStage`, every FIFA match degrades to unavailable.** Implementation action: run a one-line live probe of a real `/calendar/matches` row before finalizing the mapper; if absent, derive `idStage` from whatever stage id the calendar carries (or the stage list) and adjust schema/mapper. `mapper.test.ts` proves both branches.
- **L-C — win-probability re-normalization tested in all three directions.** `win-probability.test.ts` asserts `home + draw + away === 100` (exact) across the symmetric overflow cases: (i) `away` overflows negative (home leads late); (ii) `home` exceeds 100 (blowout home lead); (iii) `draw` exceeds 100 (early 0-0). The implementation clamps each component to `[0,100]` and absorbs the residual into the largest component so the invariant holds in every direction.
- **M1/M5 — shared `BASE`/`FIFA_HEADERS` export from `client.ts`; `mapError`/`isRepositoryErrorShape`/`CACHE_CONTROL` extracted to `server/routes/error-mapping.ts`** (server-side only now; the `DETAIL_UNAVAILABLE` constant lives under `src/` per H-1). `http` type stays `number`; the `as 429|500|502` narrowing stays local to each route's `c.json`.
- **H1/H2/H3/H4 — see Files-table notes:** panel Venue/Kick-off assertions are **rewritten** (not "kept"); complete ARIA tabs via `MatchDetailTabs` + a minimal additive `SegmentedControl` extension; route 200-path tested via `vi.doMock` of the cache seams (mirroring `worldcup.test.ts`).

## Files

| Path | Action | Responsibility |
|---|---|---|
| `src/domain/types/match-detail.ts` | create | All new detail domain types (`MatchEventKind`, `MatchEvent`, `LineupPlayer`, `Lineup`, `TeamStats`, `WinProbability`, `MatchDetail`) + `EMPTY_MATCH_DETAIL(matchId)` factory (empty starters/bench, null formation/coach for both lineups; all-null `TeamStats`; null `winProbability`). Pure, all readonly, nullable where data may be partial. Framework-agnostic — imported by both the Hono route and the client hook via `@`. |
| `src/domain/types/match.ts` | modify | Add `ProviderRef` interface + **required** `readonly providerRef: ProviderRef \| null` to `Match`. |
| `src/domain/types/index.ts` | modify | Re-export the new detail types + `ProviderRef`, `EMPTY_MATCH_DETAIL`. |
| `src/data/detail-codes.ts` | create | **(H-1)** Canonical, client-importable shared constant: `export const DETAIL_UNAVAILABLE = 'DETAIL_UNAVAILABLE';`. Imported via `@/data/detail-codes` by the route, the hook, the route test, and the panel test. Tiny, dependency-free. |
| `src/data/schema/tournament-schema.ts` | modify | Add `providerRef: z.object({ idCompetition: z.string(), idSeason: z.string(), idStage: z.string(), idMatch: z.string() }).nullable()` to `matchSchema` (after `venue`, before the closing `})`), so FIFA-mapped (object) and mock (`null`) matches both validate. |
| `src/data/providers/mock/build-mock-tournament.ts` | modify | **(H-A #2)** `makeMatch` adds `providerRef: null` to its returned `Match` literal (single edit covers group, third-place, Final paths). No other behaviour change. |
| `src/data/providers/fifa/mapper.ts` | modify | **(H-A #1 / L-A)** Populate `providerRef` in the `Match` literal: `raw.IdStage` present → `{ idCompetition: env.WC_FIFA_COMPETITION_ID, idSeason: env.WC_FIFA_SEASON_ID, idStage: raw.IdStage, idMatch: raw.IdMatch }`, else `null`. (`id` stays `wc2026-fifa-${raw.IdMatch}`; `providerMatchId` stays `raw.IdMatch`.) Import `env` from `@/data/config/env`. |
| `src/data/providers/fifa/schema.ts` | modify | Add `IdStage: z.string().nullable().optional()` (and `IdGroup` optional) to `rawMatchSchema` so the stage id is captured (currently only `.passthrough()`'d). **L-A live-probe note in a code comment.** |
| `src/data/providers/fifa/match-detail-schema.ts` | create | Zod schemas for the raw `/live/football/...` payload (`Players[]` w/ `IdPlayer`, `ShirtNumber`, `Captain`, `Position`, `Status`/`FieldStatus`, `PlayerName`/`ShortName`, `PlayerPicture.PictureUrl`, `Tactics`/formation, `Goals[]`, `Bookings[]`, `Substitutions[]`, `Coaches[]`, `BallPossession`) and the raw `/timelines/...` payload (`MatchMinute`, `Period`, `IdTeam`, `IdPlayer`, `Type`, `TypeLocalized`). All fields nullable/optional + `.passthrough()`; exports inferred `RawMatchLive`/`RawTimeline` types. |
| `src/data/providers/fifa/match-detail-mapper.ts` | create | Pure `mapFifaMatchDetail(live, timeline, ref) → MatchDetail`. Maps timeline events by `TypeLocalized` label → `MatchEventKind`; resolves `side` from `IdTeam` vs the live payload's home/away team ids; builds `Lineup` (home/away, starters/bench, formation, coach, headshot url, badges); orchestrates stats + win-prob. Degrades any null/empty section to `EMPTY_MATCH_DETAIL`-shaped values rather than throwing. <800 lines (helpers split into the files below). |
| `src/data/providers/fifa/match-detail-stats.ts` | create | Pure `deriveTeamStats(events, ballPossession, side) → TeamStats` — counts `Attempt at Goal`/corners/fouls/offsides/cards per team, reads possession, **omits** (null) stats with no source (passes / pass accuracy / shots-on-target). |
| `src/data/providers/fifa/win-probability.ts` | create | Pure `estimateWinProbability(input) → WinProbability \| null`. **(L-C)** Computes `home`/`draw`/`away` as integers, clamps each to `[0,100]`, absorbs the residual into the **largest** component so the three **always sum to exactly 100** in all overflow directions; always `estimated: true`; `null` for not-yet-started / insufficient inputs. |
| `src/data/providers/fifa/event-labels.ts` | create | Single source-of-truth map `TypeLocalized` → `MatchEventKind` (+ `classifyGoalKind` for own-goal / penalty distinction). Unknown label → `null` (ignored). Keeps the table out of the mapper and unit-testable in isolation. |
| `src/data/providers/fifa/match-detail-client.ts` | create | `fetchFifaMatchDetail(ref) → { live, timeline }`. Builds `${BASE}/live/football/${idCompetition}/${idSeason}/${idStage}/${idMatch}` and `${BASE}/timelines/${idCompetition}/${idSeason}/${idStage}/${idMatch}`, importing the shared `BASE`/`FIFA_HEADERS` from `client.ts`. Parses each response with its schema; on HTTP/validation/empty/oversized/429 failure returns a sentinel `{ live:null, timeline:null }` (or partial) the mapper degrades to empty — never throws past the route into a crash. |
| `src/data/providers/fifa/client.ts` | modify | **(M1)** Extract `BASE` and `HEADERS` (as `FIFA_HEADERS`) to named exports so `match-detail-client.ts` reuses them; the calendar fetch (`${BASE}/calendar/matches`) is unchanged. |
| `src/data/cache/match-detail-cache.ts` | create | `getCachedMatchDetail(matchId, loader, isLive) → MatchDetail`. `Map<matchId, { snapshot; expiresAt; inflight }>`; TTL `WC_CACHE_TTL_DETAIL_LIVE_MS` when `isLive` else `…_IDLE_MS`; single-flight per id; stale-on-error returns the last good snapshot. Exports `resetMatchDetailCache()` test helper. Mirrors `tournament-cache.ts`. |
| `src/data/config/env.ts` | modify | Add `WC_CACHE_TTL_DETAIL_LIVE_MS` (default `30_000`) / `WC_CACHE_TTL_DETAIL_IDLE_MS` (default `600_000`), same `z.coerce.number().int().positive().default(...)` shape as the existing TTLs. |
| `server/routes/error-mapping.ts` | create | **(M5)** Extract `mapError` + `isRepositoryErrorShape` + `CACHE_CONTROL` verbatim from `worldcup.ts`. **(H-1)** Re-export `DETAIL_UNAVAILABLE` from `@/data/detail-codes` for the route's convenience — the canonical home is under `src/`, not here. `mapError` keeps returning `{ code, message, http }` with `http: number`; the `as 429\|500\|502` narrowing stays local to each route's `c.json`. No behaviour change to `worldcup.ts`. |
| `server/routes/worldcup.ts` | modify | **(M5)** Import `mapError`/`isRepositoryErrorShape`/`CACHE_CONTROL` from `./error-mapping` (remove local copies). The `c.json(fail(...), apiError.http as 429 \| 500 \| 502)` line kept byte-for-byte. No behaviour change (the `worldcup.test.ts` suite stays green). |
| `server/routes/match-detail.ts` | create | Hono route `GET /api/worldcup/match/:matchId/detail`. **(H4)** Resolves via `selectRepository()` + `getCachedTournament()` (mockable), finds `Match` by `matchId`, reads `Match.providerRef`. Null providerRef / unknown id → `c.json(fail(DETAIL_UNAVAILABLE, …), 200, { 'Cache-Control': CACHE_CONTROL })` (`DETAIL_UNAVAILABLE` imported from `@/data/detail-codes`). Else `getCachedMatchDetail(matchId, async () => mapFifaMatchDetail(...(await fetchFifaMatchDetail(ref)), ref), match.status === 'live')` → `c.json(ok(detail), 200, …)`. Genuine upstream throw → `mapError(...)` → fail at its own http status. Imports only from `@/data` + `@/domain` (never the reverse). |
| `server/index.ts` | modify | `app.route('/', matchDetail)` alongside the existing `worldcup` route. |
| `src/features/roadmap/hooks/useMatchDetailQuery.ts` | create | **(M6 / H-1)** `useMatchDetailQuery(matchId: string \| null, isLive: boolean)`. `queryKey ['match-detail', matchId]`, `enabled: !!matchId`, fetch `/api/worldcup/match/${matchId}/detail`, envelope-narrow with `import { DETAIL_UNAVAILABLE } from '@/data/detail-codes'` (`error.code === DETAIL_UNAVAILABLE` → `status:'unavailable'`, not an error), `refetchInterval: isLive ? 30_000 : false`, `staleTime` to avoid refetch storms. Returns `{ detail, status: 'loading' \| 'ready' \| 'unavailable' \| 'error', error }`. **No `server/` import.** |
| `src/components/roadmap/RoadmapCanvas.tsx` | modify | **(M6)** Derive the selected match's liveness from the already-loaded `tournament` (`tournament?.matches.find(m => m.id === selected)?.status === 'live'`) and pass it to the panel as `isLive`. One-line change; panel wiring otherwise unchanged. |
| `src/components/panel/MatchDetailPanel.tsx` | modify | Redesign into the 3-tab shell. Keeps the `aside` complementary region, `aria-hidden`/`inert` toggle, Escape handler, mobile bottom-sheet, lucide `X`. Calls `useMatchDetailQuery(matchId, isLive)`. Renders `MatchDetailHeader` + `MatchDetailTabs` + loading/empty/error states. Delegates bodies to children to stay <800 lines. |
| `src/components/panel/match-detail/MatchDetailHeader.tsx` | create | Header presentational component: competition label, status pill (Half-time / `{minute}'` / Full-time / Upcoming), team blocks (Flag, name, standing-position string, score), `Stage · Group {X}` line, kickoff line (façade `formatDateTime`), goalscorer summary row. **(M-A)** Unwraps each `TeamRef` to `string \| null` and calls `standingPositionLabel(groups, match.group, teamId)`; passes `null` standing for placeholder/knockout refs. |
| `src/components/panel/match-detail/MatchDetailTabs.tsx` | create | **(H3)** Owns the complete ARIA tabs pattern: `SegmentedControl` for the tablist (with `id`/`aria-controls` wiring) + arrow-key roving-tabindex + `role="tabpanel"` (`aria-labelledby`, `hidden` on inactive). Active tab in component state; renders Timeline/Lineups/Stats panels. |
| `src/components/ui/SegmentedControl.tsx` | modify | **(H3)** Add optional `getOptionId?`, `getControlsId?`, `onKeyDown?` props (defaulted/omitted so existing call sites render identically). When provided, each `role="tab"` button gets `id`, `aria-controls`, and a roving `tabIndex`. No change to the only current consumer (`StageToggle.tsx`, which passes none of the new props). |
| `src/components/panel/match-detail/TimelineTab.tsx` | create | Chronological event list grouped by period; each row = minute, lucide kind icon, player (+ related name), home-left / away-right alignment. Semantic `<ol>`. |
| `src/components/panel/match-detail/LineupsTab.tsx` | create | Two formation pitches (home + away). Lays players out from `formation` + `positionIndex` (via `formation-layout`); renders shirt #, short name, captain/goal/card/sub badges. Uses `.pitch-grid` token surface. |
| `src/components/panel/match-detail/PlayerChip.tsx` | create | One pitch player: `<img loading="lazy" width height referrerPolicy="no-referrer">` headshot from `digitalhub.fifa.com` with initials fallback when `photoUrl` null or `onError`; badge icons. |
| `src/components/panel/match-detail/StatsTab.tsx` | create | Win-probability bar (labeled "estimate" or hidden when null) + team-stats rows (home value · label · away value, higher side highlighted via pill, null rows omitted). |
| `src/components/panel/match-detail/PanelStates.tsx` | create | Shared skeleton, "not available yet" empty, and typed error sub-components (compositor-only opacity/transform animation, reduced-motion safe). |
| `src/components/panel/match-detail/formation-layout.ts` | create | Pure `layoutFormation(formation, players) → { player; x; y }[]` deriving normalized pitch coordinates from the formation string (e.g. `"4-1-2-3"`) + `positionIndex`. Unit-tested independently. |
| `src/components/panel/match-detail/match-detail-view.ts` | create | **(M-A / M-B)** Pure view helpers: `goalscorerSummary(events)`; `standingPositionLabel(groups, groupLetter: string \| null, teamId: string \| null) → string \| null` (`groups.find(g => g.name === groupLetter)` then `group.table.find(r => r.team.id === teamId)`, ordinal of `row.position`; `null` when group letter / teamId is null, group missing, or no row); `statusLabel(match)`. Keep formatting out of JSX. |
| `src/data/providers/fifa/__fixtures__/match-detail.live.json` | create | Captured/synthetic `/live/football/...` payload (one finished match: players both sides w/ shirt#, captain, status, picture; goals, bookings, subs, coaches, possession, tactics/formation). For mapper/stats tests — never hits live FIFA. |
| `src/data/providers/fifa/__fixtures__/match-detail.timeline.json` | create | Captured/synthetic `/timelines/...` payload with goal / yellow / red / substitution / VAR / period events on both teams (`TypeLocalized` labels). |
| `src/data/providers/fifa/match-detail-mapper.test.ts` | create | Mapper unit tests (fixture JSON → `MatchDetail`): event kinds via `TypeLocalized`, minute/side/player, lineup formation/captain/headshot, coach, starters-vs-bench split; empty/partial input → `EMPTY_MATCH_DETAIL` shape (no throw). |
| `src/data/providers/fifa/match-detail-stats.test.ts` | create | Stats-derivation tests: shot/corner/foul/offside/card counts per side, possession passthrough, omitted (null) passes/shots-on-target. |
| `src/data/providers/fifa/win-probability.test.ts` | create | Win-prob tests: leading-side bias, draw at 0-0, `null` pre-match, always `estimated: true`, **`home+draw+away === 100` exactly in all three overflow directions** (L-C: `away<0`, `home>100`, `draw>100`). |
| `src/data/providers/fifa/event-labels.test.ts` | create | Label→kind mapping incl. own-goal / penalty-goal / second-yellow classification + unknown label → `null`. |
| `src/data/providers/fifa/mapper.test.ts` | modify | Add `IdStage` to a finished-match fixture; assert `providerRef` populated (idStage/idMatch/comp/season) when `IdStage` present, `null` when absent. Keep existing assertions green. |
| `src/components/panel/match-detail/formation-layout.test.ts` | create | Formation parsing → coordinate count/ordering; degenerate/empty formation falls back gracefully (no throw); coordinates within `[0,1]`. |
| `src/components/panel/match-detail/match-detail-view.test.ts` | create | **(M-A / M-B)** `goalscorerSummary` lists scorers+minutes from goal events only; `standingPositionLabel(groups, 'A', teamId)` → "1st"/"4th" with the fixture `{ name:'A', table:[ /* StandingRow */ ] }`; null group letter / **null teamId (placeholder ref)** / unknown team / missing group → `null`. |
| `src/components/panel/match-detail/MatchDetailTabs.test.tsx` | create | Component tests (Testing Library, mock `MatchDetail`): default tab TIMELINE; clicking each tab shows the right `tabpanel`; **arrow-key nav moves the active tab**; panels carry `aria-labelledby`/`aria-controls` (H3); goalscorer header line matches goal events; higher stat highlighted; null stat omitted; win-prob labeled-or-absent; loading/empty/error states. jsdom pragma. |
| `src/components/panel/MatchDetailPanel.test.tsx` | modify | **(H-A #5 / H2)** Add `providerRef: null` to `FINAL_MATCH`. Extend the a11y/inert/close/lucide-X guards (wrap render in `QueryClientProvider`; mock `useMatchDetailQuery`). **Rewrite** the Venue assertion (drop — venue not in the new header) and the Kick-off assertion (assert façade text `02 Jun, 14:30` in the header, not under a `Kick-off` `<dt>`). Add: tablist present, header standing position, `unavailable` state for a mock match. |
| `src/domain/bracket/standings.test.ts` | modify | **(H-A #3)** Add `providerRef: null` to the `gm()` helper's returned `Match` literal (lines 21–36). The `scheduled` spread (line 60) inherits; no other edit. Assertions unchanged. |
| `src/domain/derive-matchdays.test.ts` | modify | **(H-A #4)** Add `providerRef: null` to the `mkMatch()` helper's returned `Match` literal (lines 13–27). Assertions unchanged. |
| `server/routes/match-detail.test.ts` | create | **(H4 / H-1)** Route tests (Node env, `WC_PROVIDER=mock`, `vi.doMock` of `@/data/cache/tournament-cache` (providerRef-bearing match) and `@/data/cache/match-detail-cache` (loader counter)): FIFA-ref match → 200 `ok(MatchDetail)` + single-flight; mock match (null `providerRef`) → 200 `fail(DETAIL_UNAVAILABLE)` (import from `@/data/detail-codes`); unknown matchId → 200 unavailable; loader throws `RateLimitError` → 429 mapped fail; `Cache-Control` on success + unavailable; envelope shape `{success,data,error}`. Mirrors the `worldcup.test.ts` `vi.doMock` + dynamic-import + `vi.resetModules` seam. |
| `vitest.config.ts` | modify | **(M-1)** Add to `coverage.include` (after the existing entries): `'src/components/panel/match-detail/**'`, `'src/data/cache/match-detail-cache.ts'`, `'src/features/roadmap/hooks/useMatchDetailQuery.ts'`. (`src/data/providers/**` and `server/routes/**` already globbed → the FIFA mapper/stats/win-prob/labels + the new route are covered without further edits.) No change to `include`/`env`/`setupFiles`. |
| `e2e/match-detail.spec.ts` | create | Playwright smoke: open a match → assert panel + tablist → switch all three tabs → Escape closes. Documented as possibly un-runnable if browsers unavailable in the sandbox. |

## Data Model / Types

```ts
// src/domain/types/match.ts (added)
export interface ProviderRef {
  readonly idCompetition: string;
  readonly idSeason: string;
  readonly idStage: string;
  readonly idMatch: string;
}
// Match gains (REQUIRED, nullable value):  readonly providerRef: ProviderRef | null;
//   FIFA mapper → object (when IdStage present) else null;  mock + all test literals → null.

// src/data/detail-codes.ts (new — H-1: canonical, client-importable)
export const DETAIL_UNAVAILABLE = 'DETAIL_UNAVAILABLE';

// src/domain/types/match-detail.ts (new)
export type MatchEventKind =
  | 'goal' | 'own-goal' | 'penalty-goal' | 'assist'
  | 'yellow' | 'red' | 'second-yellow'
  | 'substitution' | 'var' | 'period';

export interface MatchEvent {
  readonly id: string;
  readonly minute: number;
  readonly period: string;
  readonly kind: MatchEventKind;
  readonly side: 'home' | 'away';
  readonly playerId: string | null;
  readonly playerName: string | null;
  readonly relatedName?: string | null; // assist / player coming on
}

export interface LineupPlayer {
  readonly id: string;
  readonly shirtNumber: number;
  readonly name: string;
  readonly shortName: string;
  readonly positionIndex: number;
  readonly isCaptain: boolean;
  readonly isStarter: boolean;
  readonly photoUrl: string | null;
  readonly goals: number;
  readonly yellow: boolean;
  readonly red: boolean;
  readonly subbedOff?: number;
  readonly subbedOn?: number;
}

export interface Lineup {
  readonly side: 'home' | 'away';
  readonly formation: string | null;
  readonly coach: string | null;
  readonly starters: readonly LineupPlayer[];
  readonly bench: readonly LineupPlayer[];
}

export interface TeamStats {
  readonly possession: number | null;
  readonly shots: number | null;
  readonly shotsOnTarget: number | null;   // omitted → null
  readonly passes: number | null;          // omitted → null
  readonly passAccuracy: number | null;    // omitted → null
  readonly fouls: number | null;
  readonly yellowCards: number | null;
  readonly redCards: number | null;
  readonly offsides: number | null;
  readonly corners: number | null;
}

export interface WinProbability {
  readonly home: number;   // 0..100
  readonly draw: number;   // 0..100
  readonly away: number;   // 0..100;  home + draw + away === 100 (L-C, all directions)
  readonly estimated: true; // always labeled, never presented as FIFA data
}

export interface MatchDetail {
  readonly matchId: string;
  readonly events: readonly MatchEvent[];
  readonly home: Lineup;
  readonly away: Lineup;
  readonly homeStats: TeamStats;
  readonly awayStats: TeamStats;
  readonly winProbability: WinProbability | null; // null when omitted
}

// EMPTY_MATCH_DETAIL(matchId): non-null but empty/zeroed valid shape.
export const EMPTY_MATCH_DETAIL = (matchId: string): MatchDetail => ({
  matchId,
  events: [],
  home: { side: 'home', formation: null, coach: null, starters: [], bench: [] },
  away: { side: 'away', formation: null, coach: null, starters: [], bench: [] },
  homeStats: { possession: null, shots: null, shotsOnTarget: null, passes: null,
    passAccuracy: null, fouls: null, yellowCards: null, redCards: null,
    offsides: null, corners: null },
  awayStats: { possession: null, shots: null, shotsOnTarget: null, passes: null,
    passAccuracy: null, fouls: null, yellowCards: null, redCards: null,
    offsides: null, corners: null },
  winProbability: null,
});
```

**Module boundary (H-1, explicit).** The `@` alias maps to `./src` ONLY (verified in `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`). Shared types: `src/domain/types/`. Shared `DETAIL_UNAVAILABLE`: `src/data/detail-codes.ts`. Import graph for the constant: `server/routes/match-detail.ts → @/data/detail-codes` (down), `src/features/roadmap/hooks/useMatchDetailQuery.ts → @/data/detail-codes` (same layer), `server/routes/match-detail.test.ts → @/data/detail-codes`, `src/components/panel/MatchDetailPanel.test.tsx → @/data/detail-codes` (if needed for assertions). No `src/` file imports from `server/`.

**View-helper signature (M-A / M-B):**
```ts
// src/components/panel/match-detail/match-detail-view.ts
export function standingPositionLabel(
  groups: readonly Group[],
  groupLetter: string | null,   // Match.group
  teamId: string | null,        // unwrapped from TeamRef at the call site
): string | null {
  if (!groupLetter || !teamId) return null;
  const group = groups.find((g) => g.name === groupLetter);
  if (!group) return null;
  const row = group.table.find((r) => r.team.id === teamId); // pinned: Group.table
  return row ? ordinal(row.position) : null;                  // "1st".."4th"
}
// MatchDetailHeader call site (M-A):
//   const teamId = ref.kind === 'team' ? ref.team.id : null;
//   standingPositionLabel(tournament.groups, match.group, teamId);
```

**API envelope:** `GET /api/worldcup/match/:matchId/detail` → `ApiEnvelope<MatchDetail>` (`ok`/`fail` from `@/data/envelope`). Success → `ok(detail)` at HTTP 200. Mock/unknown → `fail(DETAIL_UNAVAILABLE, …)` at HTTP 200 (`success:false`). A blocked/empty/invalid FIFA payload degrades to an **empty** `MatchDetail` success. A genuine upstream throw escaping the mapper maps via `error-mapping.ts` to its own http status (e.g. 429/502).

**`DETAIL_UNAVAILABLE` transport (M-C / H-1):** HTTP **200** `fail` envelope carrying `Cache-Control: public, s-maxage=30, stale-while-revalidate=120` (the same `CACHE_CONTROL`). The signal is a **shared string constant** whose canonical home is `@/data/detail-codes` (client-importable); `error-mapping.ts` re-exports it for the route's convenience. No error class; `errors.ts` is not modified.

**Event-label map (single source in `event-labels.ts`):** `Goal!` → `goal` (+ classify own-goal / penalty-goal), `Assist` → `assist`, `Yellow card` → `yellow`, `Second yellow` → `second-yellow`, `Red card` → `red`, `Substitution` → `substitution`, `VAR` → `var`, `Start/End Time` (+ period boundaries) → `period`; unrecognized → `null`. Map by **`TypeLocalized`**, never numeric `Type`.

**Win-probability rounding (L-C):** compute a raw home/draw/away from scoreline + minute + shots/possession, round to integers, **clamp each to `[0,100]`**, then absorb the residual `(100 - home - draw - away)` into the **largest** component so `home + draw + away === 100` whether the overflow came from `away<0`, `home>100`, or `draw>100`. Unit test asserts exact equality (no `±1` tolerance) in all three directions.

**Cache:** `match-detail-cache.ts` keyed `Map<matchId, { snapshot; expiresAt; inflight }>`; TTL detail-live vs detail-idle by the passed `isLive`; single-flight per id; stale-on-error returns the last good snapshot. Mirrors `tournament-cache.ts`.

## Test Strategy

### Behaviors to test (unit)
1. **Mapper** (`match-detail-mapper.test.ts`): fixture `live`+`timeline` → `MatchDetail`; goal/yellow/red/sub/VAR events carry correct minute, period, side, playerId/playerName; assist/sub related name; lineup formation/coach; starters vs bench split; captain flag; headshot url passthrough + null when absent; empty/partial input → `EMPTY_MATCH_DETAIL` shape (no throw).
2. **Event labels** (`event-labels.test.ts`): every documented `TypeLocalized` label → expected kind; own-goal & penalty-goal & second-yellow classification; unknown label → `null`.
3. **Stats derivation** (`match-detail-stats.test.ts`): shots = count of `Attempt at Goal` per side; corners/fouls/offsides/cards counts; possession from `BallPossession`; passes / passAccuracy / shotsOnTarget are `null` (omitted), never `0`.
4. **Win probability** (`win-probability.test.ts`): leading team higher share; 0-0 early → draw-heavy; pre-match/`scheduled` → `null`; output `estimated: true`; **`home+draw+away === 100` exactly in all three overflow directions (`away<0`, `home>100`, `draw>100`)** (L-C).
5. **Formation layout** (`formation-layout.test.ts`): `"4-1-2-3"` → 1 GK + rows summing to outfield count; coordinates within `[0,1]`; missing/garbage formation → graceful fallback (no throw).
6. **View helpers** (`match-detail-view.test.ts`): `goalscorerSummary` lists scorer + minutes from goal events only; `standingPositionLabel(groups, 'A', teamId)` → "1st".."4th" from a `{ name, table: StandingRow[] }` fixture (M-B); null group letter / **null teamId (placeholder ref, M-A)** / unknown team / missing group → `null`.
7. **Calendar mapper** (`mapper.test.ts`, modified): `providerRef` populated from `IdStage`+`IdMatch`+env when `IdStage` present; `null` when absent (L-A both branches); existing assertions unchanged.

### Behaviors to test (component / integration)
8. **Tabs ARIA** (`MatchDetailTabs.test.tsx`): default tab TIMELINE; clicking TIMELINE/LINEUPS/STATS shows the right `tabpanel`; each panel has `role="tabpanel"` + `aria-labelledby` pointing at its tab's `id`; tabs have matching `aria-controls`; ArrowRight/ArrowLeft/Home/End move the active tab (roving tabindex) (H3).
9. **Timeline render**: goal/card/sub rows show minute, correct side alignment, player name; lucide icon present per kind.
10. **Header goalscorer line** matches the goal events in the mock detail (AC4).
11. **Lineups**: starters render on a pitch laid out by formation, with shirt number, captain marker, `<img loading="lazy" width height>` headshot, initials fallback when `photoUrl` null.
12. **Stats**: higher of home/away emphasized (pill/highlight); null stat row absent; win-prob bar labeled-or-absent.
13. **States**: loading → skeleton; `unavailable` → "detail unavailable" empty; `error` → typed error block.
14. **Panel a11y (extend + the two rewrites)** (`MatchDetailPanel.test.tsx`): complementary region, `aria-hidden`/`inert` toggle, close button name + onClose, Escape, lucide `X` — all stay green (wrapped in `QueryClientProvider`, hook mocked, `enabled:false` when `matchId` null). **Fixture gains `providerRef: null` (H-A).** Venue assertion dropped; Kick-off assertion now asserts façade `02 Jun, 14:30` text in the header (H2).

### Behaviors to test (route)
15. **Route** (`match-detail.test.ts`): FIFA-ref match (injected via mocked `tournament-cache`) → 200 `ok(MatchDetail)`; two concurrent requests share single-flight (mocked detail loader called once); mock match (null `providerRef`) → 200 `fail(DETAIL_UNAVAILABLE)` (constant imported from `@/data/detail-codes` — H-1); unknown matchId → 200 unavailable; loader throws `RateLimitError` → 429 mapped fail; `Cache-Control` on success + unavailable; envelope shape `{success,data,error}` (H4/M5).

### Typecheck (AC15 — H-A)
- `npm run typecheck` must pass with `providerRef` required: the five enumerated `Match`-literal sites all carry `providerRef` (mapper → object/null; mock builder, `standings.test.ts` `gm`, `derive-matchdays.test.ts` `mkMatch`, `MatchDetailPanel.test.tsx` `FINAL_MATCH` → `null`).

### E2E
16. **Playwright** (`match-detail.spec.ts`): open a match → tablist visible → switch all 3 tabs → Escape closes. Document if browsers are unavailable in the sandbox (do not fail the gate on that).

### Coverage target (M-1)
≥80% line/branch on all new pure modules (`match-detail-mapper`, `match-detail-stats`, `win-probability`, `event-labels`, `formation-layout`, `match-detail-view`), the new route, and the new panel/cache/hook code. `vitest.config.ts` `coverage.include` already globs `src/data/providers/**` and `server/routes/**` (covering the FIFA modules + the route). **This round edits `vitest.config.ts` to also add** `src/components/panel/match-detail/**`, `src/data/cache/match-detail-cache.ts`, and `src/features/roadmap/hooks/useMatchDetailQuery.ts` (none currently globbed — `src/data/cache/**` and `src/components/**` are absent from `coverage.include:28–37`). Without this edit the new panel/cache/hook code would be silently excluded from the ≥80% gate. Existing suites stay green.

## Risks & Open Questions

- **`IdStage` capture is an unverified assumption (L-A — PROMINENT).** The feature is **dark for every FIFA match** if live `/calendar/matches` rows do not carry `IdStage` (→ `providerRef: null` → "detail unavailable" everywhere). The graceful-`null` path prevents a crash but not the dark state. **Action:** run a one-line live probe of a real calendar row while implementing the mapper; if `IdStage` is absent, derive `idStage` from whatever stage identifier the calendar carries (or the stage list) and adjust schema/mapper. `mapper.test.ts` proves both branches.
- **Undocumented FIFA detail shapes.** `/live/football/...` and `/timelines/...` field names (`FieldStatus` vs `Status`, `PlayerPicture.PictureUrl`, `Tactics`, `BallPossession` units) are unverified here. Mitigation: tolerant zod (`.passthrough()`, optional/nullable); the mapper degrades partial data to nulls/empty; fixtures are synthetic, shaped from the requirement's documented fields. Swap in a captured real payload later and adjust accessors only.
- **`positionIndex` semantics.** Exact ordering (GK-first? by line?) unconfirmed. Mitigation: `formation-layout.ts` isolated + unit-tested; assume GK = lowest index, then defenders→forwards; documented.
- **Win-probability heuristic is non-authoritative.** Visibly labeled "estimate" + `estimated: true`; never rendered as a FIFA figure. Omittable; rounding pinned to sum exactly 100 (L-C).
- **`auto`-provider FIFA-outage wording (L-2 from review, accepted).** With `WC_PROVIDER=auto` (default), a FIFA outage falls back to the mock tournament whose matches have `providerRef: null` → every detail request returns `DETAIL_UNAVAILABLE`. Correct behaviour, but the empty-state copy should not imply "pre-match"; use neutral wording (e.g. "Detailed timeline, lineups and stats aren't available for this match."). No structural change.
- **`SegmentedControl` extension blast radius (H3).** New optional props default to omitted so the only existing consumer (`StageToggle.tsx`) renders byte-identically. The complete tabs pattern lives in `MatchDetailTabs`.
- **Image hotlink.** `digitalhub.fifa.com` headshots are plain `<img loading="lazy" width height referrerPolicy="no-referrer">`; this Vite SPA has no CSP/`next/image` allowlist to change. Initials `onError` fallback covers 403/blocked images.
- **Open question (resolved):** `DETAIL_UNAVAILABLE` is HTTP **200**-with-fail-envelope (not 404) to keep the client console clean and distinguish "not available" from a real server error; cached with the standard header. The signal is a shared **code constant** under `@/data/detail-codes` (client-importable — H-1), not an error class. Flag for reviewer if 404 is later preferred for cache semantics.

## Acceptance Criteria

1. Selecting a FIFA-provider match fetches `/api/worldcup/match/:id/detail` **once** (cached; no refetch storm) and renders all three tabs (Timeline, Lineups, Stats).
2. Selecting a mock match (null `providerRef`) renders a clean "detail unavailable" empty state with no crash and no thrown error page.
3. Timeline lists goal / yellow / red / substitution / VAR events with correct minute, side (home-left / away-right), and player name; events grouped/ordered by period.
4. The header goalscorer summary row lists exactly the scorers + minutes derived from the goal events shown in the timeline.
5. Lineups render starters on a formation pitch laid out from the reported `formation` + `positionIndex`, each with shirt number, short name, captain marker, and a `digitalhub.fifa.com` headshot (`<img loading="lazy" width height referrerPolicy="no-referrer">`) that falls back to initials when `photoUrl` is null.
6. Stats show possession + derived shots/corners/fouls/offsides/cards as home-vs-away rows with the higher value emphasized; passes/pass-accuracy/shots-on-target rows are **omitted** (not shown as 0) when unavailable.
7. The win-probability bar is either a clearly-labeled "estimate" (`estimated: true`, `home+draw+away === 100`) or absent — never an unlabeled figure presented as FIFA data.
8. Events are mapped from `TypeLocalized` labels (not numeric `Type`), proven by the mapper/label unit tests.
9. FIFA `/live` and `/timelines` payloads are zod-validated at the boundary; a missing / oversized / blocked / empty response degrades to an empty `MatchDetail` success state, not an error page.
10. The panel preserves the complementary region, `aria-hidden`/`inert` toggle, Escape-to-close, focus restore, lucide `X`, and the mobile bottom-sheet layout (the a11y/inert/close/lucide-X guards stay green; Venue/Kick-off metadata assertions are intentionally rewritten per H2).
11. The header shows competition, status pill (Half-time / `{minute}'` / Full-time / Upcoming), both teams (flag, name, group-standing position e.g. "1st"/"4th" — resolved via the `TeamRef→id` unwrap of M-A, null for placeholder/knockout refs, score), the `Stage · Group {X}` line, and the façade kickoff text.
12. `useMatchDetailQuery(matchId, isLive)` is `enabled` only when a match is selected, lazily fetches detail, and uses a short `refetchInterval` only while the linked match is live (else no polling) — liveness derived at the call site from the already-loaded tournament (no extra tournament fetch).
13. Loading shows a skeleton; the typed error state renders for genuine upstream failures; the unavailable state renders for mock/unknown matches.
14. The tabs form a complete keyboard-navigable ARIA pattern: `tablist`/`tab` with `aria-controls` linked to `role="tabpanel"` (`aria-labelledby`), arrow-key/Home/End navigation, and roving tabindex (H3).
15. **Module boundary holds (H-1):** no file under `src/` imports from `server/`; `DETAIL_UNAVAILABLE` is defined in `@/data/detail-codes` and imported by the route, the hook, and the tests via the `@` alias; the Hono route imports only `@/data` + `@/domain`.
16. `npm run test` (all unit/component/route suites incl. the extended panel a11y guards), `npm run typecheck` (all **five** `Match`-literal sites carry `providerRef` — H-A), and `vite build` all pass; new pure modules + route + the newly-globbed panel/cache/hook (M-1) report ≥80% coverage. Playwright smoke (`e2e/match-detail.spec.ts`) opens a match, switches all three tabs, and closes via Escape (documented if browsers unavailable in the sandbox).
