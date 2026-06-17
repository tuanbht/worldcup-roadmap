import { describe, expect, it } from 'vitest';
import { buildRoadmapGraph } from './build-graph';
import { groupBandHeight, SECTION_GAP } from './layout/layout-constants';
import type { MatchNodeData, RoadmapGraph, RoadmapNode } from './graph-model';
import {
  allBracketNodes,
  deepFreeze,
  expectedAdvanceEdgeCount,
  expectedFeederCount,
  groupStageMatches,
  loadTournament,
} from './__test-support__/roadmap-fixtures';
import type { Match } from '@/domain/types';

/**
 * Spec for the NEW continuous-canvas `buildRoadmapGraph(tournament)` transform.
 *
 * Rewritten wholesale from the old 3-view (groups/bracket/full) characterization.
 * One graph: a horizontal group band (one `match` node per GROUP_STAGE match +
 * one `group` table node per group) flowing down into the vertical KO. Every
 * count is DERIVED from the validated mock fixture (12 groups, 32 bracket nodes,
 * 104 matches => 72 group-stage matches), never hardcoded. Acceptance #1-#9.
 *
 * The graph is rebuilt lazily INSIDE each test (`graph()`), so an unimplemented
 * builder fails each acceptance assertion individually instead of collapsing the
 * whole file at import time.
 */

const tournament = loadTournament();
const graph = (): RoadmapGraph => buildRoadmapGraph(tournament);

const groupMatches: Match[] = groupStageMatches(tournament);
const bracketNodes = allBracketNodes(tournament.bracket);
const groupCount = tournament.groups.length;
const bandHeight = groupBandHeight(groupCount);
const koThreshold = bandHeight + SECTION_GAP;

const groupMatchIds = new Set(groupMatches.map((m) => m.id));
const bracketMatchIds = new Set(bracketNodes.map((n) => n.matchId));
const matchById = new Map(groupMatches.map((m) => [m.id, m]));

function isMatch(n: RoadmapNode): n is RoadmapNode & { data: MatchNodeData } {
  return n.type === 'match';
}

const matchNodes = () => graph().nodes.filter(isMatch);
const groupCards = () => matchNodes().filter((n) => groupMatchIds.has(n.id));
const koCards = () => matchNodes().filter((n) => bracketMatchIds.has(n.id));

describe('buildRoadmapGraph — node composition', () => {
  it('emits one match node per GROUP_STAGE match (72) + one per bracket node (32)', () => {
    expect(groupMatches.length).toBe(72); // fixture self-check
    expect(groupCards()).toHaveLength(groupMatches.length);
    expect(koCards()).toHaveLength(bracketNodes.length);
  });

  it('keeps exactly one group table node per group, at its lane start (x=0)', () => {
    const groupNodes = graph().nodes.filter((n) => n.type === 'group');
    expect(groupNodes).toHaveLength(groupCount);
    for (const n of groupNodes) {
      expect(n.position.x).toBe(0);
    }
  });

  it('has no duplicate node ids', () => {
    const ids = matchAllIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  function matchAllIds(): string[] {
    return graph().nodes.map((n) => n.id);
  }
});

describe('buildRoadmapGraph — continuous canvas geometry', () => {
  it('keeps every group card in the top band, above the KO threshold', () => {
    for (const n of groupCards()) {
      expect(n.position.y).toBeLessThan(koThreshold);
    }
  });

  it('places every KO node at or below groupBandHeight + SECTION_GAP', () => {
    const ko = koCards();
    expect(ko.length).toBeGreaterThan(0);
    for (const n of ko) {
      expect(n.position.y).toBeGreaterThanOrEqual(koThreshold);
    }
  });
});

describe('buildRoadmapGraph — downward handle contract (authoritative)', () => {
  it("routes every advance + feeder edge bottom->top ('b' -> 't')", () => {
    const edges = graph().edges;
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(edge.sourceHandle).toBe('b');
      expect(edge.targetHandle).toBe('t');
    }
  });

  it('uses no legacy left/right handle ids (sl/sr/tl/tr)', () => {
    const legacy = new Set(['sl', 'sr', 'tl', 'tr']);
    for (const edge of graph().edges) {
      expect(legacy.has(edge.sourceHandle ?? '')).toBe(false);
      expect(legacy.has(edge.targetHandle ?? '')).toBe(false);
    }
  });
});

describe('buildRoadmapGraph — edges', () => {
  it('feeds each group into exactly the R32 matches it seeds, with resolvable endpoints', () => {
    const g = graph();
    const nodeIds = new Set(g.nodes.map((n) => n.id));
    const feedEdges = g.edges.filter((e) => e.id.startsWith('feed-'));
    const expected = expectedFeederCount(tournament);
    expect(expected).toBeGreaterThan(0);
    expect(feedEdges).toHaveLength(expected);
    for (const edge of feedEdges) {
      expect(edge.source).toMatch(/^group-/);
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
      expect(bracketMatchIds.has(edge.target)).toBe(true); // targets are R32 match nodes
    }
  });

  it('emits one advance edge per non-group bracket slot, all endpoints resolvable', () => {
    const g = graph();
    const nodeIds = new Set(g.nodes.map((n) => n.id));
    const advanceEdges = g.edges.filter((e) => !e.id.startsWith('feed-'));
    expect(advanceEdges).toHaveLength(expectedAdvanceEdgeCount(tournament));
    for (const edge of advanceEdges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });
});

describe('buildRoadmapGraph — match payload', () => {
  it('populates group/matchday/stage on group cards from the domain match', () => {
    const cards = groupCards();
    expect(cards.length).toBe(groupMatches.length);
    for (const node of cards) {
      const match = matchById.get(node.id)!;
      expect(node.data.group).toBe(match.group);
      expect(node.data.matchday).toBe(match.matchday);
      expect(node.data.stage).toBe('GROUP_STAGE');
    }
  });

  it('leaves group/matchday null on every knockout card', () => {
    const cards = koCards();
    expect(cards.length).toBe(bracketNodes.length);
    for (const node of cards) {
      expect(node.data.group).toBeNull();
      expect(node.data.matchday).toBeNull();
      expect(node.data.stage).not.toBe('GROUP_STAGE');
    }
  });
});

describe('buildRoadmapGraph — purity', () => {
  it('produces structurally-equal output across calls', () => {
    expect(buildRoadmapGraph(tournament)).toEqual(buildRoadmapGraph(tournament));
  });

  it('does not mutate a deeply-frozen tournament', () => {
    const frozen = deepFreeze(loadTournament());
    expect(() => buildRoadmapGraph(frozen)).not.toThrow();
  });
});
