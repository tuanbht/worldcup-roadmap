import type { TeamRef } from './team';

/** Tournament stage. Ordered group stage first, then the knockout rounds. */
export type Stage =
  | 'GROUP_STAGE'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL';

/** Coarse lifecycle status, normalized from each provider's richer code set. */
export type MatchStatus = 'scheduled' | 'live' | 'finished';

/** How a finished match was decided. */
export type MatchResolution = 'regular' | 'extra_time' | 'penalties';

export type Outcome = 'home' | 'away' | 'draw';

export interface Venue {
  readonly name: string | null;
  readonly city: string | null;
}

export interface Score {
  /** Goals after the result is settled (incl. extra time). Null until played. */
  readonly home: number | null;
  readonly away: number | null;
  /** Penalty shoot-out tally, when applicable. */
  readonly penaltyHome: number | null;
  readonly penaltyAway: number | null;
  readonly resolution: MatchResolution | null;
  readonly winner: Outcome | null;
}

export const EMPTY_SCORE: Score = {
  home: null,
  away: null,
  penaltyHome: null,
  penaltyAway: null,
  resolution: null,
  winner: null,
};

export interface Match {
  /** Stable, provider-independent domain id, e.g. "wc2026-m37". */
  readonly id: string;
  /** Raw upstream id, kept for traceability/debugging. */
  readonly providerMatchId: string;
  readonly stage: Stage;
  /** Group letter "A".."L" for group-stage matches; null in the knockout. */
  readonly group: string | null;
  /** Matchday 1..3 in the group stage; null otherwise. */
  readonly matchday: number | null;
  readonly home: TeamRef;
  readonly away: TeamRef;
  readonly score: Score;
  /** Kick-off, ISO 8601 UTC. */
  readonly kickoff: string;
  readonly status: MatchStatus;
  /** Live elapsed minute, when known. */
  readonly minute: number | null;
  readonly venue: Venue;
}
