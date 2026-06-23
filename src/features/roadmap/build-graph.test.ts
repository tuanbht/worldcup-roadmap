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
  koMatchById,
  loadTournament,
} from './__test-support__/roadmap-fixtures';
import type { Match, Tournament } from '@/domain/types';
import { EMPTY_SCORE } from '@/domain/types';

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

/** Every match's TRUE kickoff, recovered from the tournament for row assertions.
 *  Independent of `data.kickoff` so the row math stays valid for an UNSCHEDULED
 *  KO slot too (a bracket node with no backing Match carries kickoff:null). */
const kickoffById = new Map(tournament.matches.map((m) => [m.id, m.kickoff]));

describe('buildRoadmapGraph — local-zone pill == card date [Acceptance #2]', () => {
  it("groups EVERY match's row (group AND knockout) under its own local calendar day", () => {
    // THE BUG: the card shows local time but the row was grouped by the UTC day,
    // so a match locally on 19 Jun could land in a row pill reading 18 Jun. Built
    // in Asia/Bangkok, the day-marker on each match's row must carry that match's
    // OWN local kickoff date — both as the sortable dayKey and the human label.
    // We use each match's true kickoff (recovered from the tournament, never from
    // data.kickoff) so the invariant is proven for the knockout funnel too — and
    // stays valid for any unscheduled slot whose data.kickoff is null.
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

// --- CR-1: knockout cards must reflect REAL live state, not hardcoded scheduled ---
//
// BUG: knockoutMatchData(node) hardcodes score:EMPTY_SCORE / status:'scheduled' /
// kickoff:null / minute:null, so every KO card shows a grey "scheduled" pill +
// blank score regardless of the real Match in tournament.matches (which already
// colors the advance edges). The fix merges the resolved Match's live fields
// (score, status, kickoff, minute, venue) into the KO card node, keeping the
// structural fields from the BracketNode, with the current safe fallback only
// when NO real Match backs the slot. CR-1 Acceptance #1-#3, #5.
//
// The mock fixture (build-mock-tournament) gives us all three live states without
// any rigging: R32-SF are all `finished`, the Final `wc2026-f-1` is `live` at
// minute 67 / score 1-0, and the third-place `wc2026-3p-1` is `scheduled`. The
// no-real-match case (#3) is constructed by cloning the tournament with one
// bracket match removed from `matches`, so `matchById.get(node.matchId)` is
// undefined for a real bracket node.
describe('buildRoadmapGraph — knockout live state [CR-1 Acceptance #1-#3]', () => {
  /** Independent oracle: the real KO `Match` by id, straight off the tournament. */
  const liveMatches = koMatchById(tournament);

  /** The KO card payloads of a graph, indexed by match id (DRY: one build, reused). */
  const koCardsById = (g: RoadmapGraph): ReadonlyMap<string, MatchNodeData> =>
    new Map(
      g.nodes
        .filter(isMatch)
        .filter((n) => bracketMatchIds.has(n.id))
        .map((n) => [n.id, n.data]),
    );

  /** The KO card for `id` in a fresh default-zone build; fails loud if absent. */
  const koCard = (id: string, g: RoadmapGraph = graph()): MatchNodeData => {
    const card = koCardsById(g).get(id);
    expect(card, `expected a knockout card for ${id}`).toBeDefined();
    return card!;
  };

  /** The real `Match` for `id`; fails loud if the fixture invariant broke. */
  const oracle = (id: string, status: Match['status']): Match => {
    const match = liveMatches.get(id);
    expect(match, `fixture invariant: ${id} must exist`).toBeDefined();
    expect(match!.status, `fixture invariant: ${id} must be ${status}`).toBe(status);
    return match!;
  };

  it('#1 a KO node mapping to a FINISHED match carries that real score + status:finished', () => {
    const sf = oracle('wc2026-sf-1', 'finished');
    const card = koCard('wc2026-sf-1');
    expect(card.status).toBe('finished');
    // The REAL scoreline, not the EMPTY_SCORE the buggy code hardcoded.
    expect(card.score).toEqual(sf.score);
    expect(card.score).not.toEqual(EMPTY_SCORE);
    expect(card.score.home).not.toBeNull();
    expect(card.score.away).not.toBeNull();
  });

  it('#2 the live Final KO card carries status:live + its minute + running score', () => {
    const final = oracle('wc2026-f-1', 'live');
    const card = koCard('wc2026-f-1');
    expect(card.status).toBe('live');
    expect(card.minute).toBe(final.minute); // 67 in the fixture
    expect(card.minute).not.toBeNull();
    expect(card.score).toEqual(final.score); // running 1-0
    expect(card.isFinal).toBe(true); // structural flag preserved through the merge
  });

  it('#2b carries kickoff + venue from the real Match (no longer null-by-default)', () => {
    const final = oracle('wc2026-f-1', 'live');
    const card = koCard('wc2026-f-1');
    expect(card.kickoff).toBe(final.kickoff); // real ISO instant, not null
    expect(card.venue).toEqual(final.venue); // real venue, not {name:null,city:null}
    expect(card.venue.name).not.toBeNull();
  });

  it('merges a real-but-scheduled match: real kickoff/venue, status stays scheduled', () => {
    // EDGE CASE the bug masked: wc2026-3p-1 HAS a backing Match that is genuinely
    // `scheduled` (so status/score look like the old hardcoded default) yet still
    // carries a REAL kickoff + venue. The fix must merge those live fields, NOT
    // collapse to the no-match fallback — distinguishing "scheduled match" from
    // "no match at all" (the next test).
    const tp = oracle('wc2026-3p-1', 'scheduled');
    expect(tp.kickoff, 'fixture invariant: third-place has a real kickoff').not.toBeNull();
    expect(tp.venue.name, 'fixture invariant: third-place has a real venue').not.toBeNull();
    const card = koCard('wc2026-3p-1');
    expect(card.status).toBe('scheduled');
    expect(card.score).toEqual(EMPTY_SCORE); // scheduled → empty score, from the real Match
    expect(card.kickoff).toBe(tp.kickoff); // real kickoff merged, NOT null
    expect(card.venue).toEqual(tp.venue); // real venue merged, NOT {null,null}
    expect(card.isThirdPlace).toBe(true); // structural flag preserved
  });

  it('#3 a KO node with NO backing match yields the safe fallback and does not throw', () => {
    // Build a tournament whose `matches` lacks ONE bracket match so that real
    // bracket node resolves to `undefined` (a truly unscheduled slot). Immutable
    // clone — never mutate the shared fixture, never re-parse.
    const dropped = 'wc2026-sf-1';
    const trimmed: Tournament = {
      ...tournament,
      matches: tournament.matches.filter((m) => m.id !== dropped),
    };
    let g: RoadmapGraph | undefined;
    expect(() => {
      g = buildRoadmapGraph(trimmed, 'UTC');
    }, 'an unscheduled KO slot must not throw').not.toThrow();

    const card = koCard(dropped, g!);
    expect(card.status).toBe('scheduled');
    expect(card.score).toEqual(EMPTY_SCORE);
    expect(card.kickoff).toBeNull();
    expect(card.minute).toBeNull();
    expect(card.venue).toEqual({ name: null, city: null });

    // The removal is SURGICAL: a sibling KO node still backed by a real Match
    // keeps its real state, proving the fallback is per-slot, not graph-wide.
    const survivingFinal = koCard('wc2026-f-1', g!);
    expect(survivingFinal.status).toBe('live');
  });

  it('#4 KO cards reflect real state, not the buggy graph-wide scheduled/EMPTY default', () => {
    // Regression guard: the OLD behaviour stamped EVERY KO card scheduled/EMPTY.
    // After the fix the finished R32-SF set + the live Final must surface real
    // state — assert concrete counts so a partial merge can't pass vacuously.
    const cards = [...koCardsById(graph()).values()];
    expect(cards).toHaveLength(bracketNodes.length);
    const finished = cards.filter((d) => d.status === 'finished');
    const liveCards = cards.filter((d) => d.status === 'live');
    expect(finished.length, 'finished KO cards must surface from real matches').toBeGreaterThan(0);
    expect(liveCards, 'exactly the one live Final card').toHaveLength(1);
    // Group cards remain governed by their own per-match status (the "match
    // payload" block keeps that green); this block only governs KO cards.
  });

  it('AF-6 a live THIRD_PLACE KO card surfaces status:live + its real minute and score', () => {
    // build-graph.test.ts only asserted live state on the FINAL. The CR-1 merge
    // already covers a live THIRD_PLACE node too — lock it with a test. The mock
    // fixture leaves wc2026-3p-1 scheduled, so build a live state via an IMMUTABLE
    // clone overriding ONLY that match (never mutate the shared fixture), then
    // assert the third-place card reflects it: status:'live', the real minute and
    // running score, with the isThirdPlace flag preserved and isFinal still false.
    const liveThirdPlace: Tournament = {
      ...tournament,
      matches: tournament.matches.map((m) =>
        m.id === 'wc2026-3p-1'
          ? { ...m, status: 'live', minute: 58, score: { ...m.score, home: 1, away: 0 } }
          : m,
      ),
    };
    // Fixture invariant: the override targeted an existing third-place match.
    expect(liveThirdPlace.matches.some((m) => m.id === 'wc2026-3p-1')).toBe(true);

    const g = buildRoadmapGraph(liveThirdPlace, 'UTC');
    const card = koCard('wc2026-3p-1', g);
    expect(card.status).toBe('live');
    expect(card.minute).toBe(58);
    expect(card.minute).not.toBeNull();
    expect(card.score.home).toBe(1);
    expect(card.score.away).toBe(0);
    expect(card.score).not.toEqual(EMPTY_SCORE);
    // Structural flags survive the live merge and stay mutually exclusive.
    expect(card.isThirdPlace).toBe(true);
    expect(card.isFinal).toBe(false);
  });

  it('#1 immutable merge: leaves the source tournament and its Match objects untouched', () => {
    // Build against a deeply-frozen tournament: any in-place mutation of `node`
    // or a `Match` during the merge would throw under the freeze.
    const frozen = deepFreeze(loadTournament());
    expect(() => buildRoadmapGraph(frozen, 'UTC')).not.toThrow();
    // And the live Match the graph read from is byte-for-byte unchanged after.
    const before = oracle('wc2026-f-1', 'live');
    const snapshot = structuredClone(before);
    buildRoadmapGraph(tournament, 'UTC');
    expect(liveMatches.get('wc2026-f-1')).toEqual(snapshot);
  });
});
