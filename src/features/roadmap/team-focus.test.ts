// Unit spec for the PURE team-focus selector + immutable display stamper
// (requirement item 3; plan Test Strategy 9-12 / Acceptance #5, #7).
//
// `selectTeamFocus(tournament, teamId)` maps a team to:
//   - matchNodeIds: every group match it plays (home/away) PLUS every knockout
//     match whose RESOLVED home/away is that team. An unresolved KO placeholder
//     slot for that seed is NOT included ("resolved" per spec).
//   - edgeIds: feeder edges for its group + advance edges connecting two focused
//     KO matches, reconstructed from the build-graph edge-id grammar so the
//     selector and builder agree (and the ids are a subset of the real graph's).
//
// `applyTeamFocus(nodes, edges, focus)` returns immutable display copies stamping
// `focusState:'on'` on focused nodes/edges and `'dim'` on the rest; null focus
// returns input unchanged; never mutates the (frozen) input graph — proving the
// "no relayout, positions untouched" contract at the data level (Acceptance #7).
//
// Counts/ids are fixture-DERIVED from the validated mock tournament + the real
// built graph, never invented. The mock resolves team-ARG into TWO knockout
// matches (R32 #1, R16 #1) and leaves another team's KO slots as placeholders,
// so both the resolved-include and placeholder-exclude branches are exercised.
//
// RED until team-focus.ts is implemented (today its functions throw
// "not implemented"), so each assertion fails for the right (missing-logic) reason.
import { describe, expect, it } from 'vitest';
import { teamRef, placeholderRef } from '@/domain/types';
import type { Match } from '@/domain/types';
import {
  applyTeamFocus,
  matchInvolvesTeam,
  selectTeamFocus,
  teamIdOfRef,
  type TeamFocus,
} from './team-focus';
import { buildRoadmapGraph } from './build-graph';
import type { MatchFlowNode, RoadmapEdge, RoadmapGraph, RoadmapNode } from './graph-model';
import { deepFreeze, loadTournament } from './__test-support__/roadmap-fixtures';

const tournament = loadTournament();
const graph = buildRoadmapGraph(tournament, 'UTC');

/** Resolved-team check independent of the production code under test. */
function isTeam(ref: Match['home'], id: string): boolean {
  return ref.kind === 'team' && ref.team.id === id;
}

/** Independent oracle: the match ids a team plays in (group + resolved KO). */
function oracleMatchIds(teamId: string): Set<string> {
  return new Set(
    tournament.matches
      .filter((m) => isTeam(m.home, teamId) || isTeam(m.away, teamId))
      .map((m) => m.id),
  );
}

// --- Fixture-known focus targets (asserted, not assumed) --------------------
// team-ARG: 3 group matches + 2 RESOLVED knockout matches (R32 #1 -> R16 #1).
// The mock fully resolves the bracket, so ARG's path is concrete (not placeholders);
// teams in OTHER halves fill the KO slots ARG never reaches — those are the
// "resolved but unrelated" matches the exclusion tests use.
const ARG = 'team-ARG';
const ARG_GROUP = ['wc2026-gA-1-1', 'wc2026-gA-2-1', 'wc2026-gA-3-1'];
const ARG_KO = ['wc2026-r32-1', 'wc2026-r16-1'];
/** ARG's full match set (group + resolved KO) — the focus target, fixture-derived. */
const ARG_MATCHES = new Set([...ARG_GROUP, ...ARG_KO]);

/**
 * Single oracle for the edge ids on a team's path, reconstructed from the REAL
 * graph (never hardcoded): the group's feeder edges PLUS every advance edge whose
 * BOTH endpoints are in the team's match set. Reused by every edge assertion + the
 * `applyTeamFocus` fixture so the selector and the stamper are checked against one
 * source of truth, in lockstep with build-graph's edge-id grammar.
 */
function oracleEdgeIds(g: RoadmapGraph, group: string, matchSet: ReadonlySet<string>): string[] {
  return g.edges
    .filter(
      (e) =>
        e.id.startsWith(`feed-${group}-`) ||
        (e.id.startsWith('adv-') && matchSet.has(e.source) && matchSet.has(e.target)),
    )
    .map((e) => e.id);
}

