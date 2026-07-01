// Unit spec for `buildMatrixGraph(tournament)` — the matrix "journey-lanes" node/
// edge SET (requirement 2026-07-01-1030; plan Test Strategy 1-7 / Acceptance #3,
// #4, #5, #8).
//
// The matrix graph is a WHOLE-TOURNAMENT subway map: one `matrix-match` STATION
// node per match across GROUP_STAGE + every KO round (group 72 + R32 16 + R16 8 +
// QF 4 + SF 2 + THIRD_PLACE 1 + FINAL 1 = 104), positioned in chronological stage
// COLUMNS (monotonic x), plus per-team `matrix-lane` edges that chain each team's
// matches in KICKOFF order — a loser's lane terminates (no edge leaving its last
// match); the champion's lane reaches the FINAL.
//
// Every count/id/order is FIXTURE-DERIVED from the validated mock tournament + the
// real built graph, never hardcoded. The graph is rebuilt INSIDE each test so an
// unimplemented builder fails each assertion individually on MISSING LOGIC (empty
// graph → 0 vs 104, no lane edges), NOT on a typo/import error.
import { describe, expect, it } from 'vitest';
import { buildMatrixGraph } from './build-matrix-graph';
import { laneEdgeId } from './matrix-lane';
import {
  MATRIX_STAGE_ORDER,
  aFinalist,
  aFinalistSemiFinalMatch,
  aGroupNonQualifier,
  anR32Loser,
  expectedStationCount,
  finalMatch,
  stageMatchCounts,
  teamIdsWithMatches,
  teamMatchesInOrder,
  tournamentWithPlaceholderSide,
  twoDistinctTeamIds,
} from './__test-support__/matrix-fixtures';
import { deepFreeze, loadTournament } from './__test-support__/roadmap-fixtures';
import type {
  MatrixLaneEdgeData,
  MatrixMatchFlowNode,
  RoadmapEdge,
  RoadmapGraph,
  RoadmapNode,
} from './graph-model';
import type { Stage } from '@/domain/types';

const tournament = loadTournament();
const graph = (): RoadmapGraph => buildMatrixGraph(tournament);

const isStation = (n: RoadmapNode): n is MatrixMatchFlowNode => n.type === 'matrix-match';
const isLane = (e: RoadmapEdge): e is RoadmapEdge & { data: MatrixLaneEdgeData } =>
  e.type === 'matrix-lane';

const stations = (): MatrixMatchFlowNode[] => graph().nodes.filter(isStation);
const laneEdges = (): Array<RoadmapEdge & { data: MatrixLaneEdgeData }> =>
  graph().edges.filter(isLane);

/** The lane edges belonging to one team, keyed by their `data.teamId`. */
function lanesOf(teamId: string): Array<RoadmapEdge & { data: MatrixLaneEdgeData }> {
  return laneEdges().filter((e) => e.data.teamId === teamId);
}

describe('buildMatrixGraph — one station per match [Test 1 / Acceptance #3]', () => {
  it('emits exactly one matrix-match station per match (104 total, fixture-derived)', () => {
    const built = stations();
    // Oracle is the mock's own match count — never a hardcoded literal. RED: the
    // stub returns an empty graph → 0 stations.
    expect(built).toHaveLength(expectedStationCount(tournament));
    expect(built.length).toBe(104);
  });

  it('emits one station per stage matching the fixture per-stage counts', () => {
    const counts = stageMatchCounts(tournament); // {GROUP_STAGE:72, R32:16, ...}
    const byStage = new Map<Stage, number>();
    for (const n of stations()) byStage.set(n.data.stage, (byStage.get(n.data.stage) ?? 0) + 1);
    for (const stage of Object.keys(counts) as Stage[]) {
      expect(byStage.get(stage) ?? 0, `station count for ${stage}`).toBe(counts[stage]);
    }
  });

  it('gives every station a node id equal to its matchId (one per real match)', () => {
    const built = stations();
    const ids = new Set(built.map((n) => n.id));
    // No duplicate stations, and each id is a real tournament match id.
    expect(ids.size).toBe(built.length);
    const matchIds = new Set(tournament.matches.map((m) => m.id));
    for (const n of built) {
      expect(n.id, `station id ${n.id} must be a real matchId`).toBe(n.data.matchId);
      expect(matchIds.has(n.id)).toBe(true);
    }
  });
});

