import { describe, expect, it } from 'vitest';
import { buildRoadmapGraph } from './build-graph';
import { computeBracketLayout } from './layout/bracket-layout';
import { computeGroupGrid, groupGridWidth } from './layout/group-layout';
import { GROUP_H, GROUP_W, NODE_H, NODE_W } from './layout/layout-constants';
import type { MatchNodeData, RoadmapNode } from './graph-model';
import { buildMockTournament } from '@/data/providers/mock/build-mock-tournament';
import { parseTournament } from '@/data/schema/tournament-schema';
import { R32_SEEDING } from '@/domain/bracket/seeding';
import { EMPTY_SCORE, type Tournament } from '@/domain/types';

/**
 * Characterization spec for the pure `buildRoadmapGraph` transform.
 *
 * The builder already ships and works, so these are EXPECTED GREEN immediately —
 * they lock current behaviour and add the coverage the plan calls for (#10).
 * Every count is DERIVED from the validated mock fixture, never hardcoded
 * (plan M3). Fixture: 12 groups, 32 bracket nodes, 104 matches.
 */

const FIXTURE_AT = '2026-06-17T00:00:00Z';

/** Fresh, validated tournament — re-parsed per call so no test can share state. */
function loadTournament(): Tournament {
  return parseTournament(buildMockTournament(FIXTURE_AT));
}

const tournament = loadTournament();

const FULL_GROUP_COLUMNS = 2;
const GROUPS_VIEW_COLUMNS = 4;
const FULL_BRACKET_OFFSET = groupGridWidth(FULL_GROUP_COLUMNS) + 180;

const bracketNodes = tournament.bracket.rounds.flatMap((r) => r.nodes);
const groupCount = tournament.groups.length;

function isMatch(n: RoadmapNode): n is RoadmapNode & { data: MatchNodeData } {
  return n.type === 'match';
}

/** Count the advance edges every bracket node should emit (one per non-group slot). */
function expectedAdvanceEdgeCount(t: Tournament): number {
  return t.bracket.rounds
    .flatMap((r) => r.nodes)
    .reduce(
      (count, node) =>
        count + [node.home, node.away].filter((s) => s.source.kind !== 'group').length,
      0,
    );
}