describe('teamIdOfRef', () => {
  it("returns the id for a kind:'team' ref", () => {
    const ref = teamRef({ id: 'team-arg', name: 'Argentina', code: 'ARG', flagUrl: null });
    expect(teamIdOfRef(ref)).toBe('team-arg');
  });

  it("returns null for a kind:'placeholder' ref (an unresolved slot)", () => {
    expect(teamIdOfRef(placeholderRef('Winner M49'))).toBeNull();
    expect(teamIdOfRef(placeholderRef('1A'))).toBeNull();
  });
});

describe('matchInvolvesTeam', () => {
  it('is true when the team is the resolved home or away', () => {
    const m = tournament.matches.find((x) => x.id === ARG_GROUP[0])!;
    expect(matchInvolvesTeam(m, ARG)).toBe(true);
  });

  it('is false for a match the team does not play', () => {
    // A different group's match never involves ARG.
    const other = tournament.matches.find((m) => m.stage === 'GROUP_STAGE' && m.group === 'B')!;
    expect(matchInvolvesTeam(other, ARG)).toBe(false);
  });

  it('is false for an UNRESOLVED placeholder slot (never a resolved match)', () => {
    // The mock fully resolves the bracket, so we construct an explicitly
    // unresolved KO match (both ends placeholders bearing ARG's seed labels) to
    // prove a placeholder slot does NOT "involve" any team — non-vacuously, unlike
    // a conditional skip that silently passes when no placeholder exists.
    const koMatch = tournament.matches.find((m) => m.stage !== 'GROUP_STAGE')!;
    const placeholderKo: Match = {
      ...koMatch,
      home: placeholderRef('1A'), // ARG's group-A winner seed, still unresolved
      away: placeholderRef('2B'),
    };
    expect(placeholderKo.home.kind).toBe('placeholder'); // construction self-check
    expect(matchInvolvesTeam(placeholderKo, ARG)).toBe(false);
  });

  it('is false for a RESOLVED match between two OTHER teams', () => {
    // A concrete KO match ARG never reaches (both ends resolved to other teams)
    // must not involve ARG — the resolved-but-unrelated branch.
    const unrelated = tournament.matches.find(
      (m) =>
        m.stage !== 'GROUP_STAGE' &&
        m.home.kind === 'team' &&
        m.away.kind === 'team' &&
        !isTeam(m.home, ARG) &&
        !isTeam(m.away, ARG),
    )!;
    expect(unrelated, 'fixture invariant: a resolved unrelated KO match exists').toBeDefined();
    expect(matchInvolvesTeam(unrelated, ARG)).toBe(false);
  });
});

describe('selectTeamFocus — match-node ids [Acceptance #5]', () => {
  it('includes EXACTLY the group + resolved-knockout matches the team plays', () => {
    // Fixture self-checks so the expectation cannot silently drift.
    const oracle = oracleMatchIds(ARG);
    expect([...oracle].sort()).toEqual([...ARG_GROUP, ...ARG_KO].sort());

    const focus = selectTeamFocus(tournament, ARG);
    expect(new Set(focus.matchNodeIds)).toEqual(oracle);
    // The 3 group matches AND both resolved KO matches are present.
    for (const id of [...ARG_GROUP, ...ARG_KO]) expect(focus.matchNodeIds.has(id)).toBe(true);
  });

  it('excludes an unresolved KO placeholder slot for the team (resolved-only)', () => {
    // ARG's deeper bracket slots (QF/SF/Final) are placeholders in the mock until
    // its R16 resolves, so they must NOT appear in the focused match set.
    const focus = selectTeamFocus(tournament, ARG);
    const placeholderKoIds = tournament.matches
      .filter((m) => m.stage !== 'GROUP_STAGE' && !isTeam(m.home, ARG) && !isTeam(m.away, ARG))
      .map((m) => m.id);
    expect(placeholderKoIds.length).toBeGreaterThan(0); // guard: not vacuous
    for (const id of placeholderKoIds) expect(focus.matchNodeIds.has(id)).toBe(false);
  });

  it('every focused match-node id corresponds to a real match node in the graph', () => {
    const focus = selectTeamFocus(tournament, ARG);
    const matchNodeIds = new Set(graph.nodes.filter((n) => n.type === 'match').map((n) => n.id));
    expect(focus.matchNodeIds.size).toBeGreaterThan(0);
    for (const id of focus.matchNodeIds) expect(matchNodeIds.has(id)).toBe(true);
  });

  it('returns an EMPTY focus for an unknown team id (boundary, no throw)', () => {
    // A team id that plays no match (e.g. a stale ?team= value) must yield an empty
    // focus rather than throwing or matching everything — so the canvas dims nothing.
    let focus: TeamFocus | undefined;
    expect(() => {
      focus = selectTeamFocus(tournament, 'team-DOES-NOT-EXIST');
    }, 'an unknown team must not throw').not.toThrow();
    expect(focus!.teamId).toBe('team-DOES-NOT-EXIST');
    expect(focus!.matchNodeIds.size).toBe(0);
    expect(focus!.edgeIds.size).toBe(0);
  });
});