describe('buildMatrixGraph — chronological stage columns [Test 2 / Acceptance #3]', () => {
  /** The distinct x of every station, in the stage's column order (using the
   *  fixture's MATRIX_STAGE_ORDER: MD1<MD2<MD3<R32<R16<QF<SF<{3rd,Final}). */
  it('assigns each station an x that increases monotonically by stage chronology', () => {
    const byId = new Map(stations().map((n) => [n.id, n.position.x]));
    // A stage → representative column x. Group stations share a column PER matchday,
    // so we assert the WEAKER (but sufficient) property the requirement fixes:
    // GROUP < R32 < R16 < QF < SF < FINAL are strictly increasing bands.
    const xOfStage = (stage: Stage): number => {
      const n = stations().find((s) => s.data.stage === stage);
      expect(n, `at least one ${stage} station`).toBeDefined();
      return byId.get(n!.id)!;
    };
    const groupX = xOfStage('GROUP_STAGE');
    const r32X = xOfStage('ROUND_OF_32');
    const r16X = xOfStage('ROUND_OF_16');
    const qfX = xOfStage('QUARTER_FINALS');
    const sfX = xOfStage('SEMI_FINALS');
    const finalX = xOfStage('FINAL');
    // Strictly increasing left→right by stage chronology (RED: no stations at all).
    expect(groupX).toBeLessThan(r32X);
    expect(r32X).toBeLessThan(r16X);
    expect(r16X).toBeLessThan(qfX);
    expect(qfX).toBeLessThan(sfX);
    expect(sfX).toBeLessThan(finalX);
  });

  it('places the three group matchdays in strictly increasing x columns (MD1<MD2<MD3)', () => {
    const xForMatchday = (md: number): number => {
      const n = stations().find((s) => s.data.stage === 'GROUP_STAGE' && s.data.matchday === md);
      expect(n, `a GROUP_STAGE station on matchday ${md}`).toBeDefined();
      return n!.position.x;
    };
    expect(xForMatchday(1)).toBeLessThan(xForMatchday(2));
    expect(xForMatchday(2)).toBeLessThan(xForMatchday(3));
  });

  it('gives all stations of one group matchday the same column x', () => {
    const md1 = stations().filter((s) => s.data.stage === 'GROUP_STAGE' && s.data.matchday === 1);
    expect(md1.length, 'MD1 stations present').toBe(24);
    const xs = new Set(md1.map((s) => s.position.x));
    expect(xs.size, 'all MD1 stations share one column x').toBe(1);
  });

  it('stacks THIRD_PLACE and FINAL in the same final-band column (shared x)', () => {
    const finalN = stations().find((s) => s.data.stage === 'FINAL');
    const thirdN = stations().find((s) => s.data.stage === 'THIRD_PLACE');
    expect(finalN, 'a FINAL station').toBeDefined();
    expect(thirdN, 'a THIRD_PLACE station').toBeDefined();
    expect(thirdN!.position.x).toBe(finalN!.position.x);
    // ...at distinct slots (distinct y) so they don't overlap.
    expect(thirdN!.position.y).not.toBe(finalN!.position.y);
  });

  it('covers the full 8-stage chronological order the fixture prescribes', () => {
    // Documents the intended left→right band order; RED because no stations exist.
    const distinctStages = new Set(stations().map((s) => s.data.stage));
    for (const stage of new Set(MATRIX_STAGE_ORDER)) {
      expect(distinctStages.has(stage), `a station for ${stage}`).toBe(true);
    }
  });
});

