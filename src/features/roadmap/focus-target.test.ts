// Unit spec for the PURE target-resolution function `pickFocusMatchId` (plan
// Test Strategy: "Unit — focus-target.test.ts"; Acceptance #1-#6). Node env
// (no DOM); fixtures are tiny hand-built `Match[]` and a FIXED `nowMs`, so the
// owner's "ended estimate time nearest in the future" rule is exercised with no
// clock dependency.
//
// RED until `pickFocusMatchId` is implemented — the stub throws "not implemented",
// so every behavioural assertion fails for the right (missing-logic) reason while
// the constant-shape tests already pass against the named constants.
import { describe, expect, it } from 'vitest';
import {
  FOCUS_DURATION_MS,
  FOCUS_ZOOM,
  MATCH_DURATION_MS,
  pickFocusMatchId,
  readColdLoadFocusParam,
  resolveColdLoadFocusBounds,
} from './focus-target';
import { EMPTY_SCORE, teamRef } from '@/domain/types';
import type { Match, MatchStatus } from '@/domain/types';
import { deepFreeze } from './__test-support__/roadmap-fixtures';
import { boundsOf, isGroupZoneNode, isKnockoutNode } from './hooks/useFocusCamera';
import {
  distinctZoneGraph,
  groupOnlyGraph,
  mixedGraph,
} from './hooks/__test-support__/camera-nodes';

/** A fixed wall-clock instant the tests resolve "now" against (UTC). */
const NOW = Date.parse('2026-06-20T18:00:00Z');
const MINUTE = 60 * 1000;

/** Minimal valid `Match` keyed only on the fields the rule reads (id/kickoff/status). */
function mkMatch(p: { id: string; kickoff: string; status?: MatchStatus }): Match {
  return {
    id: p.id,
    providerMatchId: p.id,
    providerRef: null,
    stage: 'GROUP_STAGE',
    group: 'A',
    matchday: null,
    home: teamRef({ id: `${p.id}-h`, name: 'Home', code: 'HOM', flagUrl: null }),
    away: teamRef({ id: `${p.id}-a`, name: 'Away', code: 'AWY', flagUrl: null }),
    score: EMPTY_SCORE,
    kickoff: p.kickoff,
    status: p.status ?? 'scheduled',
    minute: null,
    venue: { name: null, city: null },
  };
}

/** Kickoff (ISO) offset `minutes` from NOW — negative is in the past. */
function kickoffAt(minutesFromNow: number): string {
  return new Date(NOW + minutesFromNow * MINUTE).toISOString();
}

/** Minutes of MATCH_DURATION_MS, for readable boundary fixtures. */
const DURATION_MIN = MATCH_DURATION_MS / MINUTE;

describe('named constants [Acceptance #6]', () => {
  it('MATCH_DURATION_MS is ~115 minutes (full match incl. half-time + stoppage)', () => {
    expect(MATCH_DURATION_MS).toBe(115 * 60 * 1000);
  });

  it('FOCUS_ZOOM lies within the canvas minZoom (0.2) / maxZoom (1.8) bounds', () => {
    expect(FOCUS_ZOOM).toBeGreaterThanOrEqual(0.2);
    expect(FOCUS_ZOOM).toBeLessThanOrEqual(1.8);
  });

  it('FOCUS_DURATION_MS is a positive, sub-second camera glide', () => {
    expect(FOCUS_DURATION_MS).toBeGreaterThan(0);
    expect(FOCUS_DURATION_MS).toBeLessThanOrEqual(1000);
  });
});

