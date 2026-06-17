import { describe, expect, it } from 'vitest';
import { buildMockTournament } from './build-mock-tournament';
import { parseTournament } from '@/data/schema/tournament-schema';

describe('buildMockTournament', () => {
  const tournament = buildMockTournament('2026-06-17T00:00:00Z');

  it('fields a 48-team, 12-group, 104-match tournament', () => {
    expect(tournament.teams).toHaveLength(48);
    expect(tournament.groups).toHaveLength(12);
    expect(tournament.matches).toHaveLength(104);
  });

  it('plays a full group stage (every team played 3)', () => {
    for (const group of tournament.groups) {
      expect(group.table).toHaveLength(4);
      for (const row of group.table) expect(row.played).toBe(3);
    }
  });

  it('builds a 32-node bracket with the third-place play-off last', () => {
    expect(tournament.bracket.rounds.map((r) => r.stage)).toEqual([
      'ROUND_OF_32',
      'ROUND_OF_16',
      'QUARTER_FINALS',
      'SEMI_FINALS',
      'FINAL',
      'THIRD_PLACE',
    ]);
    const nodes = tournament.bracket.rounds.reduce((n, r) => n + r.nodes.length, 0);
    expect(nodes).toBe(32);
  });

  it('represents all three match states, with a live and fully-resolved final', () => {
    const statuses = new Set(tournament.matches.map((m) => m.status));
    expect(statuses).toEqual(new Set(['finished', 'scheduled', 'live']));

    const final = tournament.matches.find((m) => m.stage === 'FINAL')!;
    expect(final.status).toBe('live');
    expect(final.minute).toBe(67);
    expect(final.home.kind).toBe('team');
    expect(final.away.kind).toBe('team');
  });

  it('passes domain schema validation', () => {
    expect(() => parseTournament(tournament)).not.toThrow();
  });

  it('is deterministic across builds', () => {
    const again = buildMockTournament('ignored');
    expect(again.matches.map((m) => `${m.id}:${m.score.home}-${m.score.away}`)).toEqual(
      tournament.matches.map((m) => `${m.id}:${m.score.home}-${m.score.away}`),
    );
  });
});
