import { describe, expect, it } from 'vitest';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { dayKey, computeDayIndex, orderedDays } from './day-axis';
import { localTimeZone, resolveTimeZone } from '@/lib/datetime';
import {
  deepFreeze,
  distinctMatchDays,
  fixtureDayKey,
  loadTournament,
} from '../__test-support__/roadmap-fixtures';

/**
 * Spec for the shared day axis (`day-axis.ts`) — the single chronological row
 * index that BOTH the group grid and the knockout funnel hang their `y` off
 * (requirement "Coordinate model > Day axis (shared)"; plan Test Strategy 1-7 /
 * Acceptance #1, #3, #4).
 *
 * DETERMINISM CONTRACT (req "Tests > determinism is critical"): the production
 * functions now default to the VIEWER LOCAL zone (mirroring `lib/datetime`).
 * Every assertion that compares against a UTC-slice constant or `fixtureDayKey`
 * MUST pin `tz: 'UTC'` so it holds on ANY machine zone (a non-UTC CI box would
 * otherwise see matches roll to another calendar day). The two non-pinned tests
 * (self-referential default; default == resolveTimeZone) are machine-AGNOSTIC by
 * construction — they assert a relation, never a literal date — so they stay
 * green whatever zone the runner sits in.
 *
 * RED until `dayKey`/`orderedDays`/`computeDayIndex` accept an optional `tz` and
 * route the key through `formatInTimeZone(parseISO(iso), resolveTimeZone(tz), …)`.
 * Counts are fixture-derived (the distinct UTC days in the mock), never hardcoded.
 */

// --- Shared fixtures + zone constants (DRY: one source for every test) -------
const tournament = loadTournament();
const matches = tournament.matches;
const days = distinctMatchDays(tournament); // ascending UTC 'yyyy-MM-dd'

/** Pinned to keep UTC-slice comparisons deterministic on ANY machine zone. */
const UTC = 'UTC';
/** UTC+7, no DST: evening-UTC fixtures (18:00Z+) roll FORWARD a calendar day. */
const BANGKOK = 'Asia/Bangkok';
/** UTC-4/-5 with DST: early-UTC instants roll BACKWARD a calendar day. */
const NEW_YORK = 'America/New_York';

/** The same conversion the production `dayKey` must use — an independent oracle
 *  (date-fns-tz directly) so a test never re-uses the code under test. */
const oracleDayKey = (iso: string, tz: string): string =>
  formatInTimeZone(parseISO(iso), tz, 'yyyy-MM-dd');

const utcIndex = () => computeDayIndex(matches, UTC);

describe('dayKey — UTC semantics (pinned tz:UTC) [Acceptance #5]', () => {
  it("returns a 'yyyy-MM-dd' calendar key in the pinned zone", () => {
    expect(dayKey('2026-06-11T12:00:00.000Z', UTC)).toBe('2026-06-11');
  });

  it('collapses a later instant on the same UTC day to the same key', () => {
    const morning = dayKey('2026-06-11T00:30:00.000Z', UTC);
    const evening = dayKey('2026-06-11T23:45:00.000Z', UTC);
    expect(morning).toBe(evening);
    expect(morning).toBe('2026-06-11');
  });

  it('keys by the UTC calendar day, not the literal date prefix, across an offset', () => {
    // A non-UTC offset that rolls the instant into the PREVIOUS UTC day: the
    // local-clock prefix is 2026-06-12 but the UTC day is 2026-06-11. This pins
    // a real UTC conversion (date-fns-tz against 'UTC') and forbids a naive
    // `iso.slice(0, 10)` shortcut.
    expect(dayKey('2026-06-12T01:30:00.000+05:00', UTC)).toBe('2026-06-11');
    // ...and an offset that rolls FORWARD into the next UTC day.
    expect(dayKey('2026-06-11T23:30:00.000-03:00', UTC)).toBe('2026-06-12');
  });

  it('is lexically sortable == chronologically ordered (earlier day sorts first)', () => {
    const earlier = dayKey('2026-06-11T16:00:00.000Z', UTC);
    const later = dayKey('2026-07-19T12:00:00.000Z', UTC);
    expect(earlier < later).toBe(true);
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });
});

