# Requirement: Google-style match detail panel (Timeline / Lineups / Stats)

> Selecting a match opens a rich right-side panel with three tabs, styled after Google's match card
> (dark, right slide-in). Data comes from **real FIFA per-match endpoints** (owner's choice).

## Context

The current `MatchDetailPanel` (`src/components/panel/MatchDetailPanel.tsx`) is a right-side glass slide-in
showing flags, score, status, kickoff, venue. We expand it into a tabbed panel matching the three reference
screenshots: **TIMELINE** (who scored / events), **LINEUPS** (formation pitch + player photos), **STATS**
(team stats comparison + win probability). None of this data exists yet in the model.

## Data source (CONFIRMED via live probe)

Wire two FIFA v3 endpoints, fetched **on demand** per selected match (browser-like `User-Agent`, like the
existing `fifa/client.ts`):

- **`/live/football/{idCompetition}/{idSeason}/{idStage}/{idMatch}`** → `Players[]` (`IdPlayer`,
  `ShirtNumber`, `Captain`, `Position`, `Status`/`FieldStatus` for starter/bench, `PlayerName`/`ShortName`,
  `PlayerPicture.PictureUrl` = real headshot on `digitalhub.fifa.com`), `Goals[]`, `Bookings[]`,
  `Substitutions[]`, `Coaches[]`, `BallPossession`. Formation = the match's `Tactics` (e.g. `"4-1-2-3"`).
  `LineupX/Y` are null → derive pitch coordinates from the formation string + position.
- **`/timelines/{idCompetition}/{idSeason}/{idStage}/{idMatch}`** → event list; each has `MatchMinute`,
  `Period`, `IdTeam`, `IdPlayer`, `Type` + `TypeLocalized` (labels seen: _Goal!, Assist, Yellow card,
  Red card, Substitution, Attempt at Goal, Corner, Foul, Offside, Goal Prevention, VAR, Start/End Time_).

> **Map events by `TypeLocalized` label (verified), not raw numeric `Type` codes** (undocumented/unstable).

### Stats coverage (derive from the above)

| Stat                                     | Source                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Possession                               | `BallPossession` (live) — direct                                                                                                                                                |
| Shots                                    | count `Attempt at Goal` events per team                                                                                                                                         |
| Corners / Fouls / Offsides               | count those events per team                                                                                                                                                     |
| Yellow / Red cards                       | count card events per team (and `Bookings[]`)                                                                                                                                   |
| Shots on target / Passes / Pass accuracy | **may be unavailable** → omit the row if absent (no fakes)                                                                                                                      |
| **Win probability**                      | **NOT provided by FIFA.** Either compute a lightweight, clearly-labeled estimate (from scoreline + minute + shots/possession) **or omit**. Default: compute + label "estimate". |

## New domain types — `src/domain/types/`

```ts
type MatchEventKind =
  | 'goal'
  | 'own-goal'
  | 'penalty-goal'
  | 'assist'
  | 'yellow'
  | 'red'
  | 'second-yellow'
  | 'substitution'
  | 'var'
  | 'period';
interface MatchEvent {
  id;
  minute: number;
  period: string;
  kind: MatchEventKind;
  side: 'home' | 'away';
  playerId: string | null;
  playerName: string | null;
  relatedName?: string | null;
} // assist / player coming on
interface LineupPlayer {
  id;
  shirtNumber: number;
  name;
  shortName;
  positionIndex: number;
  isCaptain: boolean;
  isStarter: boolean;
  photoUrl: string | null;
  goals: number;
  yellow: boolean;
  red: boolean;
  subbedOff?: number;
  subbedOn?: number;
}
interface Lineup {
  side: 'home' | 'away';
  formation: string | null;
  coach: string | null;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
}
interface TeamStats {
  possession: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  passes: number | null;
  passAccuracy: number | null;
  fouls: number | null;
  yellowCards: number | null;
  redCards: number | null;
  offsides: number | null;
  corners: number | null;
}
interface WinProbability {
  home: number;
  draw: number;
  away: number;
  estimated: true;
} // null if omitted
interface MatchDetail {
  matchId;
  events: MatchEvent[];
  home: Lineup;
  away: Lineup;
  homeStats: TeamStats;
  awayStats: TeamStats;
  winProbability: WinProbability | null;
}
```

Nullable everywhere → graceful partial/empty data.

## Backend (Hono) — new on-demand endpoint

- Add **`GET /api/worldcup/match/:matchId/detail`** → `ApiEnvelope<MatchDetail>`. Reuse the cache pattern
  (per-match TTL tiered by liveness, single-flight, stale-on-error) keyed by matchId.
- **ID mapping:** the detail fetch needs `idCompetition/idSeason/idStage/idMatch`. Retain the FIFA
  `IdStage` (+ raw `IdMatch`) when mapping the calendar → add `providerRef?: {idCompetition,idSeason,idStage,idMatch}`
  to `Match` (FIFA mapper fills it; mock leaves it null). `comp/season` also available from `env`.
- **Mock / auto-fallback:** if `providerRef` is null (mock match) the endpoint returns a typed
  `DETAIL_UNAVAILABLE` so the UI shows a clean empty state. (Real detail is a FIFA-provider feature.)
- New zod schemas + mapper under `src/data/providers/fifa/` (`match-detail-schema.ts`, `match-detail-mapper.ts`,
  `fetchFifaMatchDetail()`); derive `TeamStats` by counting timeline events + possession.

## Frontend

- **`useMatchDetailQuery(matchId)`** (TanStack Query) — `enabled` only when a match is selected; lazy fetch of
  `/api/worldcup/match/:id/detail`; short refetch interval while the match is live.
- **`MatchDetailPanel` redesign** (keep right slide-in, glass, `inert`/Escape/focus a11y, mobile bottom-sheet):
  - **Header:** competition ("FIFA World Cup 2026™"), status pill (Half-time / `{minute}'` / Full-time /
    Upcoming), both teams (flag, name, **group standing position** "1st/4th" from `tournament.groups`, score),
    `Stage · Group {X}` line, and a goalscorers summary row (ball icon + scorer names/minutes).
  - **Tabs:** `TIMELINE | LINEUPS | STATS` via the existing `SegmentedControl`; active tab in component state.
  - **TIMELINE:** chronological event list (minute, kind icon via `lucide-react`, player, home-left/away-right
    alignment); goals/cards/subs/VAR. Most-recent grouping by period.
  - **LINEUPS:** formation **pitch** (home + away, real `photoUrl` headshots, shirt number + short name,
    captain/goal/card/sub badge icons), positions computed from `formation` + `positionIndex`. The
    Performance/Age/Club sub-tabs in the screenshot are **phase 2 (optional)** — ship the pitch first.
  - **STATS:** **LIVE WIN PROBABILITY** bar (home/draw/away, labeled "estimate" if computed; hidden if omitted)
    - **TEAM STATS** rows (home value · label · away value), the higher side highlighted (pill), omit null rows.
  - **States:** skeleton while loading; "Lineups/stats not available yet" for pre-match or missing data;
    typed error state. Visual direction matches the Google screenshots (dark, restrained).
- **Player photos:** allow `digitalhub.fifa.com`; render `<img loading="lazy" width height>` with an
  initials fallback when `photoUrl` is null.

## Acceptance criteria (testable)

- Selecting a (FIFA-provider) match fetches detail once and renders all three tabs; mock matches show the
  graceful "detail unavailable" state (no crash).
- **Timeline:** goal/card/substitution events render with correct minute, side, and player; the header
  goalscorer line matches the goal events.
- **Lineups:** starters render on a pitch laid out by the reported `formation`, with shirt numbers, captain
  marker, and real headshots (initials fallback when missing).
- **Stats:** possession + derived stats (shots, corners, fouls, offsides, cards) display home vs away with the
  higher value emphasized; unavailable stats (passes/etc.) are omitted, not shown as 0. Win-probability bar is
  either a labeled estimate or absent — never an unlabeled fake.
- FIFA payloads are zod-validated; a missing/oversized/blocked response degrades to empty state, not an error
  page. Detail responses are cached (no refetch storm).
- Panel keeps `inert`/Escape/focus-restore a11y and the mobile bottom-sheet layout.

## Risks / notes

- FIFA per-match endpoints are **undocumented** — shapes can change and may be empty pre-match or for some
  fixtures. Validate + degrade gracefully; never block the panel on detail.
- Map events by **localized label**, not numeric `Type`.
- **Win probability is not an official FIFA figure** — compute-and-label or omit; never present as FIFA data.
- Rate limits: detail is fetched per match-open + while live; the per-match cache must absorb this.
- Sequence after the Vite/Hono migration settles (the endpoint lives in the Hono server; the hook uses TanStack
  Query) and is independent of the timeline-grid layout work.

## Verification

`npm run test` (mapper + stats-derivation + panel component tests green) → run the app, open a played FIFA
match: header shows competition/score/standings/scorers; TIMELINE lists goals/cards/subs; LINEUPS shows both
formations with photos; STATS shows possession + derived comparisons. Open a mock match → clean
"detail unavailable". Playwright smoke: open match → switch all three tabs → close (Escape).
