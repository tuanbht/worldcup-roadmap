# Requirement: Release-blocker fixes — knockout live state + FIFA fetch reliability

Source: `requirements/change-request-2026-06-19.md`, the two REQUIRED (HIGH)
items (CR-1, CR-2). Both must be fixed before release. They are independent but
bundled here as one "release-blocker correctness/reliability" unit.

---

## CR-1 — Knockout cards must reflect real live state, not hardcoded "scheduled"

### Bug

`src/features/roadmap/build-graph.ts` → `knockoutMatchData(node)` hardcodes
`score: EMPTY_SCORE`, `status: 'scheduled'`, `kickoff: null`, `minute: null`.
`BracketNode` is structural-only; the real live `Match` (score/status/kickoff/
minute) lives in `tournament.matches`. The same live data already colors the
advance edges (`edgeState(status)` via `statusById`), but it is never merged
into the knockout card node. Result: every R16 / QF / SF / Final / 3rd-place
card shows a grey "scheduled" pill and blank score regardless of actual state —
a core failure for a _live_ roadmap.

### Fix

- In `buildRoadmapGraph`, build `const matchById = new Map(tournament.matches.map(m => [m.id, m]))`.
- Pass the resolved match into `knockoutMatchData(node, matchById.get(node.matchId))`
  and merge the live fields (`score`, `status`, `kickoff`, `minute`, and `venue`
  if available) when a real `Match` exists; fall back to `EMPTY_SCORE` /
  `'scheduled'` / `null` when it does not (unscheduled slot). Keep the structural
  fields (stage, roundLabel, home/away placeholders, isFinal/isThirdPlace) from
  the `BracketNode`.
- The merge must be immutable (return a new object; never mutate `node` or the
  `Match`).

### Acceptance criteria

1. A knockout `BracketNode` whose `matchId` maps to a `finished` match in
   `tournament.matches` yields a node with that match's real `score` and
   `status: 'finished'` (not `EMPTY_SCORE`/`'scheduled'`).
2. A knockout node whose `matchId` maps to a `live` match yields `status: 'live'`
   plus its `minute` and running `score`.
3. A knockout node with NO corresponding real match (unscheduled slot) still
   yields the safe fallback (`EMPTY_SCORE` / `'scheduled'` / `null`) and does not
   throw.
4. Group-stage cards are unchanged; existing build-graph tests stay green.
5. New `build-graph.test.ts` assertions cover #1–#3.

---

## CR-2 — FIFA fetches need a timeout / AbortController (both code paths)

### Bug

`src/data/providers/fifa/match-detail-client.ts` (the two parallel `live` +
`timelines` fetches in `fetchSection`) and `src/data/providers/fifa/client.ts`
(`fetchFifaMatches`) call `fetch(...)` with no `signal`/deadline. A
post-connect-hung FIFA socket pins the per-key single-flight `inflight` promise
in the cache layer, blocking every concurrent caller for that key until the OS/
undici timeout (minutes), and it defeats stale-on-error (which only triggers on a
_thrown_ error).

### Fix

- Add a shared request deadline of ~8–10 s to every FIFA `fetch`, via
  `AbortSignal.timeout(ms)` (preferred — it is supported by the Node/undici
  runtime) or an explicit `AbortController` + `setTimeout` cleared in `finally`.
- Pass the `signal` into each `fetch` call (both paths: the calendar pager in
  `client.ts` and the two parallel detail fetches in `match-detail-client.ts`).
- On abort/timeout in `client.ts` (which throws into the route), throw
  `RepositoryError('UPSTREAM_TIMEOUT', '…', 502)` — mirror the existing
  `RepositoryError('UPSTREAM_HTTP', …, 502)` shape. In `match-detail-client.ts`,
  whose `fetchSection` already swallows all errors to `null` for graceful
  degradation, a timeout must likewise degrade to `null` (caught in the existing
  `try/catch`) — do NOT make a slow detail section crash the route; just stop
  waiting.
- Use a single shared timeout constant (e.g. `FIFA_FETCH_TIMEOUT_MS`).

### Acceptance criteria

6. Every FIFA `fetch` call (calendar pager + both detail sections) passes an
   abort `signal` with a finite deadline.
7. A timed-out/aborted calendar fetch surfaces as
   `RepositoryError('UPSTREAM_TIMEOUT', …, 502)` (not a hung promise).
8. A timed-out/aborted detail section degrades to `null` (graceful), so the
   match-detail route still responds with whatever sections succeeded.
9. The happy path (mockable `fetch`) is unchanged; existing FIFA client/mapper
   tests stay green.
10. Tests prove #6–#8 by mocking `fetch` to reject with an abort-style error (or
    a never-resolving promise driven by fake timers) and asserting the timeout
    classification / graceful-null behavior. Keep tests deterministic (fake
    timers or injected signal — no real multi-second waits).

---

## Constraints (whole requirement)

- Library-first per `requirements/library-first-stack-policy.md`: use the
  platform `fetch` + `AbortSignal.timeout`/`AbortController`; no new HTTP
  dependency. Reuse the existing `RepositoryError` / error types.
- Immutability per the coding-style rules; functions < 50 lines; explicit error
  handling at the boundary.
- All gates green and deterministic on any machine zone: `npm run test`,
  `npm run typecheck`, `npm run build`, and `npx prettier --check` on the
  touched files.

## Files likely touched

- `src/features/roadmap/build-graph.ts` + `build-graph.test.ts` (CR-1)
- `src/data/providers/fifa/client.ts` (CR-2)
- `src/data/providers/fifa/match-detail-client.ts` (CR-2)
- `src/data/errors.ts` (if `UPSTREAM_TIMEOUT` needs registering) + the FIFA
  client tests.
