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
// built graph, never invented. Under the official WC2026 R32 seeding the mock
// resolves team-ARG into FIVE knockout matches (R32 #7 -> R16 #4 -> QF #2 ->
// SF #1 -> Final) and leaves another team's KO slots as placeholders, so both the
// resolved-include and placeholder-exclude branches are exercised.
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
// team-ARG: 3 group matches + 5 RESOLVED knockout matches. Under the OFFICIAL
// WC2026 Round-of-32 seeding (seeding.ts `R32_SEEDING`), group-A winner `1A`
// enters R32 slot 7 (`wc2026-r32-7`), and the deterministic mock advances ARG all
// the way to the Final: R32 #7 -> R16 #4 -> QF #2 -> SF #1 -> F #1. The mock fully
// resolves the bracket, so ARG's path is concrete (not placeholders); teams in
// OTHER halves fill the KO slots ARG never reaches — those are the "resolved but
// unrelated" matches the exclusion tests use.
//
// This list is a DELIBERATELY HARDCODED independent expectation (in stage order)
// so the expectation cannot silently drift: it cross-checks against the test's own
// `oracleMatchIds(ARG)` / `selectTeamFocus` output, which derive from the loaded
// tournament. It is NOT itself derived from the tournament — keep it a literal.
const ARG = 'team-ARG';
const ARG_GROUP = ['wc2026-gA-1-1', 'wc2026-gA-2-1', 'wc2026-gA-3-1'];
const ARG_KO = ['wc2026-r32-7', 'wc2026-r16-4', 'wc2026-qf-2', 'wc2026-sf-1', 'wc2026-f-1'];
/** ARG's full match set (group + resolved KO) — the focus target, fixture-derived. */
const ARG_MATCHES = new Set([...ARG_GROUP, ...ARG_KO]);

/**
 * Single oracle for the edge ids on a team's path, reconstructed from the REAL
 * graph (never hardcoded): the group's feeder edges, every advance edge whose
 * BOTH endpoints are in the team's match set, PLUS the team's OWN membership
 * edges (`member-<group>-<matchId>` for each of its in-group matches — M3 scope:
 * the team's links, not its whole group's). Reused by every edge assertion + the
 * `applyTeamFocus` fixture so the selector and the stamper are checked against one
 * source of truth, in lockstep with build-graph's edge-id grammar.
 */
function oracleEdgeIds(g: RoadmapGraph, group: string, matchSet: ReadonlySet<string>): string[] {
  return g.edges
    .filter(
      (e) =>
        e.id.startsWith(`feed-${group}-`) ||
        (e.id.startsWith('adv-') && matchSet.has(e.source) && matchSet.has(e.target)) ||
        // Membership edge id grammar: member-<group>-<matchId>. On the team's
        // path only when its TARGET match is one the team itself plays (M3).
        (e.id.startsWith(`member-${group}-`) && matchSet.has(e.target)),
    )
    .map((e) => e.id);
}

/** ARG's OWN membership edge ids (member-A-<each ARG group match>) — its links. */
const ownMemberIds = ARG_GROUP.map((id) => `member-A-${id}`);

/**
 * A group-A membership edge whose target is a group-A match ARG does NOT play
 * (the "same group, other team" case — must DIM under M3). Single source of
 * truth so the selector and stamper tests agree; fails loud if the fixture drops
 * it rather than passing vacuously.
 */
function sameGroupOtherMemberEdge(g: RoadmapGraph) {
  const edge = g.edges.find((e) => e.id.startsWith('member-A-') && !ARG_MATCHES.has(e.target));
  expect(edge, 'fixture: a non-ARG group-A member edge must exist').toBeDefined();
  return edge!;
}