describe('dayKey — local-zone grouping [Acceptance #1/#4]', () => {
  it('rolls an evening-UTC instant FORWARD when the zone is east of UTC', () => {
    // 20:30Z is still 11 Jun in UTC but 12 Jun 03:30 in Asia/Bangkok (UTC+7).
    // The grouping day must follow the explicit zone, matching the card time.
    const iso = '2026-06-11T20:30:00.000Z';
    expect(dayKey(iso, BANGKOK)).toBe('2026-06-12');
    // ...while pinning UTC on the SAME instant still keys the previous day,
    // proving the zone actually drives the key (not the literal prefix).
    expect(dayKey(iso, UTC)).toBe('2026-06-11');
  });

  it('rolls an early-UTC instant BACKWARD when the zone is west of UTC', () => {
    // 02:00Z on 12 Jun is still 11 Jun 22:00 in America/New_York (UTC-4 DST).
    expect(dayKey('2026-06-12T02:00:00.000Z', NEW_YORK)).toBe('2026-06-11');
  });

  it('uses a real DST-aware conversion, not a fixed offset (library-first) [Acceptance #5]', () => {
    // Two instants 6 months apart in New York: one in EST (UTC-5), one in EDT
    // (UTC-4). A hand-rolled fixed-offset hack would mis-key one of them; only a
    // genuine date-fns-tz conversion gets BOTH right. 04:30Z in winter is still
    // the previous local day; 03:30Z in summer is also the previous local day —
    // each must match the independent oracle, locking out offset arithmetic.
    const winter = '2026-01-15T04:30:00.000Z'; // EST: 11:30 PM 14 Jan local
    const summer = '2026-07-15T03:30:00.000Z'; // EDT: 11:30 PM 14 Jul local
    expect(dayKey(winter, NEW_YORK)).toBe(oracleDayKey(winter, NEW_YORK));
    expect(dayKey(summer, NEW_YORK)).toBe(oracleDayKey(summer, NEW_YORK));
    expect(dayKey(winter, NEW_YORK)).toBe('2026-01-14');
    expect(dayKey(summer, NEW_YORK)).toBe('2026-07-14');
  });

  it('defaults to the viewer local zone (self-referential, machine-agnostic)', () => {
    // No constant to compare against (the CI machine zone is unknown): the
    // contract is that omitting tz === passing localTimeZone(), mirroring the
    // lib/datetime façade. True on any machine without pinning a literal.
    const iso = '2026-06-11T20:30:00.000Z';
    expect(dayKey(iso)).toBe(dayKey(iso, localTimeZone()));
  });

  it('treats an undefined tz identically to resolveTimeZone(undefined) [Acceptance #4]', () => {
    // The façade contract: the default path must funnel through the SAME
    // `resolveTimeZone` the rest of the app uses, so grouping == label == card.
    // Machine-agnostic: both sides resolve to the same zone on any runner.
    const iso = '2026-07-19T16:00:00.000Z';
    expect(dayKey(iso)).toBe(dayKey(iso, resolveTimeZone(undefined)));
  });
});

