import { describe, expect, it } from 'vitest';
import { buildBracket } from '@/domain/bracket/build-bracket';
import { computeBracketLayout } from './bracket-layout';
import { STEP } from './layout-constants';

describe('computeBracketLayout', () => {
  const bracket = buildBracket([]);
  const layout = computeBracketLayout(bracket);
  const at = (stage: string, slot: number) => {
    const round = bracket.rounds.find((r) => r.stage === stage)!;
    return layout.get(round.nodes[slot].matchId)!;
  };

  it('positions every node (all 32)', () => {
    const total = bracket.rounds.reduce((n, r) => n + r.nodes.length, 0);
    expect(layout.size).toBe(total);
  });

  it('places the left Round of 32 at x=0 and centres the Final', () => {
    expect(at('ROUND_OF_32', 0).x).toBe(0);
    expect(at('FINAL', 0).x).toBe(4 * STEP);
  });

  it('mirrors the right half (slot 8 is the far-right column)', () => {
    expect(at('ROUND_OF_32', 8).x).toBe(8 * STEP);
  });

  it('places each parent at the vertical midpoint of its two children', () => {
    const child0 = at('ROUND_OF_32', 0).y;
    const child1 = at('ROUND_OF_32', 1).y;
    expect(at('ROUND_OF_16', 0).y).toBeCloseTo((child0 + child1) / 2);
  });

  it('stacks the third-place play-off below the Final', () => {
    expect(at('THIRD_PLACE', 0).x).toBe(at('FINAL', 0).x);
    expect(at('THIRD_PLACE', 0).y).toBeGreaterThan(at('FINAL', 0).y);
  });
});
