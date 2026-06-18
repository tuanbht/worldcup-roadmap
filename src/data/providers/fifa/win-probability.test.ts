import { describe, expect, it } from 'vitest';
import { estimateWinProbability, type WinProbabilityInput } from './win-probability';

function input(over: Partial<WinProbabilityInput>): WinProbabilityInput {
  return {
    status: 'live',
    homeGoals: 0,
    awayGoals: 0,
    minute: 45,
    homeShots: 5,
    awayShots: 5,
    homePossession: 50,
    awayPossession: 50,
    ...over,
  };
}

describe('estimateWinProbability', () => {
  it('returns null pre-match (scheduled) — never an unlabeled figure before kickoff', () => {
    expect(
      estimateWinProbability(input({ status: 'scheduled', homeGoals: null, awayGoals: null })),
    ).toBeNull();
  });

  it('is always labeled as an estimate (estimated: true)', () => {
    const wp = estimateWinProbability(input({ homeGoals: 1, awayGoals: 0, minute: 60 }));
    expect(wp).not.toBeNull();
    expect(wp!.estimated).toBe(true);
  });

  it('gives the leading home side the larger share', () => {
    const wp = estimateWinProbability(input({ homeGoals: 2, awayGoals: 0, minute: 70 }));
    expect(wp).not.toBeNull();
    expect(wp!.home).toBeGreaterThan(wp!.away);
  });

  it('mirrors for the away side — the away lead gives away the larger share', () => {
    const wp = estimateWinProbability(input({ homeGoals: 0, awayGoals: 2, minute: 70 }));
    expect(wp).not.toBeNull();
    expect(wp!.away).toBeGreaterThan(wp!.home);
  });

  it('still produces a labeled figure for a finished match', () => {
    const wp = estimateWinProbability(
      input({ status: 'finished', homeGoals: 1, awayGoals: 0, minute: 90 }),
    );
    expect(wp).not.toBeNull();
    expect(wp!.estimated).toBe(true);
    expect(wp!.home + wp!.draw + wp!.away).toBe(100);
  });

  it('is draw-heavy at an early 0-0', () => {
    const wp = estimateWinProbability(input({ homeGoals: 0, awayGoals: 0, minute: 5 }));
    expect(wp).not.toBeNull();
    expect(wp!.draw).toBeGreaterThan(wp!.home);
    expect(wp!.draw).toBeGreaterThan(wp!.away);
  });

  // L-C: home + draw + away must sum EXACTLY to 100 (no ±1), in every overflow
  // direction (away clamps below 0; home exceeds 100; draw exceeds 100).
  describe('renormalization invariant (sum === 100 in all directions)', () => {
    it('sums to 100 when the home side leads late (away would clamp negative)', () => {
      const wp = estimateWinProbability(
        input({ homeGoals: 4, awayGoals: 0, minute: 89, homeShots: 20, awayShots: 1 }),
      );
      expect(wp).not.toBeNull();
      expect(wp!.home + wp!.draw + wp!.away).toBe(100);
      expect(wp!.away).toBeGreaterThanOrEqual(0);
      expect(wp!.home).toBeLessThanOrEqual(100);
    });

    it('sums to 100 in a blowout home lead (home would exceed 100)', () => {
      const wp = estimateWinProbability(
        input({ homeGoals: 6, awayGoals: 0, minute: 90, homeShots: 30, awayShots: 0 }),
      );
      expect(wp).not.toBeNull();
      expect(wp!.home + wp!.draw + wp!.away).toBe(100);
      expect(wp!.home).toBeGreaterThanOrEqual(0);
      expect(wp!.home).toBeLessThanOrEqual(100);
    });

    it('sums to 100 at an early 0-0 (draw would exceed 100)', () => {
      const wp = estimateWinProbability(
        input({ homeGoals: 0, awayGoals: 0, minute: 1, homeShots: 0, awayShots: 0 }),
      );
      expect(wp).not.toBeNull();
      expect(wp!.home + wp!.draw + wp!.away).toBe(100);
      expect(wp!.draw).toBeLessThanOrEqual(100);
    });
  });
});
