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

const ORDER: readonly Stage[] = [
  'GROUP_STAGE',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
];

export function stageOrderIndex(stage: Stage): number {
  return ORDER.indexOf(stage);
}

export function isKnockout(stage: Stage): stage is KnockoutStage {
  return stage !== 'GROUP_STAGE';
}