/** An unrelated group's membership edge (member-B-*) — must DIM under M3. */
function unrelatedGroupMemberEdge(g: RoadmapGraph) {
  const edge = g.edges.find((e) => e.id.startsWith('member-B-'));
  expect(edge, 'fixture: a group-B member edge must exist').toBeDefined();
  return edge!;
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
    expect(expectedAdvance.length).toBeGreaterThan(0); // guard: adv-r32-7 -> r16-4 ... -> f-1

    expect(new Set(focus.edgeIds)).toEqual(new Set(expected)); // EXACTLY this set
  });

  it('excludes advance edges that touch the team set on only ONE end', () => {
    // An advance edge feeding ARG's r16-4 from a NON-ARG r32 slot shares only the
    // r16-4 endpoint with ARG's set; with a "both endpoints focused" rule it (and
    // any other one-sided advance edge) must not be highlighted.
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

describe("selectTeamFocus — membership edges follow the team's OWN matches [M3 / Acceptance #9]", () => {
  it("includes the team's OWN member edges (member-A-<each ARG group match>)", () => {
    const focus = selectTeamFocus(tournament, ARG);
    // ARG plays 3 group-A matches; its membership links are exactly those three.
    expect(ownMemberIds.length).toBe(3); // guard: not vacuous
    for (const id of ownMemberIds) {
      // The id must be a real edge in the graph AND in the focus set.
      expect(
        graph.edges.some((e) => e.id === id),
        `graph has ${id}`,
      ).toBe(true);
      expect(focus.edgeIds.has(id), `focus includes own member edge ${id}`).toBe(true);
    }
  });

  it('EXCLUDES a same-group-but-other-team member edge (its links, not its group)', () => {
    const focus = selectTeamFocus(tournament, ARG);
    expect(focus.edgeIds.has(sameGroupOtherMemberEdge(graph).id)).toBe(false);
  });

  it('EXCLUDES an unrelated group member edge (member-B-*)', () => {
    const focus = selectTeamFocus(tournament, ARG);
    expect(focus.edgeIds.has(unrelatedGroupMemberEdge(graph).id)).toBe(false);
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

  it("stamps 'on' on the team's OWN member edges and 'dim' on the rest [M3 / Acceptance #10]", () => {
    const { edges } = applyTeamFocus(graph.nodes, graph.edges, focus);
    const byId = new Map(edges.map((e) => [e.id, e]));
    // ARG's own membership links light up.
    for (const id of ownMemberIds) {
      expect(byId.get(id)?.data?.focusState, `own member ${id} is on`).toBe('on');
    }
    // A same-group-other-team member edge dims (not in the focus set), and so
    // does an unrelated group's member edge — pinning the "its links, not its
    // group's links" scope (shared oracle with the selector tests).
    expect(byId.get(sameGroupOtherMemberEdge(graph).id)?.data?.focusState).toBe('dim');
    expect(byId.get(unrelatedGroupMemberEdge(graph).id)?.data?.focusState).toBe('dim');
  });

  it('a stamped member edge KEEPS its group and never gains a state field [M2 / Acceptance #10]', () => {
    const { edges } = applyTeamFocus(graph.nodes, graph.edges, focus);
    const memberEdges = edges.filter((e) => e.id.startsWith('member-'));
    expect(memberEdges.length).toBeGreaterThan(0); // guard: not vacuous
    for (const e of memberEdges) {
      const data = e.data as { group?: string; state?: unknown; focusState?: unknown };
      // group survives the immutable stamp (mirrors the id's group letter).
      const expectedGroup = e.id.match(/^member-([A-Z])-/)?.[1];
      expect(data.group, `member ${e.id} keeps its group`).toBe(expectedGroup);
      // The stamper must NOT inject an advance `state` onto a member edge (M2:
      // member data is always present, so the `{ state:'undecided' }` default
      // branch never fires).
      expect('state' in data, `member ${e.id} gains no state field`).toBe(false);
      // It still carries a focus mark ('on' or 'dim') from the stamp.
      expect(data.focusState === 'on' || data.focusState === 'dim').toBe(true);
    }
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