describe('buildRoadmapGraph — groups view', () => {
  const graph = buildRoadmapGraph(tournament, 'groups');

  it('emits exactly one node per group and no edges', () => {
    expect(graph.nodes).toHaveLength(groupCount);
    expect(graph.edges).toHaveLength(0);
  });

  it('emits only group nodes at the group-grid positions and fixed dimensions', () => {
    const positions = computeGroupGrid(groupCount, GROUPS_VIEW_COLUMNS);
    graph.nodes.forEach((node, i) => {
      expect(node.type).toBe('group');
      expect(node.position).toEqual(positions[i]);
      expect(node.width).toBe(GROUP_W);
      expect(node.height).toBe(GROUP_H);
    });
  });

  it('ids each node uniquely from its group name', () => {
    const ids = graph.nodes.map((n) => n.id).sort();
    const expected = tournament.groups.map((g) => `group-${g.name}`).sort();
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildRoadmapGraph — bracket view', () => {
  const graph = buildRoadmapGraph(tournament, 'bracket');

  it('emits one node per bracket node and zero group nodes', () => {
    expect(graph.nodes).toHaveLength(bracketNodes.length);
    expect(graph.nodes.every((n) => n.type === 'match')).toBe(true);
  });

  it('positions nodes from computeBracketLayout with no x-offset, at NODE_W x NODE_H', () => {
    const layout = computeBracketLayout(tournament.bracket);
    for (const node of graph.nodes) {
      expect(node.position).toEqual(layout.get(node.id));
      expect(node.width).toBe(NODE_W);
      expect(node.height).toBe(NODE_H);
    }
  });

  it('carries the concrete match payload for every bracket node that has one', () => {
    const matchIds = new Set(tournament.matches.map((m) => m.id));
    const matchNodes = graph.nodes.filter(isMatch);
    // Every bracket node in the mock fixture maps to a real match.
    expect(matchNodes.every((n) => matchIds.has(n.id))).toBe(true);
    for (const node of matchNodes) {
      const match = tournament.matches.find((m) => m.id === node.id)!;
      expect(node.data.status).toBe(match.status);
      expect(node.data.score).toEqual(match.score);
    }
  });
});

describe('buildRoadmapGraph — bracket node payload fallback', () => {
  it('uses scheduled + EMPTY_SCORE placeholders when a bracket node has no concrete match', () => {
    // Drop the FINAL match from the fixture so its bracket node has no payload.
    const finalNode = bracketNodes.find((n) => n.stage === 'FINAL')!;
    const orphaned: Tournament = {
      ...tournament,
      matches: tournament.matches.filter((m) => m.id !== finalNode.matchId),
    };

    const graph = buildRoadmapGraph(orphaned, 'bracket');
    // Node count is unchanged — the bracket topology is independent of `matches`.
    expect(graph.nodes).toHaveLength(bracketNodes.length);

    const orphanNode = graph.nodes.filter(isMatch).find((n) => n.id === finalNode.matchId)!;
    expect(orphanNode.data.status).toBe('scheduled');
    expect(orphanNode.data.score).toEqual(EMPTY_SCORE);
    expect(orphanNode.data.kickoff).toBeNull();
    expect(orphanNode.data.minute).toBeNull();
    expect(orphanNode.data.isFinal).toBe(true);
    // Placeholder teams fall back to the bracket slot's resolved team.
    expect(orphanNode.data.home).toEqual(finalNode.home.team);
    expect(orphanNode.data.away).toEqual(finalNode.away.team);
  });
});

describe('buildRoadmapGraph — advance edges (bracket view)', () => {
  const graph = buildRoadmapGraph(tournament, 'bracket');
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  it('emits exactly one edge per non-group slot source (child -> parent)', () => {
    expect(graph.edges).toHaveLength(expectedAdvanceEdgeCount(tournament));
  });

  it('resolves every edge endpoint to a real node in the graph', () => {
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it('gives every edge a unique id that encodes its slot side (home|away)', () => {
    const ids = graph.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const edge of graph.edges) {
      expect(edge.id).toMatch(/__(home|away)$/);
    }
  });

  it('routes handles toward the centre: a left child uses sr->tl, a right child uses sl->tr', () => {
    const layout = computeBracketLayout(tournament.bracket);
    let sawLeft = false;
    let sawRight = false;
    for (const edge of graph.edges) {
      const childX = layout.get(edge.source)!.x;
      const parentX = layout.get(edge.target)!.x;
      if (childX <= parentX) {
        expect(edge.sourceHandle).toBe('sr');
        expect(edge.targetHandle).toBe('tl');
        sawLeft = true;
      } else {
        expect(edge.sourceHandle).toBe('sl');
        expect(edge.targetHandle).toBe('tr');
        sawRight = true;
      }
    }
    // Both halves of the mirrored bracket must be exercised.
    expect(sawLeft).toBe(true);
    expect(sawRight).toBe(true);
  });

  it('derives advance-edge state from match status/score (decided + live, never undecided)', () => {
    // Mock fixture: R32->SF finished (decisive winners) => parent edges 'decided';
    // the live Final => its two incoming edges 'live'; the SCHEDULED third-place
    // play-off is still fed by FINISHED semifinal LOSERS, so even those edges are
    // 'decided'. No bracket edge is 'undecided' — that state appears only on the
    // full-view feed edges (asserted below), so we pin the exact composition.
    const states = graph.edges.map((e) => e.data?.state);
    expect(new Set(states)).toEqual(new Set(['decided', 'live']));
    expect(states.filter((s) => s === 'live')).toHaveLength(2); // both Final feeders
    expect(states.filter((s) => s === 'decided').length).toBeGreaterThan(0);
    expect(states).not.toContain('undecided');
    for (const s of states) {
      expect(['decided', 'undecided', 'live']).toContain(s);
    }
  });
});

describe('buildRoadmapGraph — full view', () => {
  const graph = buildRoadmapGraph(tournament, 'full');
  const bracketGraph = buildRoadmapGraph(tournament, 'bracket');
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  it('emits group nodes plus bracket nodes with no duplicate ids', () => {
    expect(graph.nodes).toHaveLength(groupCount + bracketNodes.length);
    const groups = graph.nodes.filter((n) => n.type === 'group');
    const matches = graph.nodes.filter((n) => n.type === 'match');
    expect(groups).toHaveLength(groupCount);
    expect(matches).toHaveLength(bracketNodes.length);
    expect(nodeIds.size).toBe(graph.nodes.length);
  });

  it('offsets every bracket node x by groupGridWidth(2) + 180 vs. the bracket view', () => {
    const baseXById = new Map(bracketGraph.nodes.map((n) => [n.id, n.position.x]));
    for (const node of graph.nodes) {
      if (node.type !== 'match') continue;
      expect(node.position.x).toBe(baseXById.get(node.id)! + FULL_BRACKET_OFFSET);
    }
  });

  it('feeds each group into the R32 matches it seeds, as undecided feed edges', () => {
    const r32 = tournament.bracket.rounds.find((r) => r.stage === 'ROUND_OF_32')!;
    let expectedFeed = 0;
    for (const group of tournament.groups) {
      r32.nodes.forEach((_kn, slot) => {
        const pair = R32_SEEDING[slot];
        const feeds = [pair.home, pair.away].some(
          (p) => p === `1${group.name}` || p === `2${group.name}`,
        );
        if (feeds) expectedFeed += 1;
      });
    }
    const feedEdges = graph.edges.filter((e) => e.id.startsWith('feed-'));
    expect(feedEdges).toHaveLength(expectedFeed);
    expect(expectedFeed).toBeGreaterThan(0);
    for (const edge of feedEdges) {
      expect(edge.source).toMatch(/^group-/);
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
      expect(edge.sourceHandle).toBe('sr');
      expect(edge.targetHandle).toBe('tl');
      expect(edge.data?.state).toBe('undecided');
    }
  });

  it('keeps feed edges and advance edges in disjoint id-spaces and surfaces all three states', () => {
    const feedEdges = graph.edges.filter((e) => e.id.startsWith('feed-'));
    const advanceEdges = graph.edges.filter((e) => !e.id.startsWith('feed-'));
    // Advance edges are unchanged from the bracket view (same count, ids).
    expect(advanceEdges).toHaveLength(expectedAdvanceEdgeCount(tournament));
    expect(feedEdges.length + advanceEdges.length).toBe(graph.edges.length);
    // The combined edge set is where all three states co-exist (plan item 5).
    const states = new Set(graph.edges.map((e) => e.data?.state));
    expect(states).toEqual(new Set(['decided', 'undecided', 'live']));
  });
});

describe('buildRoadmapGraph — purity', () => {
  it('produces structurally-equal output across repeated calls', () => {
    const a = buildRoadmapGraph(tournament, 'full');
    const b = buildRoadmapGraph(tournament, 'full');
    expect(a).toEqual(b);
  });

  it('does not mutate a deeply-frozen input tournament', () => {
    const frozen = deepFreeze(loadTournament());
    expect(() => buildRoadmapGraph(frozen, 'groups')).not.toThrow();
    expect(() => buildRoadmapGraph(frozen, 'bracket')).not.toThrow();
    expect(() => buildRoadmapGraph(frozen, 'full')).not.toThrow();
  });
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
