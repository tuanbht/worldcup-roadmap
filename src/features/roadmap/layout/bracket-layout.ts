import type { Bracket } from '@/domain/types';
import { NODE_H, ROW_PITCH, STEP, type XY } from './layout-constants';

const DEPTH: Record<string, number> = {
  ROUND_OF_32: 0,
  ROUND_OF_16: 1,
  QUARTER_FINALS: 2,
  SEMI_FINALS: 3,
  FINAL: 4,
};
const CENTER_DEPTH = 4;

/**
 * Mirrored-bracket coordinates keyed by matchId.
 *
 * Both halves converge on the centred Final. X is the round depth (left half
 * advances rightward, right half mirrors). Y of every non-leaf match is the
 * midpoint of its two children, computed bottom-up from evenly-pitched Round of
 * 32 leaves — the classic bracket fan-in. Pure; O(n).
 */
export function computeBracketLayout(bracket: Bracket): Map<string, XY> {
  const pos = new Map<string, XY>();
  const yBySideDepth = new Map<string, number[]>();

  const ensureY = (side: 'L' | 'R', depth: number, count: number): number[] => {
    const key = `${side}-${depth}`;
    const existing = yBySideDepth.get(key);
    if (existing) return existing;
    const arr =
      depth === 0
        ? Array.from({ length: count }, (_, p) => p * ROW_PITCH)
        : (() => {
            const child = yBySideDepth.get(`${side}-${depth - 1}`)!;
            return Array.from({ length: count }, (_, p) => (child[2 * p] + child[2 * p + 1]) / 2);
          })();
    yBySideDepth.set(key, arr);
    return arr;
  };

  for (const round of bracket.rounds) {
    const depth = DEPTH[round.stage];
    if (depth === undefined || round.stage === 'FINAL') continue;

    const half = round.nodes.length / 2;
    const leftY = ensureY('L', depth, half);
    const rightY = ensureY('R', depth, half);

    round.nodes.forEach((node, i) => {
      const onLeft = i < half;
      const p = onLeft ? i : i - half;
      const x = onLeft ? depth * STEP : (2 * CENTER_DEPTH - depth) * STEP;
      const y = (onLeft ? leftY : rightY)[p];
      pos.set(node.matchId, { x, y });
    });
  }

  const centerX = CENTER_DEPTH * STEP;
  const finalY = ((yBySideDepth.get('L-3')?.[0] ?? 0) + (yBySideDepth.get('R-3')?.[0] ?? 0)) / 2;

  const finalNode = bracket.rounds.find((r) => r.stage === 'FINAL')?.nodes[0];
  if (finalNode) pos.set(finalNode.matchId, { x: centerX, y: finalY });

  const thirdNode = bracket.rounds.find((r) => r.stage === 'THIRD_PLACE')?.nodes[0];
  if (thirdNode) pos.set(thirdNode.matchId, { x: centerX, y: finalY + NODE_H + ROW_PITCH });

  return pos;
}
