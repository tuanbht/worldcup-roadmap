/**
 * Shared, deterministic builders for the match-detail UI specs
 * (`MatchDetailTabs`, `MatchDetailPanel`, `match-detail-view`).
 *
 * One source of truth for the mock `MatchDetail` / `Match` / lineup shapes so the
 * tabs, panel, and view-helper tests stay in lock-step. Every builder returns a
 * FRESH object per call (spread of literals) — no shared mutable state, isolation
 * by construction. Kept out of `coverage.include` (test support, not production).
 */
import type {
  Group,
  Lineup,
  LineupPlayer,
  Match,
  MatchDetail,
  MatchEvent,
  StandingRow,
  Team,
  TeamStats,
  WinProbability,
} from '@/domain/types';
import { EMPTY_SCORE, teamRef } from '@/domain/types';

/** Deterministic kickoff instant used across the panel/header specs. */
export const KICKOFF_UTC = '2026-06-02T14:30:00.000Z';

export const ARGENTINA: Team = { id: 'team-arg', name: 'Argentina', code: 'ARG', flagUrl: null };
export const FRANCE: Team = { id: 'team-fra', name: 'France', code: 'FRA', flagUrl: null };
export const BRAZIL: Team = { id: 'team-bra', name: 'Brazil', code: 'BRA', flagUrl: null };

export function makeTeam(id: string): Team {
  return { id, name: id, code: id, flagUrl: null };
}

export function makeStartingPlayer(over: Partial<LineupPlayer> = {}): LineupPlayer {
  return {
    id: 'p',
    shirtNumber: 10,
    name: 'Kylian Mbappe',
    shortName: 'Mbappe',
    positionIndex: 10,
    isCaptain: false,
    isStarter: true,
    photoUrl: null,
    goals: 0,
    yellow: false,
    red: false,
    ...over,
  };
}

export function makeLineup(over: Partial<Lineup> = {}): Lineup {
  return {
    side: 'home',
    formation: '4-3-3',
    coach: 'Didier Deschamps',
    starters: [],
    bench: [],
    ...over,
  };
}

export function makeGoalEvent(over: Partial<MatchEvent> = {}): MatchEvent {
  return {
    id: 'g',
    minute: 23,
    period: 'second-half',
    kind: 'goal',
    side: 'home',
    playerId: 'h-cap',
    playerName: 'Kylian Mbappe',
    ...over,
  };
}

export function makeStandingRow(position: number, team: Team): StandingRow {
  return {
    position,
    team,
    played: 3,
    won: position === 1 ? 3 : 0,
    draw: 0,
    lost: position === 1 ? 0 : 3,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: position === 1 ? 9 : 0,
    form: [],
    qualified: position <= 2,
  };
}

/** Group A with Argentina 1st and France 4th — the header standing-position case. */
export function makeGroupA(): Group {
  return {
    name: 'A',
    table: [makeStandingRow(1, ARGENTINA), makeStandingRow(4, FRANCE)],
  };
}

export function makeTeamStats(over: Partial<TeamStats> = {}): TeamStats {
  return {
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
    ...over,
  };
}

export const ESTIMATED_WIN_PROB: WinProbability = {
  home: 60,
  draw: 25,
  away: 15,
  estimated: true,
};

/** A scheduled group-stage `Match` carrying a FIFA `providerRef` (detail-capable). */
export function makeGroupMatch(over: Partial<Match> = {}): Match {
  return {
    id: 'wc2026-fifa-grp',
    providerMatchId: 'grp',
    providerRef: { idCompetition: '17', idSeason: '285023', idStage: 'st-grp', idMatch: 'grp' },
    stage: 'GROUP_STAGE',
    group: 'A',
    matchday: 1,
    home: teamRef(ARGENTINA),
    away: teamRef(FRANCE),
    score: EMPTY_SCORE,
    kickoff: KICKOFF_UTC,
    status: 'scheduled',
    minute: null,
    venue: { name: 'MetLife Stadium', city: 'East Rutherford' },
    ...over,
  };
}

/** A mock match with no provider ref → detail is universally unavailable. */
export function makeMockMatch(over: Partial<Match> = {}): Match {
  return makeGroupMatch({
    id: 'wc2026-mock-1',
    providerMatchId: 'mock-1',
    providerRef: null,
    ...over,
  });
}

/**
 * A fully-populated mock `MatchDetail` for the tabs spec: a captain headshot, a
 * goal/yellow/substitution timeline, lopsided stats (home leads), and a labeled
 * win-probability estimate. Override any slice via `over`.
 */
export function makeMatchDetail(over: Partial<MatchDetail> = {}): MatchDetail {
  const homeLineup = makeLineup({
    side: 'home',
    formation: '4-3-3',
    coach: 'Didier Deschamps',
    starters: [
      makeStartingPlayer({
        id: 'h-cap',
        shirtNumber: 10,
        shortName: 'Mbappe',
        isCaptain: true,
        photoUrl: 'https://digitalhub.fifa.com/transform/h-cap/mbappe.png',
      }),
      makeStartingPlayer({
        id: 'h-gk',
        shirtNumber: 1,
        shortName: 'Maignan',
        positionIndex: 0,
        photoUrl: null,
      }),
    ],
  });

  const awayLineup = makeLineup({
    side: 'away',
    formation: '4-2-3-1',
    coach: 'Dorival Junior',
    starters: [
      makeStartingPlayer({ id: 'a-cap', shirtNumber: 10, shortName: 'Vinicius', isCaptain: true }),
    ],
  });

  return {
    matchId: '400251',
    events: [
      makeGoalEvent({ id: 'g1', minute: 23, side: 'home', playerName: 'Kylian Mbappe' }),
      {
        id: 'y1',
        minute: 31,
        period: 'second-half',
        kind: 'yellow',
        side: 'away',
        playerId: 'a-cap',
        playerName: 'Vinicius Junior',
      },
      {
        id: 's1',
        minute: 70,
        period: 'second-half',
        kind: 'substitution',
        side: 'home',
        playerId: 'h-sub',
        playerName: 'Camavinga',
      },
    ],
    home: homeLineup,
    away: awayLineup,
    homeStats: makeTeamStats({
      possession: 58,
      shots: 12,
      fouls: 9,
      yellowCards: 1,
      redCards: 0,
      offsides: 2,
      corners: 6,
    }),
    awayStats: makeTeamStats({
      possession: 42,
      shots: 4,
      fouls: 14,
      yellowCards: 2,
      redCards: 0,
      offsides: 1,
      corners: 2,
    }),
    winProbability: ESTIMATED_WIN_PROB,
    ...over,
  };
}
