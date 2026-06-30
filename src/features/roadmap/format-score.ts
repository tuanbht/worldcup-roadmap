/**
 * STUB (RED phase, 2026-06-30-1416-radial-winner-nodes-and-match-scores).
 *
 * `formatMatchScore(score)` — the single source of truth for the compact COMBINED
 * score caption the radial inner nodes render. This is a NEW combined caption (the
 * project has no existing combined formatter — the grid renders goals PER SIDE),
 * sharing only the EN-DASH glyph (U+2013) with the grid's empty-goal placeholder
 * [M2]. The GREEN stage implements:
 *   - decided regulation / extra-time (winner non-null/non-draw, both goals) → `"H–A"`,
 *   - penalty shootout (`resolution === 'penalties'` + both penalty tallies) → `"H–A (PH–PA pens)"`,
 *   - undecided (live / scheduled / null|draw winner / missing goal) → `null`.
 * Pure / immutable — never mutates the input `Score`.
 */
import type { Score } from '@/domain/types';

/** EN DASH (U+2013) — the SAME glyph the grid uses, shared at the char level only. */
const DASH = '–';

export function formatMatchScore(score: Score): string | null {
  // Undecided: no winner, a draw, or a side's goal still unplayed → no caption.
  // `=== null` (not falsy) so a settled 0–0 winner keeps its zeros.
  if (score.winner === null || score.winner === 'draw') return null;
  if (score.home === null || score.away === null) return null;

  const base = `${score.home}${DASH}${score.away}`;
  if (
    score.resolution === 'penalties' &&
    score.penaltyHome !== null &&
    score.penaltyAway !== null
  ) {
    return `${base} (${score.penaltyHome}${DASH}${score.penaltyAway} pens)`;
  }
  return base;
}
