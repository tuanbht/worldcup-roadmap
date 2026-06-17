import { describe, expect, it } from 'vitest';
import { buildBracket } from './build-bracket';

describe('buildBracket', () => {
  it('produces the full topology even with zero knockout matches', () => {
    const bracket = buildBracket([]);
    const stages = bracket.rounds.map((r) => r.stage);
    expect(stages).toEqual([
      'ROUND_OF_32',
      'ROUND_OF_16',
      'QUARTER_FINALS',
      'SEMI_FINALS',
      'FINAL',
      'THIRD_PLACE',
    ]);

    const counts = Object.fromEntries(bracket.rounds.map((r) => [r.stage, r.nodes.length]));
    expect(counts).toEqual({
      ROUND_OF_32: 16,
      ROUND_OF_16: 8,
      QUARTER_FINALS: 4,
      SEMI_FINALS: 2,
      FINAL: 1,
      THIRD_PLACE: 1,
    });
  });

  it('links each parent slot to its two children by slot arithmetic', () => {
    const bracket = buildBracket([]);
    const r32 = bracket.rounds.find((r) => r.stage === 'ROUND_OF_32')!;
    const r16 = bracket.rounds.find((r) => r.stage === 'ROUND_OF_16')!;

    expect(r16.nodes[0].home.source).toEqual({ kind: 'winnerOf', matchId: r32.nodes[0].matchId });
    expect(r16.nodes[0].away.source).toEqual({ kind: 'winnerOf', matchId: r32.nodes[1].matchId });
    expect(r16.nodes[3].home.source).toEqual({ kind: 'winnerOf', matchId: r32.nodes[6].matchId });
  });

  it('seeds Round of 32 sources from the group template', () => {
    const r32 = buildBracket([]).rounds.find((r) => r.stage === 'ROUND_OF_32')!;
    expect(r32.nodes[0].home.source).toEqual({ kind: 'group', position: '1A' });
    expect(r32.nodes[0].away.source).toEqual({ kind: 'group', position: '2B' });
  });

  it('feeds the third-place play-off from the two semifinal losers', () => {
    const bracket = buildBracket([]);
    const sf = bracket.rounds.find((r) => r.stage === 'SEMI_FINALS')!;
    const third = bracket.rounds.find((r) => r.stage === 'THIRD_PLACE')!.nodes[0];
    expect(third.home.source).toEqual({ kind: 'loserOf', matchId: sf.nodes[0].matchId });
    expect(third.away.source).toEqual({ kind: 'loserOf', matchId: sf.nodes[1].matchId });
  });
});