describe('selectTeamFocus — edge ids [Acceptance #5]', () => {
  it("includes the team's group feeder edges and the advance edge linking its two KO matches", () => {
    const focus = selectTeamFocus(tournament, ARG);
    // Derived from the REAL graph via the shared oracle (one source of truth):
    // feeders for group A + advance edges whose BOTH endpoints are ARG's KO matches.
    const expected = oracleEdgeIds(graph, 'A', ARG_MATCHES);
    const expectedFeeders = expected.filter((id) => id.startsWith('feed-'));
    const expectedAdvance = expected.filter((id) => id.startsWith('adv-'));
    expect(expectedFeeders.length).toBeGreaterThan(0); // guard
    expect(expectedAdvance.length).toBeGreaterThan(0); // guard: adv-r32-1 -> r16-1

    expect(new Set(focus.edgeIds)).toEqual(new Set(expected)); // EXACTLY this set
  });

  it('excludes advance edges that touch the team set on only ONE end', () => {
    // adv-<other-r32>-<r16-1> shares only the r16-1 endpoint with ARG's set, and
    // adv-<r16-1>-<qf-1> shares only r16-1; with a "both endpoints focused" rule
    // neither may be highlighted.
    const focus = selectTeamFocus(tournament, ARG);
    const oneSided = graph.edges.filter(
      (e) => e.id.startsWith('adv-') && ARG_MATCHES.has(e.source) !== ARG_MATCHES.has(e.target),
    );
    expect(oneSided.length).toBeGreaterThan(0); // guard: such an edge exists
    for (const e of oneSided) expect(focus.edgeIds.has(e.id)).toBe(false);
  });

  it("every focused edge id is a SUBSET of the real graph's edge ids (grammar in lockstep)", () => {
    const focus = selectTeamFocus(tournament, ARG);
    const realEdgeIds = new Set(graph.edges.map((e) => e.id));
    expect(focus.edgeIds.size).toBeGreaterThan(0);
    for (const id of focus.edgeIds) expect(realEdgeIds.has(id)).toBe(true);
  });
});

