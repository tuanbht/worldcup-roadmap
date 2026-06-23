// Unit spec for the PURE display-layer helper `applyNearestFlag(nodes, nearestId)`
// (plan Test Strategy: "Unit — apply-nearest-flag.test.ts"; Acceptance #1, #2,
// #8). Node env (no DOM); fixtures are tiny hand-built `RoadmapNode[]`, so the
// "flag exactly the one nearest match node, immutably" contract is exercised with
// no clock, no graph build, and no React Flow runtime.
//
// RED until `applyNearestFlag` is implemented — today the stub throws
// "not implemented", so every assertion fails for the right (missing-logic)
// reason rather than a typo or a passing implementation. The M1/H1 guard case
// deliberately constructs a NON-match node whose id collides with `nearestId`,
// proving selection turns on the `node.type === 'match'` guard rather than
// id-namespace luck; the knockout case proves a KO `match` node (group === null)
// is flagged exactly like a group `match` node.
//
// H1: the guide-node fixtures are RETARGETED off the removed `group-header` pill
// onto the always-on `group-standings` table node — the behavioral guard
// (a non-match node sharing the nearest id is never flagged) is PRESERVED, not
// dropped, exactly as the plan requires.
import { describe, expect, it } from 'vitest';
import { teamRef, EMPTY_SCORE } from '@/domain/types';
import type { Group } from '@/domain/types';
import { applyNearestFlag } from './apply-nearest-flag';
import type {
  DayMarkerFlowNode,
  GroupStandingsFlowNode,
  MatchFlowNode,
  MatchNodeData,
  RoadmapNode,
} from './graph-model';

const HOME = teamRef({ id: 'team-arg', name: 'Argentina', code: 'ARG', flagUrl: null });
const AWAY = teamRef({ id: 'team-fra', name: 'France', code: 'FRA', flagUrl: null });

/**
 * A group-stage match's data. `overrides` lets a single case opt into a knockout
 * shape (`group: null`, `stage: 'FINAL'`) without a second factory, so the helper
 * is exercised against both card kinds through one builder.
 */
function matchData(matchId: string, overrides: Partial<MatchNodeData> = {}): MatchNodeData {
  return {
    matchId,
    stage: 'GROUP_STAGE',
    roundLabel: 'Group Stage',
    group: 'A',
    matchday: 1,
    home: HOME,
    away: AWAY,
    score: EMPTY_SCORE,
    status: 'scheduled',
    kickoff: '2026-06-02T14:30:00.000Z',
    minute: null,
    venue: { name: null, city: null },
    isFinal: false,
    isThirdPlace: false,
    ...overrides,
  };
}

function matchNode(id: string, overrides: Partial<MatchNodeData> = {}): MatchFlowNode {
  return { id, type: 'match', position: { x: 0, y: 0 }, data: matchData(id, overrides) };
}

/** A knockout match node (group === null) — still `type: 'match'`, so flaggable. */
function knockoutNode(id: string): MatchFlowNode {
  return matchNode(id, {
    stage: 'FINAL',
    roundLabel: 'Final',
    group: null,
    matchday: null,
    isFinal: true,
  });
}

function dayMarkerNode(id: string): DayMarkerFlowNode {
  return {
    id,
    type: 'day-marker',
    position: { x: 0, y: 0 },
    data: { dayKey: id, dayLabel: 'Jun 2', dayIndex: 0 },
  };
}

/** The always-on standings table guide (replaces the removed group-header pill). */
function groupStandingsNode(id: string, name: string): GroupStandingsFlowNode {
  const group: Group = { name, table: [] };
  return { id, type: 'group-standings', position: { x: 0, y: 0 }, data: { group } };
}

/** A mixed graph: 3 match cards interleaved with non-match rail/standings guides. */
function sampleNodes(): RoadmapNode[] {
  return [
    dayMarkerNode('day-marker-2026-06-02'),
    groupStandingsNode('group-standings-A', 'A'),
    matchNode('m1'),
    matchNode('m2'),
    matchNode('m3'),
  ];
}

/** True only when a node carries `isNearest === true` (match nodes only). */
function isFlagged(node: RoadmapNode): boolean {
  return node.type === 'match' && node.data.isNearest === true;
}

/** The ids of every node the helper flagged — the spec's core observable. */
function flaggedIds(nodes: readonly RoadmapNode[]): string[] {
  return nodes.filter(isFlagged).map((n) => n.id);
}

