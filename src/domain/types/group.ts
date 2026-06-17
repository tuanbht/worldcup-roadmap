import type { Team } from './team';

export type FormResult = 'W' | 'D' | 'L';

export interface StandingRow {
  /** 1-based position within the group (1 = top). */
  readonly position: number;
  readonly team: Team;
  readonly played: number;
  readonly won: number;
  readonly draw: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly goalDifference: number;
  readonly points: number;
  /** Most-recent-last sequence of results. */
  readonly form: readonly FormResult[];
  /** True for the top two (always qualify) — used for accenting in the UI. */
  readonly qualified: boolean;
}

export interface Group {
  /** Group letter, "A".."L". */
  readonly name: string;
  readonly table: readonly StandingRow[];
}