describe('applyTeamFocus — immutable stamping [Acceptance #5, #7]', () => {
  // Built from the SAME oracle the selector tests use, so the stamper is exercised
  // against the real graph's edge ids (no separate hand-maintained set to drift).
  const focus: TeamFocus = {
    teamId: ARG,
    matchNodeIds: ARG_MATCHES,
    edgeIds: new Set(oracleEdgeIds(graph, 'A', ARG_MATCHES)),
  };

  it("stamps focusState 'on' on focused match nodes and 'dim' on the rest", () => {
    const { nodes } = applyTeamFocus(graph.nodes, graph.edges, focus);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const id of [...ARG_GROUP, ...ARG_KO]) {
      const node = byId.get(id) as MatchFlowNode;
      expect(node.data.focusState).toBe('on');
    }
    // A match the team does not play is dimmed.
    const otherGroupMatch = graph.nodes.find(
      (n): n is MatchFlowNode => n.type === 'match' && !focus.matchNodeIds.has(n.id),
    )!;
    const dimmed = byId.get(otherGroupMatch.id) as MatchFlowNode;
    expect(dimmed.data.focusState).toBe('dim');
  });

  it("stamps focusState 'on' on focused edges and 'dim' on unrelated ones", () => {
    const { edges } = applyTeamFocus(graph.nodes, graph.edges, focus);
    const byId = new Map(edges.map((e) => [e.id, e]));
    for (const id of focus.edgeIds) {
      expect(byId.get(id)?.data?.focusState).toBe('on');
    }
    const unrelated = graph.edges.find((e) => !focus.edgeIds.has(e.id))!;
    expect(byId.get(unrelated.id)?.data?.focusState).toBe('dim');
  });

  it('leaves a group-standings node UN-dimmed (always-on reference, never recedes)', () => {
    // Plan CSS contract: the standings tables are an always-on reference and must
    // NOT dim with the rest of the board on focus. The stamper leaves their
    // focusState absent so they keep full opacity regardless of the focused team.
    const { nodes } = applyTeamFocus(graph.nodes, graph.edges, focus);
    const standings = nodes.filter((n) => n.type === 'group-standings');
    expect(standings.length).toBeGreaterThan(0); // guard: standings nodes exist
    for (const node of standings) {
      expect((node.data as { focusState?: unknown }).focusState).toBeUndefined();
    }
  });

  it('preserves the exact node set + positions (no relayout) when stamping focus', () => {
    const { nodes } = applyTeamFocus(graph.nodes, graph.edges, focus);
    // Same nodes, in the same order — focus never adds, drops, or reorders a node.
    expect(nodes.map((n) => n.id)).toEqual(graph.nodes.map((n) => n.id));
    const before = new Map(graph.nodes.map((n) => [n.id, n.position]));
    for (const n of nodes) {
      expect(n.position).toEqual(before.get(n.id));
    }
  });

  it('returns the input unchanged when focus is null (no stamping, structural pass-through)', () => {
    const { nodes, edges } = applyTeamFocus(graph.nodes, graph.edges, null);
    // Structural pass-through: same node/edge ids, none added or dropped.
    expect(nodes.map((n) => n.id)).toEqual(graph.nodes.map((n) => n.id));
    expect(edges.map((e) => e.id)).toEqual(graph.edges.map((e) => e.id));
    // ...and no focus mark anywhere (no dim, no on).
    for (const n of nodes) {
      if (n.type === 'match') expect((n as MatchFlowNode).data.focusState).toBeUndefined();
    }
    for (const e of edges) expect(e.data?.focusState).toBeUndefined();
  });

  it('does not mutate frozen input AND still returns correctly-stamped display copies', () => {
    const frozenNodes = graph.nodes.map((n) => deepFreeze({ ...n, data: { ...n.data } }));
    const frozenEdges = graph.edges.map((e) =>
      deepFreeze({ ...e, data: { ...(e.data ?? {}) } } as RoadmapEdge),
    );
    let out: { nodes: RoadmapNode[]; edges: RoadmapEdge[] } | undefined;
    // A stamper that mutated its input would throw under the freeze.
    expect(() => {
      out = applyTeamFocus(frozenNodes as RoadmapNode[], frozenEdges, focus);
    }).not.toThrow();
    // The returned COPIES carry the focus mark (proving the stamp went on a copy,
    // not the frozen original) — immutability and correctness together.
    const node = out!.nodes.find((n) => n.id === ARG_GROUP[0]) as MatchFlowNode;
    expect(node.data.focusState).toBe('on');
    // The frozen ORIGINAL stays unmarked — no in-place write leaked through.
    const original = frozenNodes.find((n) => n.id === ARG_GROUP[0]) as MatchFlowNode;
    expect(original.data.focusState).toBeUndefined();
  });
});
