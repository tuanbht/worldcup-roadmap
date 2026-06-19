import { describe, expect, it } from 'vitest';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { buildRoadmapGraph } from './build-graph';
import { formatDate } from '@/lib/datetime';
import { DAY_ROW_PITCH, HEADER_H, RAIL_W } from './layout/layout-constants';
import type {
  DayMarkerFlowNode,
  MatchFlowNode,
  MatchNodeData,
  RoadmapGraph,
  RoadmapNode,
} from './graph-model';
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
 * Spec for the timeline-grid `buildRoadmapGraph(tournament, tz?)` transform: ONE
 * immutable graph composing the group grid + knockout funnel onto a shared day
 * axis, plus `day-marker` rail guides and `group-header` column guides, with
 * feeder (group-header -> seeded R32) + downward advance edges. Plan Test
 * Strategy 9-12 / Acceptance #1, #2, #3, #6.
 *
 * DETERMINISM: structural assertions that compare against `fixtureDayKey` (a UTC
 * ISO slice) pin `tz:'UTC'` so they hold on ANY machine zone. The new bug
 * regression builds in `Asia/Bangkok` and proves every row pill == its card's
 * own local kickoff date.
 *
 * Every count is fixture-derived (104 matches = 72 group + 32 bracket; 14
 * distinct UTC days; 12 groups), never hardcoded. The graph is rebuilt INSIDE
 * each test so an unimplemented builder fails each assertion individually.
 */

const tournament = loadTournament();
const graph = (): RoadmapGraph => buildRoadmapGraph(tournament, 'UTC');

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
  it("feeds each group's exit match into exactly the R32 matches it seeds, resolvable endpoints", () => {
    const g = graph();
    const nodeIds = new Set(g.nodes.map((n) => n.id));
    const matchById = new Map(tournament.matches.map((m) => [m.id, m]));
    const feedEdges = g.edges.filter((e) => e.id.startsWith('feed-'));
    const expected = expectedFeederCount(tournament);
    expect(expected).toBeGreaterThan(0);
    expect(feedEdges).toHaveLength(expected);
    for (const edge of feedEdges) {
      const groupName = edge.id.match(/^feed-([A-Z])-/)?.[1];
      // Source is the group's exit match (its latest-kickoff game at the bottom of
      // the column), not the top column guide — so the line is a short
      // "group match -> R32" connector rather than a full-canvas diagonal.
      expect(matchById.get(edge.source)?.stage).toBe('GROUP_STAGE');
      expect(matchById.get(edge.source)?.group).toBe(groupName);
      const exit = tournament.matches
        .filter((m) => m.stage === 'GROUP_STAGE' && m.group === groupName)
        .sort((a, b) =>
          a.kickoff === b.kickoff ? a.id.localeCompare(b.id) : a.kickoff.localeCompare(b.kickoff),
        )
        .at(-1);
      expect(edge.source).toBe(exit?.id);
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
    expect(buildRoadmapGraph(tournament, 'UTC')).toEqual(buildRoadmapGraph(tournament, 'UTC'));
  });

  it('does not mutate a deeply-frozen tournament', () => {
    const frozen = deepFreeze(loadTournament());
    expect(() => buildRoadmapGraph(frozen, 'UTC')).not.toThrow();
  });
});

// --- Bug regression + one-zone wiring (the headline fix) --------------------

/** Type guard for the left-rail date markers. */
function isDayMarker(n: RoadmapNode): n is DayMarkerFlowNode {
  return n.type === 'day-marker';
}
/** Type guard for the positioned match cards. */
function isMatchNode(n: RoadmapNode): n is MatchFlowNode {
  return n.type === 'match';
}

const BKK = 'Asia/Bangkok'; // UTC+7: evening-UTC fixtures roll to the next day.

/** Independent oracle for "the card's own local kickoff date" — date-fns-tz
 *  directly, NOT the production code under test, so the assertion is real. */
const localDay = (iso: string, tz: string = BKK): string =>
  formatInTimeZone(parseISO(iso), tz, 'yyyy-MM-dd');
/** True when an instant lands on a different calendar day in `tz` than its UTC slice. */
const rolls = (iso: string, tz: string = BKK): boolean => localDay(iso, tz) !== fixtureDayKey(iso);

/** The day-marker pill living on a given row `y` (the card's row), by position. */
function markersByRow(g: RoadmapGraph): ReadonlyMap<number, DayMarkerFlowNode> {
  const byY = new Map<number, DayMarkerFlowNode>();
  for (const n of g.nodes) if (isDayMarker(n)) byY.set(n.position.y, n);
  return byY;
}

/** Every match's TRUE kickoff (KO card data carries kickoff:null by design, so
 *  the knockout kickoff is recovered from the tournament for row assertions). */
const kickoffById = new Map(tournament.matches.map((m) => [m.id, m.kickoff]));

