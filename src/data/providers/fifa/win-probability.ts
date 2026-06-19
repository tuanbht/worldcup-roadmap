import type { WinProbability } from '@/domain/types';

/** Inputs for the lightweight, clearly-labeled win-probability ESTIMATE. */
export interface WinProbabilityInput {
  readonly status: 'scheduled' | 'live' | 'finished';
  readonly homeGoals: number | null;
  readonly awayGoals: number | null;
  readonly minute: number | null;
  readonly homeShots?: number | null;
  readonly awayShots?: number | null;
  readonly homePossession?: number | null;
  readonly awayPossession?: number | null;
}

const FULL_TIME = 90;

/**
 * CR-12 — neutral "no signal" split on the module's 0..100 integer scale
 * (`home + draw + away === 100`). Returned by `renormalize` when the inputs are
 * all-zero / non-positive-sum / non-finite, so an undefined division can never
 * surface a non-neutral or `NaN` distribution. `34` on draw keeps the exact
 * `sum === 100` invariant and matches the module's draw-favoured-at-even bias.
 */
export const NEUTRAL_SPLIT: WinProbability = { home: 33, draw: 34, away: 33, estimated: true };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Fraction of the match elapsed, in [0,1]. Drives how decisive the lead is. */
function progress(minute: number | null): number {
  if (minute == null) return 0;
  return clamp(minute / FULL_TIME, 0, 1);
}

/**
 * Renormalize three integers so they sum to exactly 100. Each component is first
 * clamped to [0,100]; the residual `(100 - sum)` is absorbed into the LARGEST
 * component (re-clamped), so the invariant holds whether the overflow came from
 * a negative away share, a >100 home share, or a >100 draw share (L-C).
 */
// Exported (CR-12) for direct unit testing of the all-zero / non-finite guard.
export function renormalize(home: number, draw: number, away: number): WinProbability {
  // CR-12: guard before any clamp/round/division. An all-zero, non-positive-sum,
  // or non-finite input has no signal — return the neutral split instead of an
  // undefined / meaningless distribution.
  if (!Number.isFinite(home) || !Number.isFinite(draw) || !Number.isFinite(away)) {
    return NEUTRAL_SPLIT;
  }
  if (home + draw + away <= 0) {
    return NEUTRAL_SPLIT;
  }

  let h = clamp(Math.round(home), 0, 100);
  let d = clamp(Math.round(draw), 0, 100);
  let a = clamp(Math.round(away), 0, 100);

  const residual = 100 - (h + d + a);
  const largest = Math.max(h, d, a);
  if (largest === h) h = clamp(h + residual, 0, 100);
  else if (largest === d) d = clamp(d + residual, 0, 100);
  else a = clamp(a + residual, 0, 100);

  // A second pass guarantees an exact sum even if the absorbing component
  // re-clamped (extreme inputs); push any remainder onto the next-largest.
  const remainder = 100 - (h + d + a);
  if (remainder !== 0) {
    if (h >= d && h >= a) h = clamp(h + remainder, 0, 100);
    else if (d >= a) d = clamp(d + remainder, 0, 100);
    else a = clamp(a + remainder, 0, 100);
  }

  return { home: h, draw: d, away: a, estimated: true };
}

/**
 * Compute a labeled win-probability estimate (NOT a FIFA figure). `null`
 * pre-match (scheduled) or when the scoreline is unknown.
 */
export function estimateWinProbability(input: WinProbabilityInput): WinProbability | null {
  const { status, homeGoals, awayGoals, minute } = input;
  if (status === 'scheduled') return null;
  if (homeGoals == null || awayGoals == null) return null;

  const t = progress(minute);
  const lead = homeGoals - awayGoals; // + favours home, - favours away

  // Base shares start even; a goal lead shifts probability toward the leader,
  // and the shift grows as the match progresses (a late lead is more decisive).
  const decisiveness = 0.5 + 0.45 * t; // 0.5 early → ~0.95 at full time
  const leadWeight = clamp(lead * 18 * decisiveness, -100, 100);

  // Secondary signal: shot + possession edge nudges the favourite further.
  const shotEdge = (input.homeShots ?? 0) - (input.awayShots ?? 0);
  const possEdge = (input.homePossession ?? 50) - (input.awayPossession ?? 50);
  const territory = clamp(shotEdge * 1.5 + possEdge * 0.2, -25, 25) * (0.4 + 0.6 * t);

  // Draw share starts as the clear favourite at an even, early scoreline, then
  // shrinks as the match progresses and as the lead widens.
  const drawBase = 44 - 30 * t - Math.abs(lead) * 12;
  const draw = clamp(drawBase, 4, 92);

  const spread = leadWeight + territory;
  const remaining = 100 - draw;
  const home = clamp(remaining / 2 + spread / 2, 0, 100);
  const away = clamp(remaining - home, 0, 100);

  return renormalize(home, draw, away);
}
