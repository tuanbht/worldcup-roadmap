import { describe, expect, it } from 'vitest';
import { buildRoadmapGraph } from './build-graph';
import { DAY_ROW_PITCH, HEADER_H, RAIL_W } from './layout/layout-constants';
import type { MatchNodeData, RoadmapGraph, RoadmapNode } from './graph-model';
import {
  allBracketNodes,
  deepFreeze,
  distinctMatchDays,
  expectedAdvanceEdgeCount,
  expectedFeederCount,
  fixtureDayKey,
  groupStageMatches,
  loadTournament,
} from './__test-support__/roadmap-fixtures';
import type { Match } from '@/domain/types';

/**
 * Spec for the NEW timeline-grid `buildRoadmapGraph(tournament)` transform: ONE
 * immutable graph composing the group grid + knockout funnel onto a shared day
 * axis, plus `day-marker` rail guides and `group-header` column guides, with
 * feeder (group-header -> seeded R32) + downward advance edges. Plan Test
 * Strategy 17-23 / Acceptance #1, #5, #6, #9, #10, #11.
 *
 * RED until the timeline-grid build-graph is implemented. Every count is
 * fixture-derived (104 matches = 72 group + 32 bracket; 14 distinct days; 12
 * groups), never hardcoded. The graph is rebuilt INSIDE each test so an
 * unimplemented builder fails each assertion individually.
 */

const tournament = loadTournament();
const graph = (): RoadmapGraph => buildRoadmapGraph(tournament);

const groupMatches: Match[] = groupStageMatches(tournament);
const bracketNodes = allBracketNodes(tournament.bracket);
const groupCount = tournament.groups.length;
const distinctDays = distinctMatchDays(tournament);

const groupMatchIds = new Set(groupMatches.map((m) => m.id));
const bracketMatchIds = new Set(bracketNodes.map((n) => n.matchId));
const matchById = new Map(groupMatches.map((m) => [m.id, m]));
/** The R32 match ids — feeder edges may only target these (not any KO node). */
const r32MatchIds = new Set(
  (tournament.bracket.rounds.find((r) => r.stage === 'ROUND_OF_32')?.nodes ?? []).map(
    (n) => n.matchId,
  ),
);

function isMatch(n: RoadmapNode): n is RoadmapNode & { data: MatchNodeData } {
  return n.type === 'match';
}

const nodesOfType = (type: string) => graph().nodes.filter((n) => n.type === type);
const matchNodes = () => graph().nodes.filter(isMatch);
const groupCards = () => matchNodes().filter((n) => groupMatchIds.has(n.id));
const koCards = () => matchNodes().filter((n) => bracketMatchIds.has(n.id));

describe('buildRoadmapGraph — node composition [Acceptance #1]', () => {
  it('emits exactly one match node per match (72 group + 32 bracket = 104)', () => {
    expect(groupMatches.length).toBe(72); // fixture self-check
    expect(bracketNodes.length).toBe(32);
    expect(matchNodes()).toHaveLength(104);
    expect(groupCards()).toHaveLength(groupMatches.length);
    expect(koCards()).toHaveLength(bracketNodes.length);
  });

  it('has NO positioned group table node (standings moved to overlay)', () => {
    expect(nodesOfType('group')).toHaveLength(0);
  });
});