describe('buildMatrixGraph — per-team lane ordering [Test 3 / Acceptance #4]', () => {
  it('chains a finalist team’s lane edges through its matches in kickoff order', () => {
    const finalist = aFinalist(tournament);
    const expectedSeq = teamMatchesInOrder(tournament, finalist).map((m) => m.id);
    // A finalist plays multiple matches, so there is at least one lane hop to chain.
    expect(expectedSeq.length).toBeGreaterThan(1);

    const edges = lanesOf(finalist);
    // One edge per consecutive-match hop → (n-1) edges for n matches. RED: 0 edges.
    expect(edges).toHaveLength(expectedSeq.length - 1);

    // Reconstruct the chain: each hop connects mi → mi+1 with the canonical id.
    for (let i = 0; i < expectedSeq.length - 1; i += 1) {
      const src = expectedSeq[i];
      const dst = expectedSeq[i + 1];
      const hop = edges.find((e) => e.source === src && e.target === dst);
      expect(hop, `lane hop ${src} → ${dst} for ${finalist}`).toBeDefined();
      expect(hop!.id).toBe(laneEdgeId(finalist, src, dst));
    }
  });

  it('links only CONSECUTIVE matches (no skip-ahead edges) for every team', () => {
    for (const teamId of teamIdsWithMatches(tournament)) {
      const seq = teamMatchesInOrder(tournament, teamId).map((m) => m.id);
      const allowed = new Set<string>();
      for (let i = 0; i < seq.length - 1; i += 1) allowed.add(`${seq[i]}->${seq[i + 1]}`);
      for (const e of lanesOf(teamId)) {
        expect(
          allowed.has(`${e.source}->${e.target}`),
          `lane edge ${e.source}->${e.target} for ${teamId} must be a consecutive hop`,
        ).toBe(true);
      }
    }
  });

  it('emits exactly one lane edge per consecutive hop, summed across every team', () => {
    // Global oracle: total lane edges == Σ (matchesOf(team) − 1) over all lane
    // owners — one hop per consecutive-match pair, no more, no fewer. Fixture-derived
    // from the mock's own per-team journeys. RED: 0 edges vs the expected total.
    const expectedHops = teamIdsWithMatches(tournament).reduce((sum, teamId) => {
      const played = teamMatchesInOrder(tournament, teamId).length;
      return sum + Math.max(0, played - 1);
    }, 0);
    expect(expectedHops, 'the fixture implies at least one lane hop').toBeGreaterThan(0);
    expect(laneEdges()).toHaveLength(expectedHops);
  });

  it('emits a lane edge with a stable per-team color on its data', () => {
    const finalist = aFinalist(tournament);
    const edges = lanesOf(finalist);
    expect(edges.length).toBeGreaterThan(0);
    // Every one of a team's lane edges shares ONE color (the team's hue).
    const colors = new Set(edges.map((e) => e.data.color));
    expect(colors.size, 'a team’s whole lane is one color').toBe(1);
    const [color] = colors;
    expect(color, 'the lane carries a non-empty color string').toBeTruthy();
    expect(typeof color).toBe('string');
  });
});

describe('buildMatrixGraph — elimination terminates the lane [Test 4 / Acceptance #4]', () => {
  it('a group non-qualifier’s lane ends AT its MD3 match with no edge leaving it', () => {
    const nonQual = aGroupNonQualifier(tournament);
    const seq = teamMatchesInOrder(tournament, nonQual);
    expect(seq, 'the non-qualifier plays 3 group matches').toHaveLength(3);
    const lastMatchId = seq[seq.length - 1].id;
    const edges = lanesOf(nonQual);

    // The lane "bends off and ends" — NO forward edge leaves the last (MD3) match.
    expect(
      edges.filter((e) => e.source === lastMatchId),
      'no lane edge leaves an eliminated team’s last match',
    ).toHaveLength(0);

    // ...and its lane spans exactly its 2 group→group hops (MD1→MD2→MD3): the
    // FINAL hop must TARGET the MD3 match (the lane arrives at, and stops on, MD3).
    expect(edges, 'MD1→MD2→MD3 is exactly two hops').toHaveLength(2);
    const intoLast = edges.filter((e) => e.target === lastMatchId);
    expect(intoLast, 'the last lane hop targets the MD3 (final) station').toHaveLength(1);
    expect(intoLast[0].source, 'the last hop arrives from MD2').toBe(seq[seq.length - 2].id);
  });

  it('an R32 loser has NO lane edge leaving its R32 (last) match', () => {
    const loser = anR32Loser(tournament);
    const seq = teamMatchesInOrder(tournament, loser);
    const last = seq[seq.length - 1];
    expect(last.stage, 'the R32 loser’s last match is its R32 game').toBe('ROUND_OF_32');
    const outgoing = lanesOf(loser).filter((e) => e.source === last.id);
    expect(outgoing, 'the R32 loser’s lane terminates at its R32 match').toHaveLength(0);
    // 4 matches (3 group + 1 R32) → exactly 3 lane hops, none leaving the last.
    expect(lanesOf(loser)).toHaveLength(seq.length - 1);
  });

  it('has at least one eliminated team (non-vacuous elimination coverage)', () => {
    // Guards against the elimination tests passing on an empty graph forever: the
    // fixture MUST contain a real eliminated team whose lane terminates.
    expect(() => aGroupNonQualifier(tournament)).not.toThrow();
    expect(() => anR32Loser(tournament)).not.toThrow();
  });
});

