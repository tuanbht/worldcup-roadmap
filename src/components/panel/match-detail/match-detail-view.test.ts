import { describe, expect, it } from 'vitest';
import type { Group, MatchEvent } from '@/domain/types';
import { goalscorerSummary, standingPositionLabel, statusLabel } from './match-detail-view';
import {
  ARGENTINA,
  FRANCE,
  makeGoalEvent,
  makeGroupMatch,
  makeStandingRow,
  makeTeam,
} from './__test-support__/match-detail-fixtures';

function goal(minute: number, side: 'home' | 'away', playerName: string): MatchEvent {
  return makeGoalEvent({ id: `g-${minute}`, minute, side, playerName, playerId: playerName });
}

function yellow(minute: number, playerName: string): MatchEvent {
  return {
    id: `y-${minute}`,
    minute,
    period: 'second-half',
    kind: 'yellow',
    side: 'home',
    playerId: playerName,
    playerName,
  };
}

describe('goalscorerSummary', () => {
  it('lists scorers with their goal minutes in order, ignoring non-goal events', () => {
    const events: MatchEvent[] = [
      goal(23, 'home', 'Mbappe'),
      yellow(31, 'Vinicius'),
      goal(58, 'away', 'Vinicius'),
      goal(77, 'home', 'Mbappe'),
    ];
    const summary = goalscorerSummary(events);
    const mbappe = summary.find((s) => s.playerName === 'Mbappe');
    expect(mbappe?.minutes).toEqual([23, 77]);
    expect(summary.some((s) => s.playerName === 'Vinicius')).toBe(true);
    // The yellow-card minute must not appear as a scorer minute.
    expect(summary.flatMap((s) => s.minutes)).not.toContain(31);
  });

  it('credits own-goal and penalty-goal events to their scorer too (still goal events)', () => {
    const events: MatchEvent[] = [
      { ...goal(12, 'home', 'Defender'), kind: 'own-goal' },
      { ...goal(40, 'away', 'Striker'), kind: 'penalty-goal' },
    ];
    const summary = goalscorerSummary(events);
    expect(summary.flatMap((s) => s.minutes).sort((a, b) => a - b)).toEqual([12, 40]);
  });

  it('returns an empty array when there are no goals', () => {
    expect(goalscorerSummary([yellow(10, 'Foo')])).toEqual([]);
  });

  it('returns an empty array for an empty event list', () => {
    expect(goalscorerSummary([])).toEqual([]);
  });
});

const GROUPS: Group[] = [
  {
    name: 'A',
    table: [
      makeStandingRow(1, ARGENTINA),
      makeStandingRow(2, makeTeam('b')),
      makeStandingRow(3, makeTeam('c')),
      makeStandingRow(4, FRANCE),
    ],
  },
];

describe('standingPositionLabel', () => {
  it('returns the ordinal for the group leader (1st)', () => {
    expect(standingPositionLabel(GROUPS, 'A', ARGENTINA.id)).toBe('1st');
  });

  it('returns the ordinal for a mid-table position (2nd, 3rd)', () => {
    expect(standingPositionLabel(GROUPS, 'A', 'b')).toBe('2nd');
    expect(standingPositionLabel(GROUPS, 'A', 'c')).toBe('3rd');
  });

  it('returns the ordinal for the bottom position (4th)', () => {
    expect(standingPositionLabel(GROUPS, 'A', FRANCE.id)).toBe('4th');
  });

  it('returns null when the group letter is null (knockout match)', () => {
    expect(standingPositionLabel(GROUPS, null, ARGENTINA.id)).toBeNull();
  });

  it('returns null when the teamId is null (placeholder ref)', () => {
    expect(standingPositionLabel(GROUPS, 'A', null)).toBeNull();
  });

  it('returns null when the group is missing', () => {
    expect(standingPositionLabel(GROUPS, 'Z', ARGENTINA.id)).toBeNull();
  });

  it('returns null when the team is not in the group table', () => {
    expect(standingPositionLabel(GROUPS, 'A', 'unknown-team')).toBeNull();
  });
});

describe('statusLabel', () => {
  it('labels a scheduled match as upcoming', () => {
    expect(statusLabel(makeGroupMatch({ status: 'scheduled', minute: null }))).toMatch(/upcoming/i);
  });

  it('labels a finished match as full-time', () => {
    expect(statusLabel(makeGroupMatch({ status: 'finished', minute: null }))).toMatch(
      /full[- ]?time/i,
    );
  });

  it('shows the elapsed minute with a trailing apostrophe for a live match', () => {
    expect(statusLabel(makeGroupMatch({ status: 'live', minute: 58 }))).toContain("58'");
  });
});