describe('pickFocusMatchId — live wins over later scheduled [Acceptance #2]', () => {
  it('returns the live match (it ends soonest) over a later-kickoff scheduled game', () => {
    // Live kicked off 30' ago → estimatedEnd ~85' ahead; scheduled is 3h out.
    const live = mkMatch({ id: 'm-live', kickoff: kickoffAt(-30), status: 'live' });
    const later = mkMatch({ id: 'm-later', kickoff: kickoffAt(180), status: 'scheduled' });
    expect(pickFocusMatchId([later, live], NOW)).toBe('m-live');
  });

  it('a live match still in its first half wins over an upcoming match', () => {
    const live = mkMatch({ id: 'live-1', kickoff: kickoffAt(-5), status: 'live' });
    const upcoming = mkMatch({ id: 'up-1', kickoff: kickoffAt(10), status: 'scheduled' });
    expect(pickFocusMatchId([live, upcoming], NOW)).toBe('live-1');
  });

  it('the rule is purely time-based — status never overrides estimatedEnd ordering', () => {
    // A scheduled match that ends sooner must beat a live match that ends later;
    // the selection is on estimatedEnd, NOT on status === "live".
    const liveEndsLater = mkMatch({ id: 'live-late', kickoff: kickoffAt(-1), status: 'live' });
    const scheduledEndsSooner = mkMatch({ id: 'sched-soon', kickoff: kickoffAt(-30) });
    // scheduledEndsSooner.estimatedEnd = now + (DURATION-30) < liveEndsLater's now + (DURATION-1).
    expect(pickFocusMatchId([liveEndsLater, scheduledEndsSooner], NOW)).toBe('sched-soon');
  });

  it('EXCLUDES a long-running live match whose estimatedEnd is already in the past', () => {
    // Documented edge case (plan Risks): a status:"live" match that overran its
    // estimated window is "ended" by the pure rule; the next candidate takes over.
    const overranLive = mkMatch({
      id: 'live-overran',
      kickoff: kickoffAt(-(DURATION_MIN + 30)), // estimatedEnd 30' in the PAST
      status: 'live',
    });
    const nextUp = mkMatch({ id: 'next-up', kickoff: kickoffAt(20) });
    expect(pickFocusMatchId([overranLive, nextUp], NOW)).toBe('next-up');
  });
});

describe('pickFocusMatchId — nearest upcoming when none live [Acceptance #3]', () => {
  it('returns the earliest-kickoff future match when nothing is live', () => {
    const soon = mkMatch({ id: 'm-soon', kickoff: kickoffAt(60) });
    const later = mkMatch({ id: 'm-later', kickoff: kickoffAt(120) });
    const latest = mkMatch({ id: 'm-latest', kickoff: kickoffAt(300) });
    expect(pickFocusMatchId([latest, later, soon], NOW)).toBe('m-soon');
  });

  it('ignores matches that have already ended and picks the next to start', () => {
    const ended = mkMatch({ id: 'm-ended', kickoff: kickoffAt(-200) }); // end well past
    const next = mkMatch({ id: 'm-next', kickoff: kickoffAt(45) });
    expect(pickFocusMatchId([ended, next], NOW)).toBe('m-next');
  });
});

describe('pickFocusMatchId — no candidates [Acceptance #4]', () => {
  it('returns null when every match has already ended', () => {
    const a = mkMatch({ id: 'a', kickoff: kickoffAt(-300) });
    const b = mkMatch({ id: 'b', kickoff: kickoffAt(-200) });
    expect(pickFocusMatchId([a, b], NOW)).toBeNull();
  });

  it('returns null for an empty match list', () => {
    expect(pickFocusMatchId([], NOW)).toBeNull();
  });
});

