// Unit spec for `formatMatchScore(score)` — the NEW single-source-of-truth
// COMBINED score caption the radial inner nodes render
// (requirement 2026-06-30-1416; plan Test Strategy 5-9 / Acceptance #3).
//
// This is a NEW combined caption (the project had no combined formatter — the grid
// renders goals PER SIDE), sharing only the EN-DASH glyph U+2013 with the grid's
// empty-goal placeholder [M2]. Contract:
//   - regulation / extra-time decided → `"H–A"` (EN DASH, NOT a hyphen-minus),
//   - penalty shootout (`resolution:'penalties'` + BOTH tallies) → `"H–A (PH–PA pens)"`,
//   - `resolution:'penalties'` with EITHER tally null → base score only, NO `(pens)`,
//   - undecided (live null winner / scheduled EMPTY_SCORE / draw / missing goal) → null,
//   - pure / immutable.
//
// Shares the score fixtures with `resolve-teams.test.ts` (one source of truth for
// the winner-node + score test data) so the formatter and the winner rule are
// pinned against the SAME `Score` shapes.
//
// RED reason: `formatMatchScore` is an unimplemented stub that THROWS, so every
// assertion fails on MISSING LOGIC (the unimplemented formatter), not an absent
// export.
import { describe, expect, it } from 'vitest';
import { formatMatchScore } from './format-score';
import { makeScore } from '@/domain/bracket/__test-support__/match-fixtures';
import { deepFreeze } from './__test-support__/roadmap-fixtures';
import { EMPTY_SCORE } from '@/domain/types';

/** EN DASH (U+2013) — the SAME glyph the grid uses; shared at the char level only. */
const DASH = '–';

describe('formatMatchScore — decided regulation [Test 5 / Acceptance #3]', () => {
  it('formats a regulation home win as "H–A" using the EN-DASH glyph (U+2013)', () => {
    const out = formatMatchScore(makeScore({ home: 2, away: 1, winner: 'home' }));
    expect(out).toBe(`2${DASH}1`);
    // Pin the EXACT glyph: an EN DASH (U+2013), never a hyphen-minus or em dash.
    expect(out).toContain('–');
    expect(out).not.toContain('-'); // hyphen-minus (U+002D) must not appear
    expect(out).not.toContain('—'); // em dash must not appear either
  });

  it('formats an away win + extra-time as "H–A" too (resolution ignored for the base form)', () => {
    const out = formatMatchScore(
      makeScore({ home: 1, away: 2, winner: 'away', resolution: 'extra_time' }),
    );
    expect(out).toBe(`1${DASH}2`);
  });

  it('formats a 0–0-but-decided scoreline (e.g. a 0–0 regulation winner) without dropping zeros', () => {
    // Defensive: 0 is falsy — the formatter must not treat a 0 goal as "missing".
    const out = formatMatchScore(makeScore({ home: 0, away: 0, winner: 'home' }));
    expect(out).toBe(`0${DASH}0`);
  });
});

describe('formatMatchScore — penalty shootout [Test 6 / Acceptance #3]', () => {
  it('appends "(PH–PA pens)" for a penalties-resolved match with both tallies', () => {
    const out = formatMatchScore(
      makeScore({
        home: 1,
        away: 1,
        winner: 'home',
        resolution: 'penalties',
        penaltyHome: 4,
        penaltyAway: 2,
      }),
    );
    expect(out).toBe(`1${DASH}1 (4${DASH}2 pens)`);
    // The penalty tally uses the SAME EN-DASH glyph, never a hyphen-minus.
    expect(out).not.toContain('-');
  });
});

describe('formatMatchScore — penalties missing tally → base score only [Test 7 / Acceptance #3]', () => {
  it('renders base score only (no "(pens)") when the AWAY tally is null', () => {
    const out = formatMatchScore(
      makeScore({
        home: 1,
        away: 1,
        winner: 'home',
        resolution: 'penalties',
        penaltyHome: 4,
        penaltyAway: null,
      }),
    );
    expect(out).toBe(`1${DASH}1`);
    expect(out).not.toContain('pens');
  });

  it('renders base score only (no "(pens)") when the HOME tally is null (symmetric guard)', () => {
    const out = formatMatchScore(
      makeScore({
        home: 1,
        away: 1,
        winner: 'home',
        resolution: 'penalties',
        penaltyHome: null,
        penaltyAway: 2,
      }),
    );
    expect(out).toBe(`1${DASH}1`);
    expect(out).not.toContain('pens');
  });
});

describe('formatMatchScore — undecided → null [Test 8 / Acceptance #3, #4]', () => {
  it('live (winner null, goals present) → null', () => {
    expect(
      formatMatchScore(makeScore({ home: 1, away: 0, winner: null, resolution: null })),
    ).toBeNull();
  });

  it('scheduled (EMPTY_SCORE) → null', () => {
    expect(formatMatchScore(EMPTY_SCORE)).toBeNull();
  });

  it('draw (finished, winner "draw") → null', () => {
    expect(formatMatchScore(makeScore({ home: 1, away: 1, winner: 'draw' }))).toBeNull();
  });

  it('decided winner but the away goal is missing → null', () => {
    expect(formatMatchScore(makeScore({ home: 2, away: null, winner: 'home' }))).toBeNull();
  });

  it('decided winner but the home goal is missing → null (symmetric guard)', () => {
    expect(formatMatchScore(makeScore({ home: null, away: 1, winner: 'away' }))).toBeNull();
  });
});

describe('formatMatchScore — purity [Test 9]', () => {
  it('on a deeply-frozen Score: same string across calls, no throw / mutation', () => {
    const frozen = deepFreeze(
      makeScore({
        home: 1,
        away: 1,
        winner: 'away',
        resolution: 'penalties',
        penaltyHome: 3,
        penaltyAway: 4,
      }),
    );
    let first: string | null = null;
    expect(() => {
      first = formatMatchScore(frozen);
    }).not.toThrow();
    expect(first).toBe(`1${DASH}1 (3${DASH}4 pens)`);
    expect(formatMatchScore(frozen)).toBe(first);
  });
});
