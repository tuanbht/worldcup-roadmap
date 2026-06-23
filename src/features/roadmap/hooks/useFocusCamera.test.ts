import { describe, expect, it } from 'vitest';
import { EMPTY_SCORE, teamRef } from '@/domain/types';
import type { Group, Stage } from '@/domain/types';
import { NODE_W, NODE_H, STANDINGS_W, GROUP_TABLE_H } from '../layout/layout-constants';
import type {
  DayMarkerFlowNode,
  GroupStandingsFlowNode,
  MatchFlowNode,
  RoadmapNode,
} from '../graph-model';
import { boundsOf, footprintOf, isGroupZoneNode, isKnockoutNode } from './useFocusCamera';

/**
 * CR-10b — direct unit tests for the pure geometry/classification helpers in
 * `useFocusCamera.ts` (`boundsOf`, `isGroupZoneNode`, `isKnockoutNode`, plus
 * `footprintOf`, which `boundsOf` applies). These are pure functions of
 * `RoadmapNode[]`, so the test exercises the documented branches WITHOUT the
 * React renderer / `useReactFlow` machinery. Node env (no DOM).
 *
 * The expected envelope is derived from `NODE_W`/`NODE_H` (and the known guide
 * footprints 96x32 / STANDINGS_W x GROUP_TABLE_H), never restated as magic
 * numbers, so it tracks the constants if the design tokens change.
 *
 * H3: the guide-node fixtures + assertions are RETARGETED off the removed
 * `group-header` pill onto the always-on `group-standings` table — its footprint
 * is the table box (STANDINGS_W x GROUP_TABLE_H) and it is a group-zone node, so
 * "groups"/"all" framing still includes the top band. The mutual-exclusivity and
 * zone-classification coverage is preserved, not dropped.
 */

const HOME = teamRef({ id: 't-h', name: 'Home', code: 'HOM', flagUrl: null });
const AWAY = teamRef({ id: 't-a', name: 'Away', code: 'AWY', flagUrl: null });

/** The six non-group stages — the full knockout half of the `Stage` union. */
const KNOCKOUT_STAGES = [
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
] as const satisfies readonly Stage[];

/** Every member of the `Stage` union — group stage plus the knockout half. */
const ALL_STAGES = ['GROUP_STAGE', ...KNOCKOUT_STAGES] as const satisfies readonly Stage[];

/** A minimal `match` node, positioned and stage-tagged (only the read fields). */
function matchNode(p: { id: string; x: number; y: number; stage: Stage }): MatchFlowNode {
  return {
    id: p.id,
    type: 'match',
    position: { x: p.x, y: p.y },
    data: {
      matchId: p.id,
      stage: p.stage,
      roundLabel: 'R',
      group: p.stage === 'GROUP_STAGE' ? 'A' : null,
      matchday: null,
      home: HOME,
      away: AWAY,
      score: EMPTY_SCORE,
      status: 'scheduled',
      kickoff: null,
      minute: null,
      venue: { name: null, city: null },
      isFinal: p.stage === 'FINAL',
      isThirdPlace: p.stage === 'THIRD_PLACE',
    },
  };
}

function dayMarkerNode(p: { id: string; x: number; y: number }): DayMarkerFlowNode {
  return {
    id: p.id,
    type: 'day-marker',
    position: { x: p.x, y: p.y },
    data: { dayKey: p.id, dayLabel: p.id, dayIndex: 0 },
  };
}

function groupStandingsNode(p: { id: string; x: number; y: number }): GroupStandingsFlowNode {
  const group: Group = { name: 'A', table: [] };
  return {
    id: p.id,
    type: 'group-standings',
    position: { x: p.x, y: p.y },
    data: { group },
  };
}

describe('footprintOf', () => {
  it('returns the card size for a match node', () => {
    const node = matchNode({ id: 'm', x: 0, y: 0, stage: 'GROUP_STAGE' });
    expect(footprintOf(node)).toEqual({ w: NODE_W, h: NODE_H });
  });

  it('returns the small marker footprint (96x32) for a day-marker', () => {
    expect(footprintOf(dayMarkerNode({ id: 'd', x: 0, y: 0 }))).toEqual({ w: 96, h: 32 });
  });

  it('returns the standings-table box (STANDINGS_W x GROUP_TABLE_H) for a group-standings node [H3]', () => {
    expect(footprintOf(groupStandingsNode({ id: 'g', x: 0, y: 0 }))).toEqual({
      w: STANDINGS_W,
      h: GROUP_TABLE_H,
    });
  });
});