describe('computeDayIndex (pinned tz:UTC) [Acceptance #4]', () => {
  it('maps each distinct calendar day to a 0-based, contiguous, ascending row', () => {
    const index = utcIndex();
    expect(index.size).toBe(days.length); // distinct days only
    const indices = days.map((d) => index.get(d));
    expect(indices).toEqual(days.map((_d, i) => i)); // 0,1,2,... in date order
  });

  it('collapses identical-day matches onto a single shared index', () => {
    const index = utcIndex();
    // The mock pairs every group matchday on one day, so >=2 matches share a row.
    const jun11 = matches.filter((m) => fixtureDayKey(m.kickoff) === '2026-06-11');
    expect(jun11.length).toBeGreaterThan(1);
    const rows = new Set(jun11.map((m) => index.get(fixtureDayKey(m.kickoff))));
    expect(rows.size).toBe(1);
  });

  it('shares ONE axis across group and knockout: the Final day has the max index', () => {
    const index = utcIndex();
    const finalDay = fixtureDayKey(matches.find((m) => m.stage === 'FINAL')!.kickoff);
    const groupDay = fixtureDayKey(matches.find((m) => m.stage === 'GROUP_STAGE')!.kickoff);
    const maxIndex = Math.max(...index.values());
    expect(index.get(finalDay)).toBe(maxIndex);
    expect(index.get(groupDay)!).toBeLessThan(index.get(finalDay)!);
  });

  it('agrees with the fixtureDayKey (UTC-slice) day list when pinned to UTC', () => {
    // The helper slices the literal ISO prefix; pinning tz:UTC makes the
    // production index agree on ANY machine zone — the determinism invariant.
    expect([...utcIndex().keys()].sort()).toEqual(days);
  });

  it('re-keys the index in an explicit non-UTC zone, rolling evening-UTC days forward', () => {
    // Evening-UTC fixtures (18:00Z+) roll into the NEXT Bangkok day, so the local
    // grouping yields strictly MORE distinct day-rows than the UTC grouping AND
    // every Bangkok key matches the independent date-fns-tz oracle — proving tz
    // is honoured end-to-end by computeDayIndex, not just by dayKey.
    const bkkIndex = computeDayIndex(matches, BANGKOK);
    expect(bkkIndex.size).toBeGreaterThan(utcIndex().size);

    const expectedBkkDays = [
      ...new Set(matches.map((m) => oracleDayKey(m.kickoff, BANGKOK))),
    ].sort();
    expect([...bkkIndex.keys()].sort()).toEqual(expectedBkkDays);
    // Concrete proof a day rolled: at least one Bangkok key is absent from the
    // UTC-day list (guard against a vacuous "more rows" pass if fixtures change).
    expect(expectedBkkDays.some((d) => !days.includes(d))).toBe(true);
  });

  it('is pure: equal input -> equal map, and a frozen input does not throw', () => {
    const frozen = deepFreeze(loadTournament());
    const a = computeDayIndex(frozen.matches, UTC);
    const b = computeDayIndex(frozen.matches, UTC);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('returns an empty index for an empty match list (boundary)', () => {
    expect(computeDayIndex([], UTC).size).toBe(0);
  });

  it('collapses a single match to exactly one row at index 0 (boundary)', () => {
    const one = [matches[0]];
    const index = computeDayIndex(one, UTC);
    expect(index.size).toBe(1);
    expect(index.get(dayKey(one[0].kickoff, UTC))).toBe(0);
  });
});

describe('orderedDays (pinned tz:UTC) [Acceptance #4]', () => {
  it('returns every distinct day key once, ascending', () => {
    expect(orderedDays(matches, UTC)).toEqual(days);
  });

  it('agrees with computeDayIndex: orderedDays[i] has index i', () => {
    const ordered = orderedDays(matches, UTC);
    const index = utcIndex();
    expect(ordered.length).toBe(index.size); // no extra/missing days
    ordered.forEach((day, i) => expect(index.get(day)).toBe(i));
  });

  it('honours an explicit non-UTC zone (Bangkok rolls evening-UTC days forward)', () => {
    // Mirrors the computeDayIndex non-UTC case so orderedDays is not assumed to
    // share dayKey's zone — it must thread tz itself (Acceptance #4).
    const ordered = orderedDays(matches, BANGKOK);
    const expectedBkkDays = [
      ...new Set(matches.map((m) => oracleDayKey(m.kickoff, BANGKOK))),
    ].sort();
    expect([...ordered]).toEqual(expectedBkkDays);
    expect(ordered.length).toBeGreaterThan(days.length);
  });

  it('returns an empty array for an empty match list (boundary)', () => {
    expect(orderedDays([], UTC)).toEqual([]);
  });
});
