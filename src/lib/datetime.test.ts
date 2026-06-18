// Node environment. Deterministic by construction: assertions either pin an
// explicit IANA zone, or compare the no-zone default against `localTimeZone()`
// self-referentially — so a result never hard-codes the machine's local zone.
// No real clock and no `new Date()` without an argument anywhere in this file.
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatTime,
  localTimeZone,
  resolveTimeZone,
} from '@/lib/datetime';

// --- Fixtures -------------------------------------------------------------

/** Fixed UTC instant. 14:30 UTC lands on a different wall-clock hour in UTC /
 *  New York / Tokyo, so the one fixture also serves the cross-zone tests. */
const KICKOFF_UTC = '2026-06-02T14:30:00.000Z';

/** Late-evening UTC instant that crosses the calendar date when shifted east.
 *  22:30 UTC is 07:30 the NEXT day in Tokyo (UTC+9) — proves the formatter does
 *  a real zone conversion (date rolls over), not a naive string slice. */
const LATE_NIGHT_UTC = '2026-06-02T22:30:00.000Z';

const NY = 'America/New_York'; // UTC-4 in June (EDT)
const TOKYO = 'Asia/Tokyo'; // UTC+9 year-round

/** Inputs every formatter must reject, mapped to a human-readable case name.
 *  Covers null, the boundaries (empty / whitespace), and a non-ISO garbage
 *  string that `parseISO` cannot interpret. */
const INVALID_INPUTS: ReadonlyArray<readonly [name: string, value: string | null]> = [
  ['null', null],
  ['an empty string', ''],
  ['a whitespace-only string', '   '],
  ['a non-ISO garbage string', 'not-a-date'],
];

describe('datetime façade — formatDateTime', () => {
  it('renders the explicit-UTC wall clock as "dd MMM, HH:mm"', () => {
    expect(formatDateTime(KICKOFF_UTC, 'UTC')).toBe('02 Jun, 14:30');
  });

  it('shifts the wall clock for a non-UTC zone (date-fns-tz wired, not the Intl machine zone)', () => {
    // The SAME instant in America/New_York (UTC-4 in June) is 10:30 local.
    expect(formatDateTime(KICKOFF_UTC, NY)).toBe('02 Jun, 10:30');
  });

  it('rolls the calendar date forward when an eastward zone crosses midnight', () => {
    // 22:30 UTC on Jun 02 is 07:30 on Jun 03 in Tokyo — both the date and the
    // time must change, which a real tz conversion does and a slice does not.
    expect(formatDateTime(LATE_NIGHT_UTC, TOKYO)).toBe('03 Jun, 07:30');
  });

  it('defaults to the viewer local zone when no zone is supplied', () => {
    expect(formatDateTime(KICKOFF_UTC)).toBe(formatDateTime(KICKOFF_UTC, localTimeZone()));
  });

  it.each(INVALID_INPUTS)('falls back to "Date TBD" for %s', (_name, value) => {
    expect(formatDateTime(value)).toBe('Date TBD');
  });
});

describe('datetime façade — formatTime', () => {
  it('renders the explicit-UTC time as "HH:mm"', () => {
    expect(formatTime(KICKOFF_UTC, 'UTC')).toBe('14:30');
  });

  it('shifts the time for a non-UTC zone', () => {
    // Asia/Tokyo is UTC+9 → 14:30 UTC becomes 23:30 local.
    expect(formatTime(KICKOFF_UTC, TOKYO)).toBe('23:30');
  });

  it.each(INVALID_INPUTS)('falls back to "--:--" for %s', (_name, value) => {
    expect(formatTime(value)).toBe('--:--');
  });
});

describe('datetime façade — formatDate', () => {
  it('renders the explicit-UTC date as "dd MMM"', () => {
    expect(formatDate(KICKOFF_UTC, 'UTC')).toBe('02 Jun');
  });

  it('rolls the date forward in an eastward zone that crosses midnight', () => {
    expect(formatDate(LATE_NIGHT_UTC, TOKYO)).toBe('03 Jun');
  });

  it.each(INVALID_INPUTS)('falls back to "TBD" for %s', (_name, value) => {
    expect(formatDate(value)).toBe('TBD');
  });
});

describe('datetime façade — cross-zone divergence (proves real conversion, not the Intl default)', () => {
  it('formats one instant differently in UTC vs America/New_York', () => {
    expect(formatDateTime(KICKOFF_UTC, 'UTC')).not.toBe(formatDateTime(KICKOFF_UTC, NY));
  });

  it('formats the same instant identically for two calls in the same zone (pure / referentially transparent)', () => {
    expect(formatDateTime(KICKOFF_UTC, TOKYO)).toBe(formatDateTime(KICKOFF_UTC, TOKYO));
  });
});

describe('datetime façade — resolveTimeZone', () => {
  it('returns the viewer local zone when nothing is passed', () => {
    expect(resolveTimeZone()).toBe(localTimeZone());
  });

  it('returns the viewer local zone when undefined is passed', () => {
    expect(resolveTimeZone(undefined)).toBe(localTimeZone());
  });

  it('returns the explicit zone unchanged when one is supplied', () => {
    expect(resolveTimeZone(TOKYO)).toBe('Asia/Tokyo');
  });
});
