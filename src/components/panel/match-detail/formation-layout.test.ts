import { describe, expect, it } from 'vitest';
import type { LineupPlayer } from '@/domain/types';
import { layoutFormation } from './formation-layout';

function player(positionIndex: number): LineupPlayer {
  return {
    id: `p${positionIndex}`,
    shirtNumber: positionIndex + 1,
    name: `Player ${positionIndex}`,
    shortName: `P${positionIndex}`,
    positionIndex,
    isCaptain: false,
    isStarter: true,
    photoUrl: null,
    goals: 0,
    yellow: false,
    red: false,
  };
}

// A 4-1-2-3 starting XI = 1 GK + 4 + 1 + 2 + 3 = 11 outfield-by-line.
const ELEVEN: LineupPlayer[] = Array.from({ length: 11 }, (_, i) => player(i));

describe('layoutFormation', () => {
  it('places every player from the "4-1-2-3" formation', () => {
    const placed = layoutFormation('4-1-2-3', ELEVEN);
    expect(placed).toHaveLength(11);
  });

  it('keeps all coordinates within [0,1]', () => {
    const placed = layoutFormation('4-1-2-3', ELEVEN);
    for (const { x, y } of placed) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it('falls back gracefully (no throw) for a null formation', () => {
    expect(() => layoutFormation(null, ELEVEN)).not.toThrow();
    expect(layoutFormation(null, ELEVEN)).toHaveLength(11);
  });

  it('falls back gracefully (no throw) for a garbage formation string', () => {
    expect(() => layoutFormation('not-a-formation', ELEVEN)).not.toThrow();
  });

  it('returns an empty layout for no players', () => {
    expect(layoutFormation('4-4-2', [])).toEqual([]);
  });
});
