import { describe, expect, it } from 'vitest';
import type { WinProbability } from '@/domain/types';
import {
  estimateWinProbability,
  NEUTRAL_SPLIT,
  renormalize,
  type WinProbabilityInput,
} from './win-probability';

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

/**
 * CR-12 — `renormalize(0,0,0)` must return the neutral split. An all-zero input
 * (sum <= 0) or any non-finite input must short-circuit to the project neutral
 * distribution instead of dividing by / absorbing into a meaningless sum.
 * Acceptance #5 (requirement) / plan acceptance #7-#9.
 */
describe('renormalize all-zero / non-finite guard (CR-12)', () => {
  /** Assert a split is a usable distribution: no NaN, all finite, sums to 100. */
  function expectValidDistribution(wp: WinProbability): void {
    for (const part of [wp.home, wp.draw, wp.away]) {
      expect(Number.isNaN(part)).toBe(false);
      expect(Number.isFinite(part)).toBe(true);
    }
    expect(wp.home + wp.draw + wp.away).toBe(100);
    expect(wp.estimated).toBe(true);
  }

  it('NEUTRAL_SPLIT is itself a valid normalized distribution (finite, sums to 100, labeled)', () => {
    expectValidDistribution(NEUTRAL_SPLIT);
  });

  it('renormalize(0, 0, 0) returns a finite split with no NaN, summing to 100 (acceptance #5/#7)', () => {
    expectValidDistribution(renormalize(0, 0, 0));
  });

  it('renormalize(0, 0, 0) deep-equals the NEUTRAL_SPLIT const (no drift) (acceptance #8)', () => {
    expect(renormalize(0, 0, 0)).toEqual(NEUTRAL_SPLIT);
  });

  it.each([
    ['all-zero', [0, 0, 0]],
    ['negative sum (home)', [-5, 0, 0]],
    ['negative sum (all)', [-1, -2, -3]],
    ['zero after the home component', [0, -10, 0]],
  ])('returns NEUTRAL_SPLIT for a %s input (sum <= 0 guard)', (_label, [h, d, a]) => {
    const wp = renormalize(h, d, a);
    expect(wp).toEqual(NEUTRAL_SPLIT);
    expectValidDistribution(wp);
  });

  it.each([
    ['NaN home', [NaN, 0, 0]],
    ['Infinity draw', [0, Infinity, 0]],
    ['-Infinity away', [0, 0, -Infinity]],
    ['NaN draw with finite siblings', [40, NaN, 60]],
  ])(
    'returns NEUTRAL_SPLIT for a non-finite %s input (no NaN leak) (acceptance #8)',
    (_label, [h, d, a]) => {
      const wp = renormalize(h, d, a);
      expect(wp).toEqual(NEUTRAL_SPLIT);
      expectValidDistribution(wp);
    },
  );
});

/**
 * Acceptance #6 (requirement) / plan acceptance #9 — non-zero normalization is
 * unchanged by the guard. Representative non-zero inputs pass straight through
 * the existing residual-absorption math; the guard must not perturb them.
 */
describe('renormalize non-zero behaviour is unchanged (CR-12 regression)', () => {
  it('passes an already-normalized non-zero split through unchanged', () => {
    expect(renormalize(45, 10, 45)).toEqual({ home: 45, draw: 10, away: 45, estimated: true });
  });

  it('preserves the exact integer split for another already-normalized input', () => {
    expect(renormalize(60, 10, 30)).toEqual({ home: 60, draw: 10, away: 30, estimated: true });
  });

  it('renormalizes a non-zero, non-100 split to sum exactly 100, absorbing into the largest', () => {
    const wp = renormalize(70, 10, 30); // sum 110 -> residual -10 absorbed by home
    expect(wp.home + wp.draw + wp.away).toBe(100);
    expect(wp.estimated).toBe(true);
    expect(wp.draw).toBe(10);
    expect(wp.away).toBe(30);
    expect(wp.home).toBe(60);
  });

  it('a barely-positive sum is NOT caught by the guard (boundary is sum <= 0, not sum < epsilon)', () => {
    const wp = renormalize(1, 0, 0);
    expect(wp).not.toEqual(NEUTRAL_SPLIT);
    expect(wp.home + wp.draw + wp.away).toBe(100);
  });
});
