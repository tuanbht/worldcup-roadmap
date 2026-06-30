import type { KnockoutStage, Stage } from '../types';

/** Main knockout rounds, ordered. THIRD_PLACE is a sibling of FINAL, handled apart. */
export const KNOCKOUT_STAGES: readonly KnockoutStage[] = [
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'FINAL',
];

/** Number of matches in each knockout round of the 32-team bracket. */
export const STAGE_MATCH_COUNT: Record<KnockoutStage, number> = {
  ROUND_OF_32: 16,
  ROUND_OF_16: 8,
  QUARTER_FINALS: 4,
  SEMI_FINALS: 2,
  FINAL: 1,
  THIRD_PLACE: 1,
};

/**
 * First official FIFA `MatchNumber` of each knockout stage (WC2026 schedule).
 *
 * A real fixture's bracket slot = `matchNumber − STAGE_FIRST_MATCH[stage]`. The
 * contiguous chain matches the official 2026 calendar: R32 = matches 73–88 →
 * slots 0–15 (cross-ref `seeding.ts`, "Matches 73–88 map to R32 slots 0–15"),
 * R16 = 89–96, QF = 97–100, SF = 101–102, third-place play-off = 103, Final = 104
 * (the third-place play-off precedes the final).
 */
export const STAGE_FIRST_MATCH: Record<KnockoutStage, number> = {
  ROUND_OF_32: 73,
  ROUND_OF_16: 89,
  QUARTER_FINALS: 97,
  SEMI_FINALS: 101,
  THIRD_PLACE: 103,
  FINAL: 104,
};

export const STAGE_LABELS: Record<Stage, string> = {
  GROUP_STAGE: 'Group Stage',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-finals',
  SEMI_FINALS: 'Semi-finals',
  THIRD_PLACE: 'Third-place Play-off',
  FINAL: 'Final',
};

/** Short tag used in synthetic ids / placeholder labels, e.g. "R32". */
export const STAGE_TAG: Record<KnockoutStage, string> = {
  ROUND_OF_32: 'R32',
  ROUND_OF_16: 'R16',
  QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF',
  FINAL: 'F',
  THIRD_PLACE: '3P',
};

export function isKnockout(stage: Stage): stage is KnockoutStage {
  return stage !== 'GROUP_STAGE';
}