describe('buildMatrixGraph — champion lane reaches the Final [Test 5 / Acceptance #4]', () => {
  it('a finalist’s penultimate hop goes from its SF match INTO the Final station', () => {
    const finalist = aFinalist(tournament);
    const finalId = finalMatch(tournament).id;
    const sfId = aFinalistSemiFinalMatch(tournament).id;
    const intoFinal = lanesOf(finalist).filter((e) => e.target === finalId);
    // The finalist's lane REACHES the Final station specifically — exactly one hop
    // arrives there, and it comes from that finalist's OWN semi-final match (the
    // true penultimate station), not from any incidental earlier station. RED: 0 edges.
    expect(intoFinal, `a finalist’s lane must reach the Final ${finalId}`).toHaveLength(1);
    expect(intoFinal[0].data.teamId).toBe(finalist);
    expect(intoFinal[0].source, 'the SF→Final hop leaves the finalist’s SF station').toBe(sfId);
    expect(intoFinal[0].id).toBe(laneEdgeId(finalist, sfId, finalId));
  });
});

describe('buildMatrixGraph — resolved-only lanes / data source [Test 6 / Acceptance #4]', () => {
  it('never emits a lane edge that is not attributed to a resolved team', () => {
    // Every lane edge carries a resolved teamId that actually plays ≥1 match — no
    // phantom lanes from placeholder sides.
    const owners = new Set(teamIdsWithMatches(tournament));
    for (const e of laneEdges()) {
      expect(owners.has(e.data.teamId), `lane teamId ${e.data.teamId} plays a match`).toBe(true);
    }
  });

  it('emits ZERO stations when the tournament has no matches (stations read tournament.matches)', () => {
    // Documents the station data source: matrix stations come from `tournament.matches`,
    // so emptying matches yields no stations (and thus no lanes). RED-safe: the stub
    // already returns empty, but GREEN must keep this invariant.
    const empty = buildMatrixGraph({ ...tournament, matches: [] });
    expect(empty.nodes.filter(isStation)).toHaveLength(0);
    expect(empty.edges.filter(isLane)).toHaveLength(0);
  });

  it('renders a station for a placeholder-side match but attributes NO lane to the placeholder', () => {
    // A single scheduled match with a RESOLVED home vs a PLACEHOLDER away: the
    // station still renders (from tournament.matches), but only the resolved side
    // ever owns a lane — and a single match has no forward hop, so NO lane edge at all.
    const built = buildMatrixGraph(tournamentWithPlaceholderSide(tournament));
    expect(
      built.nodes.filter(isStation),
      'the placeholder match still gets a station',
    ).toHaveLength(1);
    // No consecutive hop exists for a one-match journey → no lane edge, and none can
    // be attributed to the (label-only) placeholder side.
    expect(
      built.edges.filter(isLane),
      'a lone placeholder-side match yields no lane edge',
    ).toHaveLength(0);
  });
});

describe('buildMatrixGraph — immutable + deterministic [Test 7 / Acceptance #8]', () => {
  it('does not mutate a deep-frozen input tournament', () => {
    const frozen = deepFreeze(loadTournament());
    // Purity by construction: a builder that writes to its input throws on frozen.
    expect(() => buildMatrixGraph(frozen)).not.toThrow();
  });

  it('produces identical node + edge id sets across two builds (deterministic)', () => {
    const a = buildMatrixGraph(tournament);
    const b = buildMatrixGraph(tournament);
    expect(a.nodes.map((n) => n.id).sort()).toEqual(b.nodes.map((n) => n.id).sort());
    expect(a.edges.map((e) => e.id).sort()).toEqual(b.edges.map((e) => e.id).sort());
  });

  it('produces identical per-team lane colors across two builds (stable hues)', () => {
    const finalist = aFinalist(tournament);
    const colorFrom = (g: RoadmapGraph): string | undefined =>
      g.edges.filter(isLane).find((e) => e.data.teamId === finalist)?.data.color;
    const a = colorFrom(buildMatrixGraph(tournament));
    const b = colorFrom(buildMatrixGraph(tournament));
    // The same team's hue is stable across builds (RED: both undefined → this
    // assertion is skipped by the earlier finalist-edge test which fails first,
    // but once GREEN both must be equal AND defined).
    expect(a).toBe(b);
    expect(a, 'the finalist has a defined stable lane color').toBeTruthy();
  });

  it('gives two DISTINCT teams distinct lane colors in the SAME build (traceability)', () => {
    const [x, y] = twoDistinctTeamIds(tournament);
    const built = buildMatrixGraph(tournament);
    const laneColor = (teamId: string): string | undefined =>
      built.edges.filter(isLane).find((e) => e.data.teamId === teamId)?.data.color;
    const colorX = laneColor(x);
    const colorY = laneColor(y);
    // Both teams have a lane (finalist + a group non-qualifier both play ≥2 matches),
    // and their colors must differ so the two lanes are visually distinguishable.
    expect(colorX, 'team x has a lane color').toBeTruthy();
    expect(colorY, 'team y has a lane color').toBeTruthy();
    expect(colorX).not.toBe(colorY);
  });
});
