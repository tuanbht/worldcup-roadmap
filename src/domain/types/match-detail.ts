/**
 * Per-match detail domain types (Timeline / Lineups / Stats).
 *
 * Framework-agnostic — imported by BOTH the Hono detail route and the frontend
 * query hook via the `@` alias (never from `server/`). Nullable everywhere so a
 * partial/empty FIFA payload degrades gracefully instead of throwing.
 *
 * NOTE (TDD RED phase): this is the minimal, source-of-truth TYPE surface only,
 * exactly per the requirement. The `EMPTY_MATCH_DETAIL` factory is a real (pure)
 * constant because the requirement pins its shape; all behavioural logic
 * (mappers, stats, win-probability, components) lives elsewhere and is still
 * unimplemented, so the suite is RED until those land.
 */

export type MatchEventKind =
  | 'goal'
  | 'own-goal'
  | 'penalty-goal'
  | 'assist'
  | 'yellow'
  | 'red'
  | 'second-yellow'
  | 'substitution'
  | 'var'
  | 'period';

export interface MatchEvent {
  readonly id: string;
  readonly minute: number;
  readonly period: string;
  readonly kind: MatchEventKind;
  readonly side: 'home' | 'away';
  readonly playerId: string | null;
  readonly playerName: string | null;
  /** assist scorer / player coming on. */
  readonly relatedName?: string | null;
}

export interface LineupPlayer {
  readonly id: string;
  readonly shirtNumber: number;
  readonly name: string;
  readonly shortName: string;
  readonly positionIndex: number;
  readonly isCaptain: boolean;
  readonly isStarter: boolean;
  readonly photoUrl: string | null;
  readonly goals: number;
  readonly yellow: boolean;
  readonly red: boolean;
  readonly subbedOff?: number;
  readonly subbedOn?: number;
}

export interface Lineup {
  readonly side: 'home' | 'away';
  readonly formation: string | null;
  readonly coach: string | null;
  readonly starters: readonly LineupPlayer[];
  readonly bench: readonly LineupPlayer[];
}

export interface TeamStats {
  readonly possession: number | null;
  readonly shots: number | null;
  /** Omitted (null) — no FIFA source. */
  readonly shotsOnTarget: number | null;
  /** Omitted (null) — no FIFA source. */
  readonly passes: number | null;
  /** Omitted (null) — no FIFA source. */
  readonly passAccuracy: number | null;
  readonly fouls: number | null;
  readonly yellowCards: number | null;
  readonly redCards: number | null;
  readonly offsides: number | null;
  readonly corners: number | null;
}

export interface WinProbability {
  /** 0..100 */
  readonly home: number;
  /** 0..100 */
  readonly draw: number;
  /** 0..100; home + draw + away === 100 in all directions. */
  readonly away: number;
  /** Always labeled — never presented as a FIFA figure. */
  readonly estimated: true;
}

export interface MatchDetail {
  readonly matchId: string;
  readonly events: readonly MatchEvent[];
  readonly home: Lineup;
  readonly away: Lineup;
  readonly homeStats: TeamStats;
  readonly awayStats: TeamStats;
  readonly winProbability: WinProbability | null;
}

const EMPTY_TEAM_STATS: TeamStats = {
  possession: null,
  shots: null,
  shotsOnTarget: null,
  passes: null,
  passAccuracy: null,
  fouls: null,
  yellowCards: null,
  redCards: null,
  offsides: null,
  corners: null,
};

/** Non-null but empty/zeroed valid `MatchDetail` for missing/partial data. */
export function EMPTY_MATCH_DETAIL(matchId: string): MatchDetail {
  return {
    matchId,
    events: [],
    home: { side: 'home', formation: null, coach: null, starters: [], bench: [] },
    away: { side: 'away', formation: null, coach: null, starters: [], bench: [] },
    homeStats: EMPTY_TEAM_STATS,
    awayStats: EMPTY_TEAM_STATS,
    winProbability: null,
  };
}