describe('pickFocusMatchId — estimatedEnd boundary at exactly now [Acceptance #5]', () => {
  it('EXCLUDES a match whose estimatedEnd equals now exactly (rule is strictly > now)', () => {
    // estimatedEnd === now  ->  kickoff === now - MATCH_DURATION_MS.
    const endsNow = mkMatch({
      id: 'ends-now',
      kickoff: new Date(NOW - MATCH_DURATION_MS).toISOString(),
    });
    expect(pickFocusMatchId([endsNow], NOW)).toBeNull();
  });

  it('INCLUDES a match whose estimatedEnd is now + 1ms', () => {
    const endsJustAfter = mkMatch({
      id: 'ends-after',
      kickoff: new Date(NOW - MATCH_DURATION_MS + 1).toISOString(),
    });
    expect(pickFocusMatchId([endsJustAfter], NOW)).toBe('ends-after');
  });

  it('skips the exactly-now match and selects the next still-running candidate', () => {
    // Mixed input: one at the excluded boundary, one valid → the valid one wins,
    // proving the boundary is a per-candidate filter, not a global cutoff.
    const endsNow = mkMatch({
      id: 'ends-now',
      kickoff: new Date(NOW - MATCH_DURATION_MS).toISOString(),
    });
    const stillRunning = mkMatch({
      id: 'still-running',
      kickoff: new Date(NOW - MATCH_DURATION_MS + 1).toISOString(),
    });
    expect(pickFocusMatchId([endsNow, stillRunning], NOW)).toBe('still-running');
  });
});

describe('pickFocusMatchId — tiebreaks [Acceptance #1]', () => {
  it('on equal kickoff (equal estimatedEnd), the lexicographically smaller id wins', () => {
    // Same kickoff => same estimatedEnd => decided purely by id.
    const k = kickoffAt(60);
    const mb = mkMatch({ id: 'm-b', kickoff: k });
    const ma = mkMatch({ id: 'm-a', kickoff: k });
    expect(pickFocusMatchId([mb, ma], NOW)).toBe('m-a');
  });

  it('kickoff is the primary tiebreak before id (earlier kickoff wins regardless of id)', () => {
    // Earlier kickoff => smaller estimatedEnd; id 'z' must NOT override the time.
    const earlier = mkMatch({ id: 'z-earlier', kickoff: kickoffAt(30) });
    const later = mkMatch({ id: 'a-later', kickoff: kickoffAt(90) });
    expect(pickFocusMatchId([later, earlier], NOW)).toBe('z-earlier');
  });
});