describe('buildRoadmapGraph — local-zone pill == card date [Acceptance #2]', () => {
  it("groups EVERY match's row (group AND knockout) under its own local calendar day", () => {
    // THE BUG: the card shows local time but the row was grouped by the UTC day,
    // so a match locally on 19 Jun could land in a row pill reading 18 Jun. Built
    // in Asia/Bangkok, the day-marker on each match's row must carry that match's
    // OWN local kickoff date — both as the sortable dayKey and the human label.
    // We use each match's true kickoff (recovered for KO cards whose data.kickoff
    // is null) so the invariant is proven for the knockout funnel too, not just
    // the group grid.
    const g = buildRoadmapGraph(tournament, BKK);
    const markers = markersByRow(g);
    const cards = g.nodes.filter(isMatchNode);
    expect(cards).toHaveLength(104); // guard: not vacuously true

    let checked = 0;
    for (const card of cards) {
      const kickoff = kickoffById.get(card.id);
      expect(kickoff, `no kickoff resolvable for card ${card.id}`).toBeDefined();
      const marker = markers.get(card.position.y);
      expect(marker, `no day-marker on the row of card ${card.id}`).toBeDefined();
      // Sortable key: the row groups by the card's LOCAL day, not its UTC day.
      expect(marker!.data.dayKey, `dayKey mismatch for ${card.id}`).toBe(localDay(kickoff!));
      // Human label: the pill text == the card's own local date (formatDate is
      // already local; this proves grouping is now consistent with it).
      expect(marker!.data.dayLabel, `dayLabel mismatch for ${card.id}`).toBe(
        formatDate(kickoff!, BKK),
      );
      checked += 1;
    }
    expect(checked).toBe(104); // every card asserted, none skipped
  });

  it('exercises BOTH a rolled GROUP card and a rolled KNOCKOUT card (guard: not vacuous)', () => {
    // Without this guard the regression could pass vacuously if fixtures changed
    // so nothing rolled. Evening-UTC kickoffs (18:00Z+) roll forward in UTC+7 —
    // and we require at least one of EACH stage so both layout passes are proven.
    const groupRolled = groupMatches.filter((m) => rolls(m.kickoff));
    const koRolled = bracketNodes
      .map((n) => kickoffById.get(n.matchId))
      .filter((k): k is string => k !== undefined && rolls(k));
    expect(groupRolled.length, 'a group match must roll over in UTC+7').toBeGreaterThan(0);
    expect(koRolled.length, 'a knockout match must roll over in UTC+7').toBeGreaterThan(0);
  });

  it('yields strictly more day-rows in Asia/Bangkok than in UTC (local grouping diverges)', () => {
    const utcMarkers = buildRoadmapGraph(tournament, 'UTC').nodes.filter(isDayMarker);
    const bkkMarkers = buildRoadmapGraph(tournament, BKK).nodes.filter(isDayMarker);
    expect(utcMarkers).toHaveLength(distinctMatchDays(tournament).length); // 14
    expect(bkkMarkers.length).toBeGreaterThan(utcMarkers.length);
  });
});

describe('buildRoadmapGraph — ONE consistent zone across passes [Acceptance #3]', () => {
  it('applies the same zone to BOTH group rows (group-layout) and knockout rows (bracket-layout)', () => {
    // group-layout and bracket-layout each compute a card's row via their own
    // `rowY -> dayKey` call. If either used a zone different from the markers,
    // a rolled-over card would land on a UTC-day row. Build in Bangkok and assert
    // a rolled GROUP card AND a rolled KNOCKOUT node both land on a marker row
    // carrying their LOCAL day.
    const g = buildRoadmapGraph(tournament, BKK);
    const markers = markersByRow(g);
    const posById = new Map(g.nodes.filter(isMatchNode).map((c) => [c.id, c.position]));

    // A rolled GROUP card (kickoff lives on the card; group-layout placed its row).
    const groupRolled = groupMatches.find((m) => posById.has(m.id) && rolls(m.kickoff));
    expect(groupRolled, 'expected a group card that rolls over in UTC+7').toBeDefined();
    expect(markers.get(posById.get(groupRolled!.id)!.y)?.data.dayKey).toBe(
      localDay(groupRolled!.kickoff),
    );

    // A rolled KNOCKOUT match (kickoff from the tournament; bracket-layout placed
    // its row). The mock's 22:00Z semi-final rolls forward in UTC+7.
    const koMatch = tournament.matches.find(
      (m) => m.stage !== 'GROUP_STAGE' && posById.has(m.id) && rolls(m.kickoff),
    );
    expect(koMatch, 'expected a knockout match that rolls over in UTC+7').toBeDefined();
    expect(markers.get(posById.get(koMatch!.id)!.y)?.data.dayKey).toBe(localDay(koMatch!.kickoff));
  });

  it('keeps match-node + edge identity stable across zones (only the day computation changes)', () => {
    // The zone changes which ROW a card sits on, never which MATCH nodes/edges
    // exist: match-node ids and edge ids must be identical between UTC and
    // Bangkok builds (Acceptance #3 — one zone applied uniformly, no structural
    // drift). Day-marker guide nodes are deliberately EXCLUDED: their ids are
    // `day-marker-${dayKey}`, so they correctly differ by zone (evening-UTC
    // matches roll forward in UTC+7, producing more day-rows — exactly the
    // feature's point, asserted by the sibling test above).
    const utc = buildRoadmapGraph(tournament, 'UTC');
    const bkk = buildRoadmapGraph(tournament, BKK);
    const matchIds = (g: RoadmapGraph) => new Set(g.nodes.filter(isMatchNode).map((n) => n.id));
    expect(matchIds(bkk)).toEqual(matchIds(utc));
    expect(new Set(bkk.edges.map((e) => e.id))).toEqual(new Set(utc.edges.map((e) => e.id)));
    // Advance edges still flow strictly downward in the non-UTC zone.
    const posById = new Map(bkk.nodes.map((n) => [n.id, n.position]));
    const advance = bkk.edges.filter((e) => e.id.startsWith('adv-'));
    expect(advance.length).toBeGreaterThan(0);
    for (const e of advance) {
      expect(posById.get(e.target)!.y).toBeGreaterThan(posById.get(e.source)!.y);
    }
  });
});