describe('buildRoadmapGraph — guide nodes [Acceptance #5/#6]', () => {
  it('emits exactly one day-marker per distinct match-day, in the left rail (x < RAIL_W)', () => {
    const markers = nodesOfType('day-marker');
    expect(markers).toHaveLength(distinctDays.length); // 14, fixture-derived
    for (const marker of markers) {
      expect(marker.position.x).toBeLessThan(RAIL_W);
    }
  });

  it('orders day-markers by ascending row (chronological), one row per distinct day', () => {
    const markers = nodesOfType('day-marker');
    expect(markers).toHaveLength(distinctDays.length); // guard: not vacuously true on []
    const ys = markers.map((n) => n.position.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    expect(new Set(ys).size).toBe(ys.length); // distinct row per distinct day
  });

  it('emits exactly one group-header per group (12), in the top band (y < HEADER_H)', () => {
    const headers = nodesOfType('group-header');
    expect(headers).toHaveLength(groupCount);
    for (const header of headers) {
      expect(header.position.y).toBeLessThan(HEADER_H);
    }
  });
});

describe('buildRoadmapGraph — downward handle contract [Acceptance #10]', () => {
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

describe('buildRoadmapGraph — edges [Acceptance #9]', () => {
  it('feeds each group-header into exactly the R32 matches it seeds, resolvable endpoints', () => {
    const g = graph();
    const nodeIds = new Set(g.nodes.map((n) => n.id));
    const feedEdges = g.edges.filter((e) => e.id.startsWith('feed-'));
    const expected = expectedFeederCount(tournament);
    expect(expected).toBeGreaterThan(0);
    expect(feedEdges).toHaveLength(expected);
    for (const edge of feedEdges) {
      expect(edge.source).toMatch(/^group-header-/); // source is the column guide
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
      // Feeders may seed ONLY R32 matches, never a later-round KO node.
      expect(r32MatchIds.has(edge.target)).toBe(true);
    }
  });

  it('emits one advance edge per non-group bracket slot, all endpoints resolvable', () => {
    const g = graph();
    const nodeIds = new Set(g.nodes.map((n) => n.id));
    const advanceEdges = g.edges.filter((e) => e.id.startsWith('adv-'));
    expect(advanceEdges).toHaveLength(expectedAdvanceEdgeCount(tournament));
    for (const edge of advanceEdges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it('routes every advance edge strictly downward (target row below source row) [Acceptance #8]', () => {
    const g = graph();
    const posById = new Map(g.nodes.map((n) => [n.id, n.position]));
    const advanceEdges = g.edges.filter((e) => e.id.startsWith('adv-'));
    expect(advanceEdges.length).toBeGreaterThan(0); // guard: not vacuously true
    for (const edge of advanceEdges) {
      const src = posById.get(edge.source)!;
      const tgt = posById.get(edge.target)!;
      // source = the earlier/upper child; target = the later/lower parent.
      expect(tgt.y, `advance edge ${edge.id} must flow downward`).toBeGreaterThan(src.y);
    }
  });
});

describe('buildRoadmapGraph — uniqueness [Acceptance #11]', () => {
  it('has no duplicate node id', () => {
    const ids = graph().nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate edge id', () => {
    const ids = graph().edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
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

  it('flags exactly one Final card and one THIRD_PLACE card among the KO cards', () => {
    const cards = koCards();
    expect(cards.filter((n) => n.data.isFinal)).toHaveLength(1);
    expect(cards.filter((n) => n.data.isThirdPlace)).toHaveLength(1);
    // The flags are mutually exclusive: no card is both Final and third place.
    expect(cards.every((n) => !(n.data.isFinal && n.data.isThirdPlace))).toBe(true);
    // The Final card carries the FINAL stage (label wiring, not just the flag).
    expect(cards.find((n) => n.data.isFinal)!.data.stage).toBe('FINAL');
  });
});

describe('buildRoadmapGraph — shared day axis [Acceptance #3]', () => {
  it('lands the Final on the shared-axis last day-row (HEADER_H + maxDayIndex*pitch)', () => {
    const g = graph();
    const finalNode = g.nodes.find((n) => isMatch(n) && n.data.isFinal);
    expect(finalNode).toBeDefined();
    const finalDay = fixtureDayKey(tournament.matches.find((m) => m.stage === 'FINAL')!.kickoff);
    const maxDayIndex = distinctMatchDays(tournament).indexOf(finalDay);
    const expectedY = HEADER_H + maxDayIndex * DAY_ROW_PITCH;
    expect(finalNode!.position.y).toBe(expectedY);
    // ...and that is the bottom-most row in the graph.
    const maxY = Math.max(...g.nodes.map((n) => n.position.y));
    expect(finalNode!.position.y).toBe(maxY);
  });

  it('puts every group card below the header band (y >= HEADER_H)', () => {
    for (const n of groupCards()) {
      expect(n.position.y).toBeGreaterThanOrEqual(HEADER_H);
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
