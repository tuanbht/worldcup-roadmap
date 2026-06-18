import { describe, expect, it } from 'vitest';
import { dayKey, computeDayIndex, orderedDays } from './day-axis';
import {
  deepFreeze,
  distinctMatchDays,
  fixtureDayKey,
  loadTournament,
} from '../__test-support__/roadmap-fixtures';

/**
 * Spec for the NEW shared day axis (`day-axis.ts`) — the single chronological
 * row index that BOTH the group grid and the knockout funnel hang their `y` off
 * (requirement "Coordinate model > Day axis (shared)"; plan Test Strategy 1-4 /
 * Acceptance #3).
 *
 * RED until `day-axis.ts` exists. Counts are fixture-derived (14 distinct days
 * in the mock: group Jun 11/15/19 + KO Jun 28 -> Jul 19), never hardcoded.
 */

const tournament = loadTournament();
const days = distinctMatchDays(tournament); // ascending 'yyyy-MM-dd'

describe('dayKey', () => {
  it("returns a UTC 'yyyy-MM-dd' calendar key", () => {
    expect(dayKey('2026-06-11T12:00:00.000Z')).toBe('2026-06-11');
  });

  it('collapses a later instant on the same UTC day to the same key', () => {
    const morning = dayKey('2026-06-11T00:30:00.000Z');
    const evening = dayKey('2026-06-11T23:45:00.000Z');
    expect(morning).toBe(evening);
  });

  it('keys by the UTC calendar day, not the literal date prefix, across an offset', () => {
    // A non-UTC offset that rolls the instant into the PREVIOUS UTC day: the
    // local-clock prefix is 2026-06-12 but the UTC day is 2026-06-11. This pins
    // a real UTC conversion (date-fns-tz against 'UTC') and forbids a naive
    // `iso.slice(0, 10)` shortcut.
    expect(dayKey('2026-06-12T01:30:00.000+05:00')).toBe('2026-06-11');
    // ...and an offset that rolls FORWARD into the next UTC day.
    expect(dayKey('2026-06-11T23:30:00.000-03:00')).toBe('2026-06-12');
  });

  it('is lexically sortable == chronologically ordered (earlier day sorts first)', () => {
    const earlier = dayKey('2026-06-11T16:00:00.000Z');
    const later = dayKey('2026-07-19T12:00:00.000Z');
    expect(earlier < later).toBe(true);
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });
});

describe('computeDayIndex', () => {
  it('maps each distinct calendar day to a 0-based, contiguous, ascending row', () => {
    const index = computeDayIndex(tournament.matches);
    expect(index.size).toBe(days.length); // distinct days only
    const indices = days.map((d) => index.get(d));
    expect(indices).toEqual(days.map((_d, i) => i)); // 0,1,2,... in date order
  });

  it('collapses identical-day matches onto a single shared index', () => {
    const index = computeDayIndex(tournament.matches);
    // The mock pairs every group matchday on one day, so >=2 matches share a row.
    const jun11 = tournament.matches.filter((m) => fixtureDayKey(m.kickoff) === '2026-06-11');
    expect(jun11.length).toBeGreaterThan(1);
    const rows = new Set(jun11.map((m) => index.get(fixtureDayKey(m.kickoff))));
    expect(rows.size).toBe(1);
  });

  it('shares ONE axis across group and knockout: the Final day has the max index', () => {
    const index = computeDayIndex(tournament.matches);
    const finalDay = fixtureDayKey(tournament.matches.find((m) => m.stage === 'FINAL')!.kickoff);
    const groupDay = fixtureDayKey(
      tournament.matches.find((m) => m.stage === 'GROUP_STAGE')!.kickoff,
    );
    const maxIndex = Math.max(...[...index.values()]);
    expect(index.get(finalDay)).toBe(maxIndex);
    expect(index.get(groupDay)).toBeLessThan(index.get(finalDay)!);
  });

  it('is pure: equal input -> equal map, and a frozen input does not throw', () => {
    const frozen = deepFreeze(loadTournament());
    const a = computeDayIndex(frozen.matches);
    const b = computeDayIndex(frozen.matches);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('returns an empty index for an empty match list (boundary)', () => {
    expect(computeDayIndex([]).size).toBe(0);
  });
});

describe('orderedDays', () => {
  it('returns every distinct day key once, ascending', () => {
    expect(orderedDays(tournament.matches)).toEqual(days);
  });

  it('agrees with computeDayIndex: orderedDays[i] has index i', () => {
    const ordered = orderedDays(tournament.matches);
    const index = computeDayIndex(tournament.matches);
    expect(ordered.length).toBe(index.size); // no extra/missing days
    ordered.forEach((day, i) => expect(index.get(day)).toBe(i));
  });

  it('returns an empty array for an empty match list (boundary)', () => {
    expect(orderedDays([])).toEqual([]);
  });
});