describe('applyNearestFlag — single-flag selection', () => {
  it('flags exactly the one match node whose id === nearestId, and no other node', () => {
    const result = applyNearestFlag(sampleNodes(), 'm2');
    // The flag set is precisely {m2}: one match flagged, the other cards (m1, m3)
    // and the non-match guides untouched.
    expect(flaggedIds(result)).toEqual(['m2']);
  });

  it('flags a knockout match node (group === null) the same as a group card', () => {
    // The helper guards on `type === 'match'`, not on `group`, so a KO card — the
    // Final could well be the nearest fixture — must be flaggable too.
    const nodes: RoadmapNode[] = [matchNode('m1'), knockoutNode('final'), matchNode('m3')];
    const result = applyNearestFlag(nodes, 'final');
    expect(flaggedIds(result)).toEqual(['final']);
    const final = result.find((n) => n.id === 'final')!;
    expect(final.type).toBe('match');
    expect((final as MatchFlowNode).data.group).toBeNull();
  });

  it('preserves array length and node order', () => {
    const input = sampleNodes();
    const result = applyNearestFlag(input, 'm2');
    expect(result.map((n) => n.id)).toEqual(input.map((n) => n.id));
  });

  it('returns an empty array unchanged for empty input', () => {
    expect(applyNearestFlag([], 'm2')).toEqual([]);
    expect(applyNearestFlag([], null)).toEqual([]);
  });
});

describe('applyNearestFlag — null / no-match (Acceptance #2)', () => {
  it('flags nothing when nearestId is null (all matches ended)', () => {
    const result = applyNearestFlag(sampleNodes(), null);
    expect(flaggedIds(result)).toEqual([]);
  });

  it('flags nothing when nearestId matches no node in the list', () => {
    const result = applyNearestFlag(sampleNodes(), 'does-not-exist');
    expect(flaggedIds(result)).toEqual([]);
  });
});

describe('applyNearestFlag — type guard (M1/H1)', () => {
  it('never flags a non-match node even when its id collides with nearestId', () => {
    // A day-marker AND a group-standings node whose ids are exactly the
    // nearestId: only the `node.type === "match"` guard (not the id check) keeps
    // them un-flagged. H1: the guide retargeted from group-header to
    // group-standings, the assertion preserved.
    const colliding: RoadmapNode[] = [
      dayMarkerNode('collide'),
      groupStandingsNode('collide', 'A'),
      matchNode('m1'),
    ];
    const result = applyNearestFlag(colliding, 'collide');

    expect(flaggedIds(result)).toEqual([]);
    // The non-match nodes must not have grown an `isNearest` field at all.
    const dayMarker = result.find((n) => n.type === 'day-marker')!;
    const standings = result.find((n) => n.type === 'group-standings')!;
    expect('isNearest' in dayMarker.data).toBe(false);
    expect('isNearest' in standings.data).toBe(false);
  });
});

describe('applyNearestFlag — immutability', () => {
  it('does not mutate the input array, node objects, or their data', () => {
    const input = sampleNodes();
    const originalTarget = input.find((n) => n.id === 'm2')!;
    const originalData = originalTarget.data;

    const result = applyNearestFlag(input, 'm2');

    // A fresh array is returned — the caller's `input` reference is never reused.
    expect(result).not.toBe(input);

    // Original target object/data are untouched (no isNearest leaked back in).
    expect((originalTarget as MatchFlowNode).data.isNearest).toBeUndefined();
    expect(originalTarget.data).toBe(originalData);

    // The flagged node is a NEW object reference with NEW data, not the original
    // mutated in place.
    const flagged = result.find((n) => n.id === 'm2')!;
    expect(flagged).not.toBe(originalTarget);
    expect(flagged.data).not.toBe(originalData);

    // The source array is unchanged in length and in the identity of the items it
    // held — `applyNearestFlag` copied, it did not splice.
    expect(input).toHaveLength(5);
    expect(input.find((n) => n.id === 'm2')).toBe(originalTarget);
  });

  it('passes non-match nodes through as the same object references (structural copy)', () => {
    const input = sampleNodes();
    const result = applyNearestFlag(input, 'm2');

    const dmInput = input.find((n) => n.type === 'day-marker')!;
    const dmResult = result.find((n) => n.type === 'day-marker')!;
    expect(dmResult).toBe(dmInput);
  });
});