describe('pickFocusMatchId — purity & determinism [Acceptance #1]', () => {
  it('does not mutate the input array or its elements (deep-frozen input does not throw)', () => {
    const matches = deepFreeze([
      mkMatch({ id: 'm1', kickoff: kickoffAt(120) }),
      mkMatch({ id: 'm2', kickoff: kickoffAt(30) }),
    ]);
    expect(() => pickFocusMatchId(matches, NOW)).not.toThrow();
    // No in-place reorder: original order preserved.
    expect(matches.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('is deterministic — repeated calls with the same args return the same id', () => {
    const matches = [
      mkMatch({ id: 'm-a', kickoff: kickoffAt(45) }),
      mkMatch({ id: 'm-b', kickoff: kickoffAt(90) }),
    ];
    const first = pickFocusMatchId(matches, NOW);
    const second = pickFocusMatchId(matches, NOW);
    expect(first).toBe('m-a');
    expect(second).toBe(first);
  });

  it('selects the global minimum from a large, shuffled, mixed-status input', () => {
    // 64 matches across long-ended / live / future. The unique earliest STILL-
    // RUNNING end is a live match kicked off 110' ago (inside the 115' window),
    // strictly earlier than any other still-running candidate. A single O(n) min
    // pass must find it regardless of where it sits in the array.
    const winner = mkMatch({ id: 'the-winner', kickoff: kickoffAt(-110), status: 'live' });
    const noise: Match[] = Array.from({ length: 63 }, (_, i) =>
      mkMatch({
        // Kickoffs from ~-625' (long ended) to ~+635'; none lands on -110'. The
        // earliest still-running noise kickoff is -95', so it ends after winner.
        id: `noise-${String(i).padStart(2, '0')}`,
        kickoff: kickoffAt((i - 31) * 20 + (i % 2 === 0 ? 5 : -5)),
        status: i % 7 === 0 ? 'live' : 'scheduled',
      }),
    );
    // Interleave the winner into the middle so the answer is not at either end.
    const shuffled = [...noise.slice(0, 30), winner, ...noise.slice(30)];
    expect(pickFocusMatchId(shuffled, NOW)).toBe('the-winner');
  });
});

// ===========================================================================
// resolveColdLoadFocusBounds — pure cold-load `?focus=` → framing Rect | null
//   (requirement 2026-06-24-1032; plan Test Strategy resolver cases 1-6,
//    Acceptance #1, #4, #5). Pure / DOM-free: a raw param string + a node set in,
//    a `Rect | null` out, asserted against the SAME `boundsOf` the production
//    framing branch composes with.
//
// The shared `distinctZoneGraph()` fixture gives three nodes whose `all` /
// `groups` / `knockout` / match-id envelopes are GENUINELY DISTINCT (the knockout
// card sits far south-east, outside the group envelope), so no "distinct from
// whole-graph" assertion below can pass by coincidence.
// ===========================================================================

describe('resolveColdLoadFocusBounds — view tokens [Acceptance #1]', () => {
  it("'all' resolves to the whole-graph envelope (== boundsOf(all nodes))", () => {
    const { nodes } = distinctZoneGraph();
    expect(resolveColdLoadFocusBounds('all', nodes)).toEqual(boundsOf([...nodes]));
  });

  it("'groups' resolves to the group-zone subset envelope, distinct from whole-graph", () => {
    const { nodes } = distinctZoneGraph();
    const groupSubset = nodes.filter(isGroupZoneNode);
    const expected = boundsOf(groupSubset);
    expect(resolveColdLoadFocusBounds('groups', nodes)).toEqual(expected);
    // The knockout node sits outside the group envelope, so the two differ.
    expect(expected).not.toEqual(boundsOf([...nodes]));
  });

  it("'knockout' resolves to the knockout subset envelope, distinct from whole-graph", () => {
    const { nodes } = distinctZoneGraph();
    const koSubset = nodes.filter(isKnockoutNode);
    const expected = boundsOf(koSubset);
    expect(resolveColdLoadFocusBounds('knockout', nodes)).toEqual(expected);
    expect(expected).not.toEqual(boundsOf([...nodes]));
  });
});

describe('resolveColdLoadFocusBounds — match-id deep link [Acceptance #1, #4]', () => {
  it('a knockout match id resolves to that single node footprint (== boundsOf([node]))', () => {
    const { knockoutMatch, nodes } = distinctZoneGraph();
    expect(resolveColdLoadFocusBounds(knockoutMatch.id, nodes)).toEqual(boundsOf([knockoutMatch]));
  });

  it('a GROUP-stage match id resolves to that card (a bare id targets any match card, not just KO)', () => {
    // Guards against an implementation that only resolves knockout cards. The
    // group card footprint is independently distinct from every view envelope.
    const { groupMatch, nodes } = distinctZoneGraph();
    const single = boundsOf([groupMatch]);
    expect(resolveColdLoadFocusBounds(groupMatch.id, nodes)).toEqual(single);
    expect(single).not.toEqual(boundsOf([...nodes]));
    expect(single).not.toEqual(boundsOf(nodes.filter(isGroupZoneNode)));
    expect(single).not.toEqual(boundsOf(nodes.filter(isKnockoutNode)));
  });

  it('the single-card box is distinct from the whole-graph, group, AND knockout-subset envelopes', () => {
    // The knockout card is the ONLY knockout node, so its single-card box equals
    // the knockout subset here; we therefore prove distinctness against the OTHER
    // three envelopes so the match-id path can't masquerade as any view frame.
    const { knockoutMatch, nodes } = distinctZoneGraph();
    const single = boundsOf([knockoutMatch]);
    expect(resolveColdLoadFocusBounds(knockoutMatch.id, nodes)).toEqual(single);
    expect(single).not.toEqual(boundsOf([...nodes]));
    expect(single).not.toEqual(boundsOf(nodes.filter(isGroupZoneNode)));
  });

  it('an UNMATCHED match id falls back to null (no such rendered node)', () => {
    const { nodes } = distinctZoneGraph();
    expect(resolveColdLoadFocusBounds('no-such-match', nodes)).toBeNull();
  });

  it('does NOT match a non-match node id (e.g. the standings table id) — null', () => {
    // The standings node is a `group-standings` node, not a `match`; a bare id
    // deep link only targets match cards, so this must fall through to null.
    const { standings, nodes } = distinctZoneGraph();
    expect(resolveColdLoadFocusBounds(standings.id, nodes)).toBeNull();
  });
});

describe('resolveColdLoadFocusBounds — garbage / empty / null param [Acceptance #4]', () => {
  it('returns null for a null param (no `?focus=` present)', () => {
    const { nodes } = distinctZoneGraph();
    expect(resolveColdLoadFocusBounds(null, nodes)).toBeNull();
  });

  it('returns null for an empty-string param', () => {
    const { nodes } = distinctZoneGraph();
    expect(resolveColdLoadFocusBounds('', nodes)).toBeNull();
  });

  it('returns null for an unknown garbage token', () => {
    const { nodes } = distinctZoneGraph();
    expect(resolveColdLoadFocusBounds('%%%garbage%%%', nodes)).toBeNull();
  });

  it("returns null for a valid view whose subset is EMPTY ('knockout' on a group-only graph)", () => {
    // A group-only graph has no knockout node → empty subset → boundsOf is null →
    // the resolver yields null so the caller uses the default whole-graph fit.
    const nodes = groupOnlyGraph();
    expect(resolveColdLoadFocusBounds('knockout', nodes)).toBeNull();
  });

  it('returns null when the whole node set is empty (no graph to frame yet)', () => {
    expect(resolveColdLoadFocusBounds('all', [])).toBeNull();
  });
});

describe('resolveColdLoadFocusBounds — purity & determinism [Acceptance #5]', () => {
  it('does not mutate a deep-frozen nodes input (proves it never writes the array)', () => {
    const nodes = deepFreeze(mixedGraph());
    expect(() => resolveColdLoadFocusBounds('groups', nodes)).not.toThrow();
    expect(() => resolveColdLoadFocusBounds('knockout', nodes)).not.toThrow();
    expect(() => resolveColdLoadFocusBounds('all', nodes)).not.toThrow();
  });

  it('does not reorder a deep-frozen nodes input (node order is preserved)', () => {
    const { nodes } = distinctZoneGraph();
    const idsBefore = nodes.map((n) => n.id);
    resolveColdLoadFocusBounds('groups', deepFreeze([...nodes]));
    expect(nodes.map((n) => n.id)).toEqual(idsBefore);
  });

  it('is deterministic — same (param, nodes) returns an equal Rect across calls', () => {
    const { nodes } = distinctZoneGraph();
    const first = resolveColdLoadFocusBounds('knockout', nodes);
    const second = resolveColdLoadFocusBounds('knockout', nodes);
    expect(first).toEqual(second);
    expect(first).toEqual(boundsOf(nodes.filter(isKnockoutNode)));
  });
});

// ===========================================================================
// readColdLoadFocusParam — the thin, no-window-safe `?focus=` reader
//   (Acceptance #5: "no-window-safe (returns null)"). This file runs in the
//   `node` environment (no `window`/`document`), so it is the correct home for
//   the NO-WINDOW branch. The WITH-window extraction branch (a real `?focus=` in
//   the URL) is covered in `useFitOnChange.test.ts`, which runs under jsdom and
//   drives `window.location` directly.
// ===========================================================================

describe('readColdLoadFocusParam — no-window safety [Acceptance #5]', () => {
  it('returns null when no `window` exists (SSR / node env), without throwing', () => {
    // Guard precondition: the node env genuinely has no `window`.
    expect(typeof window).toBe('undefined');
    expect(() => readColdLoadFocusParam()).not.toThrow();
    expect(readColdLoadFocusParam()).toBeNull();
  });
});
