import { describe, expect, it } from 'vitest';
import { computeGroups } from './standings';
import type { Match, Score, Team } from '../types';
import { teamRef } from '../types';

function team(id: string): Team {
  return { id, name: id, code: id, flagUrl: null };
}

function score(home: number, away: number): Score {
  return {
    home,
    away,
    penaltyHome: null,
    penaltyAway: null,
    resolution: 'regular',
    winner: home > away ? 'home' : home < away ? 'away' : 'draw',
  };
}

function gm(id: string, home: Team, away: Team, s: Score, kickoff: string): Match {
  return {
    id,
    providerMatchId: id,
    stage: 'GROUP_STAGE',
    group: 'A',
    matchday: 1,
    home: teamRef(home),
    away: teamRef(away),
    score: s,
    kickoff,
    status: 'finished',
    minute: null,
    venue: { name: null, city: null },
  };
}

describe('computeGroups', () => {
  const a = team('A');
  const b = team('B');
  const c = team('C');
  const d = team('D');

  it('ranks by points, then goal difference', () => {
    const matches: Match[] = [
      gm('m1', a, b, score(3, 0), '2026-06-11T12:00:00Z'),
      gm('m2', c, d, score(1, 1), '2026-06-11T15:00:00Z'),
      gm('m3', a, c, score(2, 0), '2026-06-15T12:00:00Z'),
      gm('m4', b, d, score(1, 0), '2026-06-15T15:00:00Z'),
    ];
    const [group] = computeGroups(matches);
    expect(group.name).toBe('A');
    expect(group.table.map((r) => r.team.id)).toEqual(['A', 'B', 'D', 'C']);
    expect(group.table[0].points).toBe(6);
    expect(group.table[0].qualified).toBe(true);
    expect(group.table[3].qualified).toBe(false);
  });

  it('only counts finished matches but still lists every team', () => {
    const scheduled: Match = {
      ...gm('m5', a, d, score(0, 0), '2026-06-20T12:00:00Z'),
      status: 'scheduled',
    };
    const [group] = computeGroups([scheduled]);
    expect(group.table).toHaveLength(2);
    expect(group.table.every((r) => r.played === 0)).toBe(true);
  });
});
