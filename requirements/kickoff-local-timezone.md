# Requirement: Render match kickoff times in the viewer's local timezone

## Context
Match kickoff times currently render in **UTC** — the single date façade
`src/lib/datetime.ts` hardcodes `DEFAULT_TZ = 'UTC'`. Users expect each match's time to show in **their own
(browser) timezone**.

## Scope
- The displayed kickoff **time/date** on the three consumers of the façade: `MatchNode`, `StatusPill`,
  `MatchDetailPanel` (all call `formatDateTime` / `formatTime` / `formatDate` without a `tz`).
- **Out of scope:** `src/features/roadmap/layout/day-axis.ts` — it keys day-rows off a UTC `yyyy-MM-dd` string
  on purpose (lexical == chronological sortability). Leave it as-is. (See _Edge note_.)

## Decision
In `src/lib/datetime.ts`, change the default zone from a fixed `'UTC'` to the **viewer's local IANA zone**:
- Add `localTimeZone()` → `Intl.DateTimeFormat().resolvedOptions().timeZone`, falling back to `'UTC'` when the
  runtime can't resolve one (wrap in try/catch).
- `resolveTimeZone(explicit?)` returns `explicit ?? localTimeZone()` — the explicit `tz` argument still wins.
- No call-site changes: all three consumers inherit local time through the façade.

## Tests
- `src/lib/datetime.test.ts`: the two "defaults to UTC" assertions become **self-referential**
  (`formatDateTime(iso)` === `formatDateTime(iso, localTimeZone())`; `resolveTimeZone()` === `localTimeZone()`),
  so they stay deterministic on any machine. The explicit-zone tests (UTC / NY / Tokyo) are unchanged.
- E2E: pin `timezoneId` in `playwright.config.ts` so visual/text snapshots are reproducible regardless of CI
  machine zone.

## Acceptance criteria
- Kickoff times/dates render in the viewer's local timezone by default.
- Passing an explicit `tz` still overrides (façade contract preserved).
- `npm run test` is deterministic on any machine zone; `day-axis` grouping is unchanged.

## Edge note (optional follow-up)
Day-rows remain UTC-keyed while times display local, so a match kicking off near midnight UTC can show a local
time whose calendar date differs from its row. If that ever reads wrong, localize the `day-axis` key too — a
separate change.