describe('boundsOf', () => {
  it('returns null for an empty node set', () => {
    expect(boundsOf([])).toBeNull();
  });

  it("anchors a single match node's own card footprint at its position", () => {
    const node = matchNode({ id: 'm', x: 100, y: 200, stage: 'GROUP_STAGE' });
    expect(boundsOf([node])).toEqual({ x: 100, y: 200, width: NODE_W, height: NODE_H });
  });

  it('uses the small day-marker footprint (96x32) for a lone day-marker', () => {
    const marker = dayMarkerNode({ id: 'd', x: 10, y: 20 });
    expect(boundsOf([marker])).toEqual({ x: 10, y: 20, width: 96, height: 32 });
  });

  it('spans the min/max envelope over a multi-node set (position + footprint)', () => {
    const near = matchNode({ id: 'm1', x: 0, y: 0, stage: 'GROUP_STAGE' });
    const far = matchNode({ id: 'm2', x: 500, y: 300, stage: 'ROUND_OF_16' });
    const bounds = boundsOf([near, far]);
    // minX/minY come from the top-left node; maxX/maxY from the far node + its footprint.
    expect(bounds).toEqual({
      x: 0,
      y: 0,
      width: 500 + NODE_W,
      height: 300 + NODE_H,
    });
  });

  it('applies type-specific footprints per node (day-marker vs group-standings vs card) [H3]', () => {
    // A day-marker at the origin (96x32) and a group-standings table far right
    // (STANDINGS_W x GROUP_TABLE_H). The envelope spans to the standings box,
    // which is far taller/wider than the marker — so it dominates both axes.
    const marker = dayMarkerNode({ id: 'd', x: 0, y: 0 });
    const standings = groupStandingsNode({ id: 'g', x: 400, y: 10 });
    const bounds = boundsOf([marker, standings]);
    expect(bounds).toEqual({
      x: 0,
      y: 0,
      // maxX = 400 + STANDINGS_W (standings) ; maxY = 10 + GROUP_TABLE_H (standings)
      // vs 0 + 32 (marker) → 10 + GROUP_TABLE_H dominates.
      width: 400 + STANDINGS_W,
      height: 10 + GROUP_TABLE_H,
    });
  });

  it('handles negative coordinates correctly in the envelope', () => {
    const a = matchNode({ id: 'a', x: -200, y: -50, stage: 'GROUP_STAGE' });
    const b = matchNode({ id: 'b', x: 100, y: 100, stage: 'GROUP_STAGE' });
    expect(boundsOf([a, b])).toEqual({
      x: -200,
      y: -50,
      width: 300 + NODE_W,
      height: 150 + NODE_H,
    });
  });

  it('collapses coincident nodes to the larger of their footprints (never negative)', () => {
    // A card and a day-marker stacked at the same origin: the envelope must be
    // the card footprint (the larger), with a non-negative width/height.
    const card = matchNode({ id: 'c', x: 0, y: 0, stage: 'GROUP_STAGE' });
    const marker = dayMarkerNode({ id: 'd', x: 0, y: 0 });
    expect(boundsOf([card, marker])).toEqual({ x: 0, y: 0, width: NODE_W, height: NODE_H });
  });

  it('is order-independent: the envelope is the same regardless of input order', () => {
    const near = matchNode({ id: 'm1', x: 0, y: 0, stage: 'GROUP_STAGE' });
    const far = matchNode({ id: 'm2', x: 500, y: 300, stage: 'ROUND_OF_16' });
    expect(boundsOf([near, far])).toEqual(boundsOf([far, near]));
  });
});

describe('isGroupZoneNode', () => {
  it('is true for a group-standings node [H3]', () => {
    expect(isGroupZoneNode(groupStandingsNode({ id: 'g', x: 0, y: 0 }))).toBe(true);
  });

  it('is true for a GROUP_STAGE match', () => {
    expect(isGroupZoneNode(matchNode({ id: 'm', x: 0, y: 0, stage: 'GROUP_STAGE' }))).toBe(true);
  });

  it('is false for a knockout match', () => {
    expect(isGroupZoneNode(matchNode({ id: 'm', x: 0, y: 0, stage: 'QUARTER_FINALS' }))).toBe(
      false,
    );
  });

  it('is false for a day-marker node', () => {
    expect(isGroupZoneNode(dayMarkerNode({ id: 'd', x: 0, y: 0 }))).toBe(false);
  });
});

describe('isKnockoutNode', () => {
  it.each(KNOCKOUT_STAGES)('is true for a %s match', (stage) => {
    expect(isKnockoutNode(matchNode({ id: 'm', x: 0, y: 0, stage }))).toBe(true);
  });

  it('is false for a GROUP_STAGE match', () => {
    expect(isKnockoutNode(matchNode({ id: 'm', x: 0, y: 0, stage: 'GROUP_STAGE' }))).toBe(false);
  });

  it('is false for a group-standings node [H3]', () => {
    expect(isKnockoutNode(groupStandingsNode({ id: 'g', x: 0, y: 0 }))).toBe(false);
  });

  it('is false for a day-marker node', () => {
    expect(isKnockoutNode(dayMarkerNode({ id: 'd', x: 0, y: 0 }))).toBe(false);
  });
});

describe('predicate mutual-exclusivity', () => {
  // For ANY match node, exactly one predicate holds — never both, never neither.
  it.each(ALL_STAGES)('classifies a %s match as exactly one zone', (stage) => {
    const node: RoadmapNode = matchNode({ id: `m-${stage}`, x: 0, y: 0, stage });
    expect(isGroupZoneNode(node)).not.toBe(isKnockoutNode(node));
  });

  it.each<RoadmapNode>([
    dayMarkerNode({ id: 'd', x: 0, y: 0 }),
    groupStandingsNode({ id: 'g', x: 0, y: 0 }),
  ])('never marks a non-match guide node as knockout (type: $type)', (guide) => {
    expect(isKnockoutNode(guide)).toBe(false);
  });

  it('marks the group-standings guide as a group-zone node, not knockout [H3]', () => {
    // The standings table is part of the group band, so "groups"/"all" framing
    // includes it: group-zone true, knockout false (never both/neither for a guide).
    const standings = groupStandingsNode({ id: 'g', x: 0, y: 0 });
    expect(isGroupZoneNode(standings)).toBe(true);
    expect(isKnockoutNode(standings)).toBe(false);
  });
});
