# Requirement: Localize the day-axis grouping to the viewer's timezone

## Context

This is the deferred follow-up named in the **Edge note** of
`requirements/kickoff-local-timezone.md`. That change localized the displayed
kickoff **time** (via `src/lib/datetime.ts`'s `localTimeZone()` default) but
explicitly left `src/features/roadmap/layout/day-axis.ts` keying day-rows off a
**UTC** `yyyy-MM-dd` string. The deferred edge case has now been reported as a bug.

## Bug (observed)

On the timeline grid, a match's left-rail **date pill** disagrees with the
match's own locally-rendered kickoff. The card shows a local time (e.g. `02:00`,
`05:00`), but the row it lives in is grouped by the match's **UTC** calendar day,
not its **local** day. So a match that is locally on (say) 19 Jun can be pushed
into the row whose pill reads a different date — the label and the grouping use
different timezones.

## Root cause

`day-axis.ts` hardcodes `const DAY_ZONE = 'UTC'`, and its comment falsely claims
this "matches `lib/datetime`'s zone." Since the `kickoff-local-timezone` change,
`lib/datetime` renders in the **viewer's local** zone, not UTC. The day-row
**grouping zone** (UTC) and the **label + card** zone (local) diverged. The user's
own diagnosis: "you only convert in match, not when ordering."

## Decision

Localize the day-axis key to the **same** zone the façade uses, routed through the
date library (`date-fns` + `date-fns-tz`) via `lib/datetime` — no hand-rolled date
math, no `iso.slice(0, 10)` in production.

- `dayKey(iso, tz = localTimeZone())`: keep the sortable `yyyy-MM-dd` shape using
  `formatInTimeZone(parseISO(iso), resolveTimeZone(tz), 'yyyy-MM-dd')`. Import
  `localTimeZone` / `resolveTimeZone` from `@/lib/datetime`. Default to the
  viewer's local zone so **grouping == label == card time**.
- Thread an optional `tz` through `orderedDays(matches, tz?)` and
  `computeDayIndex(matches, tz?)`, mirroring the `lib/datetime` façade contract:
  an explicit `tz` wins; default is local.
- **One zone for the whole graph.** `build-graph.ts`, `group-layout.ts`
  (`rowYForKickoff` → `dayKey`) and `bracket-layout.ts` (`rowYForKickoff` →
  `dayKey`) must all resolve to the same zone as the day-marker label. Prefer
  resolving the zone once in `buildRoadmapGraph` and threading it down so group
  rows, knockout rows, ordering and the marker label are provably identical.
- The day-marker **label** stays `formatDate(representativeIso)` (already local) —
  now consistent with the local grouping. Correct the stale comment in
  `day-axis.ts`.

## Library-first constraint

Per `requirements/library-first-stack-policy.md`: all timezone work goes through
`date-fns` / `date-fns-tz` and the single `lib/datetime` façade. No hand-rolled
offset math in production. `fixtureDayKey` (a test helper) may keep a UTC slice
**only** if the tests that compare against it pin `tz: 'UTC'` on the production
functions, so the helper and the computed index agree on any machine.

## Tests (determinism is critical)

Fixture kickoffs are at **evening UTC** (≈19:00–23:xx), so any zone east of UTC
rolls some matches into the next calendar day. Tests must be deterministic on ANY
machine zone:

- `day-axis.test.ts`: the assertions that hardcode UTC dates
  (`dayKey('…T12:00Z') === '2026-06-11'`, the `+05:00` / `-03:00` offset cases)
  must pass an explicit `tz: 'UTC'` so they keep asserting UTC semantics. Add NEW
  assertions proving local grouping, e.g.
  `dayKey('2026-06-11T20:30:00.000Z', 'Asia/Bangkok') === '2026-06-12'`, and a
  self-referential default (`dayKey(iso)` === `dayKey(iso, localTimeZone())`).
- `computeDayIndex` / `orderedDays` tests and the layout tests
  (`group-layout.test.ts`, `bracket-layout.test.ts`, `build-graph.test.ts`) that
  compare against `fixtureDayKey` (UTC slice) must pin the SAME zone — pass
  `tz: 'UTC'` (thread a `tz` param through `buildRoadmapGraph` for testability if
  needed) so UTC-slice fixtures and the computed index agree on any machine. Do
  not weaken these tests.
- **Regression test for this bug:** build the graph in a non-UTC zone (e.g.
  `Asia/Bangkok`) and assert that for every match, the day-marker on its row has a
  `dayKey`/`dayLabel` equal to that match's kickoff calendar date **in that same
  zone** (label == card local date). This is the invariant that was violated.
- E2E: `playwright.config.ts` already pins `timezoneId`; extend one assertion to
  confirm a near-midnight-UTC match's row pill matches its card date.

## Acceptance criteria

1. Day-rows group by the **viewer's local** calendar day — the same zone as the
   card kickoff time and the date pill.
2. For every match, the date pill on its row equals the match card's own local
   kickoff date (bug gone), verified in a non-UTC zone.
3. Grouping, ordering, group-grid rows and knockout-funnel rows all use ONE
   consistent zone — no divergence between `build-graph`, `group-layout`,
   `bracket-layout`.
4. `dayKey` / `orderedDays` / `computeDayIndex` accept an optional `tz` that
   overrides; default is `localTimeZone()` — mirroring the `lib/datetime` façade.
5. Implemented via `date-fns` / `date-fns-tz` through `lib/datetime`; no
   hand-rolled timezone math in production code.
6. `npm run test` is deterministic on any machine zone; `npm run typecheck`,
   lint, and `npm run build` all pass.
7. The stale comment in `day-axis.ts` ("matches lib/datetime's zone") is corrected.

## Files likely touched

- `src/features/roadmap/layout/day-axis.ts` — zone + optional `tz`.
- `src/features/roadmap/build-graph.ts` — resolve zone once, thread down; label
  already local.
- `src/features/roadmap/layout/group-layout.ts`, `bracket-layout.ts` —
  `rowYForKickoff` → `dayKey` in the same zone.
- Tests: `day-axis.test.ts`, `build-graph.test.ts`, `group-layout.test.ts`,
  `bracket-layout.test.ts`; note the `roadmap-fixtures.ts` `fixtureDayKey` zone
  assumption.
