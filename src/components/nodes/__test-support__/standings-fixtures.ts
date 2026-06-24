// Shared, deterministic standings fixtures for the GroupTableNode /
// GroupStandingsNode specs. Both surfaces render the same `Group` shape, so the
// row/team builders live here once instead of being copy-pasted per spec.
//
// Every value is explicit and column-distinct (no two stats share a number on a
// row) so a transposed/mislabeled column is caught, and the rows are returned
// OUT of `position` order so a spec can prove the table sorts by `position`
// rather than trusting input order. Pure data — no DOM, no React.
import type { Group, StandingRow, Team } from '@/domain/types';

export const ARG: Team = { id: 'team-arg', name: 'Argentina', code: 'ARG', flagUrl: null };
export const POL: Team = { id: 'team-pol', name: 'Poland', code: 'POL', flagUrl: null };
export const MEX: Team = { id: 'team-mex', name: 'Mexico', code: 'MEX', flagUrl: null };
export const KSA: Team = { id: 'team-ksa', name: 'Saudi Arabia', code: 'KSA', flagUrl: null };

/**
 * The longest realistic team name (the one called out by GroupTableNode.tsx's
 * truncation comment). Used by the compact-density specs to prove the Team cell
 * ellipsis-truncates a long name rather than pushing the numeric columns past
 * the fixed 296px card edge. `flagUrl: null` keeps the render deterministic.
 */
export const LONG_NAME = 'Bosnia and Herzegovina';
export const BIH: Team = { id: 'team-bih', name: LONG_NAME, code: 'BIH', flagUrl: null };

/** A `StandingRow` with safe zero defaults; `overrides` set the distinguishing stats. */
export function standingRow(team: Team, overrides: Partial<StandingRow> = {}): StandingRow {
  return {
    position: 1,
    team,
    played: 3,
    won: 0,
    draw: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: [],
    qualified: false,
    ...overrides,
  };
}

/**
 * Four teams with column-distinct stats, supplied OUT of position order
 * (3,1,4,2) so the renderer must sort by `position`. Argentina (1) and Poland
 * (2) are `qualified`; Mexico (3) and Saudi Arabia (4) are not.
 */
export const FULL_TABLE: StandingRow[] = [
  standingRow(MEX, {
    position: 3,
    won: 1,
    draw: 1,
    lost: 1,
    goalsFor: 4,
    goalsAgainst: 5,
    goalDifference: -1,
    points: 4,
    qualified: false,
  }),
  standingRow(ARG, {
    position: 1,
    won: 3,
    draw: 0,
    lost: 0,
    goalsFor: 7,
    goalsAgainst: 1,
    goalDifference: 6,
    points: 9,
    qualified: true,
  }),
  standingRow(KSA, {
    position: 4,
    won: 0,
    draw: 1,
    lost: 2,
    goalsFor: 2,
    goalsAgainst: 8,
    goalDifference: -6,
    points: 1,
    qualified: false,
  }),
  standingRow(POL, {
    position: 2,
    won: 2,
    draw: 0,
    lost: 1,
    goalsFor: 5,
    goalsAgainst: 3,
    goalDifference: 2,
    points: 6,
    qualified: true,
  }),
];

/** Group A with the full four-team table (the common render fixture). */
export const GROUP_A: Group = { name: 'A', table: FULL_TABLE };

/** A two-row Group A (Argentina + Poland), for opener/handle specs that don't
 *  need the full column matrix. */
export const GROUP_A_PAIR: Group = {
  name: 'A',
  table: [
    standingRow(ARG, { position: 1, qualified: true }),
    standingRow(POL, { position: 2, qualified: true }),
  ],
};

/**
 * A two-row Group A whose top row is the very long `BIH` team name — the
 * truncation fixture for the compact-density specs (a long name must ellipsis,
 * not push the numeric columns past the card edge).
 */
export const GROUP_A_LONG_NAME: Group = {
  name: 'A',
  table: [
    standingRow(BIH, { position: 1, goalDifference: 6, points: 9, qualified: true }),
    standingRow(POL, { position: 2, goalDifference: 2, points: 6, qualified: true }),
  ],
};

/** An empty Group A (no results yet) — the early-tournament boundary. */
export const GROUP_A_EMPTY: Group = { name: 'A', table: [] };
