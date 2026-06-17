import type { Stage } from './match';
import type { TeamRef } from './team';

/** Every stage except the group stage forms the knockout tree. */
export type KnockoutStage = Exclude<Stage, 'GROUP_STAGE'>;

/**
 * Where a bracket slot's team comes from. This is the parent/child link of the
 * tree: a slot is filled either by a group qualifier or by the winner/loser of
 * an earlier match.
 */
export type SlotSource =
  | { readonly kind: 'group'; readonly position: string } // "1A", "2B", "3rd"
  | { readonly kind: 'winnerOf'; readonly matchId: string }
  | { readonly kind: 'loserOf'; readonly matchId: string }; // semifinal losers -> 3rd place

export interface BracketSlot {
  readonly side: 'home' | 'away';
  readonly source: SlotSource;
  /** Resolved team, or a placeholder derived from the source. */
  readonly team: TeamRef;
}

export interface BracketNode {
  /** Maps to a Match.id. */
  readonly matchId: string;
  readonly stage: KnockoutStage;
  /** 0-based position within the round (top to bottom). */
  readonly slotIndex: number;
  readonly home: BracketSlot;
  readonly away: BracketSlot;
}

export interface BracketRound {
  readonly stage: KnockoutStage;
  readonly label: string;
  readonly nodes: readonly BracketNode[];
}

/** Ordered ROUND_OF_32 -> FINAL, with THIRD_PLACE appended last. */
export interface Bracket {
  readonly rounds: readonly BracketRound[];
}
