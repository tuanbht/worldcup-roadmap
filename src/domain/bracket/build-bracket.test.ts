import { describe, expect, it } from 'vitest';
import { buildBracket } from './build-bracket';
import type { Bracket, BracketNode, Match, Outcome, Score, Stage, Team, TeamRef } from '../types';
import { isResolved, placeholderRef, teamRef } from '../types';

// ---- Fixture builders (R2: placeholder-shell vs real advancing team) -------
// FIFA creates later-round fixture *shells* — a real Match row with PlaceHolderA/B
// teams and no IdTeam — before the feeder result resolves. These helpers let us
// stage that exact condition: a FINISHED feeder whose winner/loser is derivable,
// plus a real-but-unresolved parent shell.

function makeTeam(id: string): Team {
  return { id, name: id.toUpperCase(), code: id.slice(0, 3).toUpperCase(), flagUrl: null };
}

function score(winner: Outcome | null): Score {
  return {
    home: winner === 'home' ? 1 : 0,
    away: winner === 'away' ? 1 : 0,
    penaltyHome: null,
    penaltyAway: null,
    resolution: 'regular',
    winner,
  };
}

interface MatchOptions {
  readonly id: string;
  readonly stage: Stage;
  readonly home: TeamRef;
  readonly away: TeamRef;
  readonly kickoff: string;
  readonly status: Match['status'];
  readonly winner?: Outcome | null;
  /** Official FIFA bracket fixture number; omit to exercise the kickoff fallback. */
  readonly matchNumber?: number | null;
  /**
   * FIFA-only structured feeder refs (parsed from PlaceHolderA/B). Omit to
   * exercise the legacy adjacent-pair fallback (mock/legacy path).
   */
  readonly feeders?: Match['feeders'];
}

function makeMatch(opts: MatchOptions): Match {
  return {
    id: opts.id,
    providerMatchId: opts.id,
    providerRef: null,
    stage: opts.stage,
    group: null,
    matchday: null,
    home: opts.home,
    away: opts.away,
    score: opts.status === 'finished' ? score(opts.winner ?? null) : score(null),
    kickoff: opts.kickoff,
    status: opts.status,
    minute: null,
    venue: { name: null, city: null },
    matchNumber: opts.matchNumber ?? null,
    ...(opts.feeders ? { feeders: opts.feeders } : {}),
  };
}

function findNode(bracket: ReturnType<typeof buildBracket>, stage: Stage, slot: number) {
  const round = bracket.rounds.find((r) => r.stage === stage)!;
  return round.nodes[slot];
}

// ---- Whole-tree structural invariants (DRY, reused by every KO suite) -------
// These walk EVERY node — R32 through Final AND the third-place play-off — so an
// invariant can never be silently scoped to the round under test. Each returns
// the number of nodes it asserted on, letting callers guard against a vacuous
// (zero-check) pass.

/** Stable string key for a slot source, so two sources can be compared. */
function sourceKey(source: BracketNode['home']['source']): string {
  return source.kind === 'group' ? `group:${source.position}` : source.matchId;
}

/**
 * Assert no knockout node renders the same resolved team on both sides — the
 * exact shape of the "Paraguay vs Paraguay" duplicate. Only resolved/resolved
 * pairs are comparable (a placeholder side cannot duplicate a team). Returns the
 * count of resolved-pair nodes actually checked.
 */
function assertNoDuplicateTeam(bracket: Bracket): number {
  let checks = 0;
  for (const r of bracket.rounds) {
    for (const node of r.nodes) {
      if (!isResolved(node.home.team) || !isResolved(node.away.team)) continue;
      expect(
        node.home.team.team.id,
        `${r.stage} slot ${node.slotIndex} must not show the same team on both sides`,
      ).not.toBe(node.away.team.team.id);
      checks++;
    }
  }
  return checks;
}

/**
 * Assert no node draws both of its edges from one child — the structural shape of
 * a slot decoupled from the topology. Holds regardless of whether teams are
 * resolved. Returns the total node count visited (the full tree is 32 nodes).
 */
function assertNoSelfFeeding(bracket: Bracket): number {
  let nodeCount = 0;
  for (const r of bracket.rounds) {
    for (const node of r.nodes) {
      nodeCount++;
      expect(
        sourceKey(node.home.source),
        `${r.stage} slot ${node.slotIndex} must feed from two DISTINCT sources`,
      ).not.toBe(sourceKey(node.away.source));
    }
  }
  return nodeCount;
}

// Shared cast of teams reused across the R2 cases (DRY: one source of truth so a
// rename can't drift between the home/away/third-place suites).
const TEAMS = {
  argentina: makeTeam('argentina'),
  brazil: makeTeam('brazil'),
  france: makeTeam('france'),
  spain: makeTeam('spain'),
  portugal: makeTeam('portugal'),
} as const;

describe('buildBracket', () => {
  it('produces the full topology even with zero knockout matches', () => {
    const bracket = buildBracket([]);
    const stages = bracket.rounds.map((r) => r.stage);
    expect(stages).toEqual([
      'ROUND_OF_32',
      'ROUND_OF_16',
      'QUARTER_FINALS',
      'SEMI_FINALS',
      'FINAL',
      'THIRD_PLACE',
    ]);

    const counts = Object.fromEntries(bracket.rounds.map((r) => [r.stage, r.nodes.length]));
    expect(counts).toEqual({
      ROUND_OF_32: 16,
      ROUND_OF_16: 8,
      QUARTER_FINALS: 4,
      SEMI_FINALS: 2,
      FINAL: 1,
      THIRD_PLACE: 1,
    });
  });

  it('links each parent slot to its two children by slot arithmetic', () => {
    const bracket = buildBracket([]);
    const r32 = bracket.rounds.find((r) => r.stage === 'ROUND_OF_32')!;
    const r16 = bracket.rounds.find((r) => r.stage === 'ROUND_OF_16')!;

    expect(r16.nodes[0].home.source).toEqual({ kind: 'winnerOf', matchId: r32.nodes[0].matchId });
    expect(r16.nodes[0].away.source).toEqual({ kind: 'winnerOf', matchId: r32.nodes[1].matchId });
    expect(r16.nodes[3].home.source).toEqual({ kind: 'winnerOf', matchId: r32.nodes[6].matchId });
  });

  it('seeds Round of 32 sources from the official group template', () => {
    const r32 = buildBracket([]).rounds.find((r) => r.stage === 'ROUND_OF_32')!;
    // Slot 0 is the official runner-up-vs-runner-up opener (Match 73: 2A vs 2B).
    expect(r32.nodes[0].home.source).toEqual({ kind: 'group', position: '2A' });
    expect(r32.nodes[0].away.source).toEqual({ kind: 'group', position: '2B' });
    // Slot 2 pins a second official cell through buildBracket (Match 75: 1F vs 2C),
    // so a transposed table can't pass on slot 0 alone.
    expect(r32.nodes[2].home.source).toEqual({ kind: 'group', position: '1F' });
    expect(r32.nodes[2].away.source).toEqual({ kind: 'group', position: '2C' });
  });

  it('feeds the third-place play-off from the two semifinal losers', () => {
    const bracket = buildBracket([]);
    const sf = bracket.rounds.find((r) => r.stage === 'SEMI_FINALS')!;
    const third = bracket.rounds.find((r) => r.stage === 'THIRD_PLACE')!.nodes[0];
    expect(third.home.source).toEqual({ kind: 'loserOf', matchId: sf.nodes[0].matchId });
    expect(third.away.source).toEqual({ kind: 'loserOf', matchId: sf.nodes[1].matchId });
  });

  // ==========================================================================
  // R2 · placeholder-shell parent shows the REAL advancing team
  // ==========================================================================
  // The two R32 matches at slots 0 and 1 are the children of R16 slot 0
  // (slot*2 and slot*2+1). When those feeders are FINISHED with a derivable
  // winner, and the real R16 fixture is still a placeholder SHELL, the R16 node
  // must show the winner-propagated team, NOT the shell's placeholder.
  describe('R2 · real later-round shell with placeholder home/away', () => {
    const { argentina, brazil, france, spain, portugal } = TEAMS;

    // R32 slot 0 → Argentina (home) beats Brazil (away) → winner Argentina.
    const r32SlotZero = makeMatch({
      id: 'wc2026-ko-r32-1',
      stage: 'ROUND_OF_32',
      home: teamRef(argentina),
      away: teamRef(brazil),
      kickoff: '2026-06-30T16:00:00Z',
      status: 'finished',
      winner: 'home',
    });
    // R32 slot 1 → Spain (away) beats France (home) → winner Spain.
    const r32SlotOne = makeMatch({
      id: 'wc2026-ko-r32-2',
      stage: 'ROUND_OF_32',
      home: teamRef(france),
      away: teamRef(spain),
      kickoff: '2026-06-30T20:00:00Z',
      status: 'finished',
      winner: 'away',
    });

    /** Build an R16 slot-0 fixture shell with the given home/away refs. */
    function r16Fixture(home: TeamRef, away: TeamRef): Match {
      return makeMatch({
        id: 'wc2026-ko-r16-1',
        stage: 'ROUND_OF_16',
        home,
        away,
        kickoff: '2026-07-04T16:00:00Z',
        status: 'scheduled',
      });
    }

    /** Build the bracket from the two finished feeders + the R16 fixture shell. */
    function r16Slot0For(fixture: Match) {
      return findNode(buildBracket([r32SlotZero, r32SlotOne, fixture]), 'ROUND_OF_16', 0);
    }

    it('propagates the finished R32 winner into a placeholder HOME slot, ignoring the shell label', () => {
      // Real R16 fixture exists but its home is still a "PlaceHolderA" shell.
      const r16Slot0 = r16Slot0For(r16Fixture(placeholderRef('PlaceHolderA'), teamRef(spain)));

      // The home slot must propagate the finished R32 slot-0 winner (Argentina),
      // NOT keep the shell's "PlaceHolderA" placeholder.
      expect(r16Slot0.home.team).toEqual(teamRef(argentina));
      expect(r16Slot0.home.team.kind).toBe('team');
    });

    it('propagates the finished R32 winner into a placeholder AWAY slot (symmetric)', () => {
      const r16Slot0 = r16Slot0For(r16Fixture(teamRef(argentina), placeholderRef('PlaceHolderB')));

      // The away slot must propagate the finished R32 slot-1 winner (Spain).
      expect(r16Slot0.away.team).toEqual(teamRef(spain));
      expect(r16Slot0.away.team.kind).toBe('team');
    });

    it('keeps a RESOLVED home fixture slot as-is (regression: resolved beats propagation)', () => {
      // Both feeders finished, but the real R16 fixture already carries a resolved
      // home team — the actual fixture team must win (unchanged path), NOT the
      // R32 winner (Argentina).
      const r16Slot0 = r16Slot0For(r16Fixture(teamRef(portugal), placeholderRef('PlaceHolderB')));

      expect(r16Slot0.home.team).toEqual(teamRef(portugal));
      expect(r16Slot0.home.team).not.toEqual(teamRef(argentina));
    });

    it('keeps a RESOLVED away fixture slot as-is (regression: symmetric, resolved beats propagation)', () => {
      // Symmetric regression: a resolved away fixture team must survive untouched
      // and must NOT be overwritten by the R32 slot-1 winner (Spain).
      const r16Slot0 = r16Slot0For(r16Fixture(placeholderRef('PlaceHolderA'), teamRef(portugal)));

      expect(r16Slot0.away.team).toEqual(teamRef(portugal));
      expect(r16Slot0.away.team).not.toEqual(teamRef(spain));
    });
  });

  // ==========================================================================
  // R2 · third-place shell with placeholder home/away shows the real LOSERS
  // ==========================================================================
  describe('R2 · third-place shell propagates the real semifinal losers', () => {
    const { argentina, brazil, france, spain, portugal } = TEAMS;

    // The synthetic SF matchIds the bracket links the third-place slots to. Derived
    // once from a zero-match bracket so the feeders below target the right nodes.
    const sf = buildBracket([]).rounds.find((r) => r.stage === 'SEMI_FINALS')!;

    // SF-1 finished: Argentina beats Brazil → loser Brazil.
    const sf1 = makeMatch({
      id: sf.nodes[0].matchId,
      stage: 'SEMI_FINALS',
      home: teamRef(argentina),
      away: teamRef(brazil),
      kickoff: '2026-07-14T20:00:00Z',
      status: 'finished',
      winner: 'home',
    });
    // SF-2 finished: France loses to Spain → loser France.
    const sf2 = makeMatch({
      id: sf.nodes[1].matchId,
      stage: 'SEMI_FINALS',
      home: teamRef(france),
      away: teamRef(spain),
      kickoff: '2026-07-15T20:00:00Z',
      status: 'finished',
      winner: 'away',
    });

    /** Build a third-place fixture shell with the given home/away refs. */
    function thirdFixture(home: TeamRef, away: TeamRef): Match {
      return makeMatch({
        id: 'wc2026-ko-3p-1',
        stage: 'THIRD_PLACE',
        home,
        away,
        kickoff: '2026-07-18T20:00:00Z',
        status: 'scheduled',
      });
    }

    /** Build the bracket from the two finished SFs + the third-place fixture. */
    function thirdNodeFor(fixture: Match) {
      return buildBracket([sf1, sf2, fixture]).rounds.find((r) => r.stage === 'THIRD_PLACE')!
        .nodes[0];
    }

    it('propagates the real semifinal losers into placeholder slots, not "Loser SF-1/2"', () => {
      const third = thirdNodeFor(
        thirdFixture(placeholderRef('PlaceHolderA'), placeholderRef('PlaceHolderB')),
      );

      // Both losers propagate from the finished semifinals (Brazil, France),
      // overriding the shell's generic placeholders.
      expect(third.home.team).toEqual(teamRef(brazil));
      expect(third.home.team.kind).toBe('team');
      expect(third.away.team).toEqual(teamRef(france));
      expect(third.away.team.kind).toBe('team');
    });

    it('keeps RESOLVED third-place fixture slots as-is (regression: resolved beats loser-propagation)', () => {
      // The real third-place fixture already names both teams (e.g. provider
      // resolved them) — those teams must survive untouched, NOT be overwritten by
      // the derived semifinal losers (Brazil/France).
      const third = thirdNodeFor(thirdFixture(teamRef(portugal), teamRef(spain)));

      expect(third.home.team).toEqual(teamRef(portugal));
      expect(third.away.team).toEqual(teamRef(spain));
      expect(third.home.team).not.toEqual(teamRef(brazil));
      expect(third.away.team).not.toEqual(teamRef(france));
    });
  });

  // ==========================================================================
  // REGRESSION · slot real KO fixtures by FIFA MatchNumber, not kickoff time
  // ==========================================================================
  // Reproduces the live "Brazil" mismatch: with the real, partially-played feed,
  // an R16 fixture whose KICKOFF is earlier than its slot order gets dropped (by
  // the buggy kickoff dense-pack) into a bracket slot whose two R32 feeders are a
  // DIFFERENT pair than the one Brazil actually came from. The displayed team and
  // the advance edges decouple. Fix: place each real fixture at its TRUE slot
  // `matchNumber − STAGE_FIRST_MATCH[stage]` so the team rejoins its own feeders.
  //
  // Official numbering (cross-ref seeding.ts + the requirement):
  //   R32 = matchNumbers 73..88 → slots 0..15   (R32_SEEDING[i])
  //   R16 = matchNumbers 89..96 → slots 0..7
  // Brazil = group-C winner ('1C') → R32_SEEDING[3] = { '1C' vs '2F' } → slot 3,
  // matchNumber 76. R16 slot 1 is fed by R32 slots 2 & 3, so it is matchNumber 90.
  describe('REGRESSION · real R16 fixture slotted by MatchNumber, not kickoff', () => {
    // Stage bases, mirrored from STAGE_FIRST_MATCH (R32 = 73, R16 = 89). Local so a
    // bug in the production constant cannot mask a bug in placement.
    const R32_BASE = 73;
    const R16_BASE = 89;

    // ---- Named protagonists (the live bug's actual + decoy feeders) -----------
    // Every protagonist has a single home so its identity is unambiguous in the
    // assertions below.
    const BRAZIL = makeTeam('brazil'); // 1C → wins R32 slot 3 → must surface in R16 slot 1
    const JAPAN = makeTeam('japan'); // 2F → loses R32 slot 3
    const SPAIN = makeTeam('spain'); // 1F → wins R32 slot 2 (Brazil's R16 sibling feeder)
    const MEXICO = makeTeam('mexico'); // 2C → loses R32 slot 2
    const ARGENTINA = makeTeam('argentina'); // wins R32 slot 0 (R16 slot-0 feeder)
    const CANADA = makeTeam('canada'); // wins R32 slot 1 (R16 slot-0 feeder)
    const FRANCE = makeTeam('france'); // wins R32 slot 6 — a DECOY the kickoff bug mis-points at
    const PORTUGAL = makeTeam('portugal'); // wins R32 slot 7 — a DECOY the kickoff bug mis-points at

    // Brazil's true topology, named once so the intent is self-documenting and the
    // assertions can read these instead of re-deriving magic slot indices.
    const BRAZIL_R32_SLOT = 3; // R32_SEEDING[3] = { '1C' vs '2F' }
    const BRAZIL_SIBLING_R32_SLOT = 2; // R32_SEEDING[2] = { '1F' vs '2C' }
    const BRAZIL_R16_SLOT = 1; // fed by R32 slots 2 & 3 → matchNumber 90
    const OTHER_R16_SLOT = 0; // fed by R32 slots 0 & 1 → matchNumber 89

    // ---- Single source of truth: the R32 round as a slot→fixture table --------
    // 16 official-seeded R32 fixtures (slots 0..15 ↔ matchNumbers 73..88), all
    // finished home-wins so every feeder lineage resolves. Only the load-bearing
    // slots carry named teams; the rest get distinct fillers so the round is
    // complete and realistic. One declarative row per slot — no copy-paste.
    const filler = (slot: number) => makeTeam(`r32team-${slot}`);

    interface R32Row {
      readonly home: Team;
      readonly away: Team;
    }
    const R32_PLAN: readonly R32Row[] = Array.from({ length: 16 }, (_, slot): R32Row => {
      switch (slot) {
        case 0:
          return { home: ARGENTINA, away: filler(100) };
        case 1:
          return { home: CANADA, away: filler(101) };
        case BRAZIL_SIBLING_R32_SLOT:
          return { home: SPAIN, away: MEXICO };
        case BRAZIL_R32_SLOT:
          return { home: BRAZIL, away: JAPAN }; // ← the team at the centre of the bug
        case 6:
          return { home: FRANCE, away: filler(106) }; // decoy feeder
        case 7:
          return { home: PORTUGAL, away: filler(107) }; // decoy feeder
        default:
          return { home: filler(slot), away: filler(slot + 200) };
      }
    });

    // Build each R32 fixture from its row. Kickoffs are monotonic in slot order
    // (and all before any R16) so the OLD kickoff dense-pack would place them in
    // slot order — isolating the R16 mis-slotting as the only variable under test.
    const r32: readonly Match[] = R32_PLAN.map(({ home, away }, slot) =>
      makeMatch({
        id: `wc2026-ko-r32-${slot + 1}`,
        stage: 'ROUND_OF_32',
        home: teamRef(home),
        away: teamRef(away),
        kickoff: `2026-06-${slot < 9 ? '28' : '29'}T${String(slot % 24).padStart(2, '0')}:00:00Z`,
        status: 'finished',
        winner: 'home',
        matchNumber: R32_BASE + slot,
      }),
    );

    // ---- The two R16 fixtures, also a single declarative table ----------------
    // The kickoff order is the INVERSE of the slot order on purpose: the fixture
    // that belongs in slot 1 (Brazil) kicks off EARLIER than the one in slot 0.
    // Under the buggy kickoff dense-pack, Brazil would be pulled into slot 0 (whose
    // feeders are R32 slots 0 & 1 — matches Brazil never played). matchNumber must
    // override that and route each fixture to `matchNumber − R16_BASE`.
    interface R16Row {
      readonly id: string;
      readonly home: Team;
      readonly away: Team;
      readonly kickoff: string;
      readonly matchNumber: number;
    }
    const R16_PLAN: readonly R16Row[] = [
      {
        id: 'wc2026-ko-r16-brazil',
        home: BRAZIL, // winner of R32 slot 3
        away: SPAIN, // winner of R32 slot 2 (sibling)
        kickoff: '2026-07-04T12:00:00Z', // EARLIER than the slot-0 fixture
        matchNumber: R16_BASE + BRAZIL_R16_SLOT, // 90 → slot 1
      },
      {
        id: 'wc2026-ko-r16-slot0',
        home: ARGENTINA, // winner of R32 slot 0
        away: CANADA, // winner of R32 slot 1
        kickoff: '2026-07-04T20:00:00Z', // LATER than the Brazil fixture
        matchNumber: R16_BASE + OTHER_R16_SLOT, // 89 → slot 0
      },
    ];
    const r16: readonly Match[] = R16_PLAN.map((row) =>
      makeMatch({
        id: row.id,
        stage: 'ROUND_OF_16',
        home: teamRef(row.home),
        away: teamRef(row.away),
        kickoff: row.kickoff,
        status: 'scheduled',
        matchNumber: row.matchNumber,
      }),
    );

    const r16BrazilFixture = r16[0];
    const r16Slot0Fixture = r16[1];
    const allFixtures: readonly Match[] = [...r32, ...r16];

    function buildRegression(): Bracket {
      return buildBracket(allFixtures);
    }

    function round(bracket: Bracket, stage: Stage) {
      return bracket.rounds.find((r) => r.stage === stage)!;
    }

    /** The R16 node that currently displays a resolved Brazil as its home team. */
    function findBrazilNode(bracket: Bracket): BracketNode {
      const r16 = round(bracket, 'ROUND_OF_16');
      const node = r16.nodes.find(
        (n) => isResolved(n.home.team) && n.home.team.team.id === BRAZIL.id,
      );
      expect(node, 'exactly one R16 node should display Brazil').toBeDefined();
      return node!;
    }

    it('feeds the Brazil R16 node from its ACTUAL R32 (slot 3) and its sibling (slot 2)', () => {
      const bracket = buildRegression();
      const r32Round = round(bracket, 'ROUND_OF_32');

      const brazilNode = findBrazilNode(bracket);

      // Its two advance edges must originate from Brazil's REAL R32 (slot 3) and
      // its sibling (slot 2) — i.e. the displayed team is reachable from the
      // node's own source feeders. Under the kickoff bug they instead point at
      // R32 slots 0 & 1 (the bracket-slot-0 feeders), so this is RED.
      expect(brazilNode.home.source).toEqual({
        kind: 'winnerOf',
        matchId: r32Round.nodes[BRAZIL_SIBLING_R32_SLOT].matchId,
      });
      expect(brazilNode.away.source).toEqual({
        kind: 'winnerOf',
        matchId: r32Round.nodes[BRAZIL_R32_SLOT].matchId,
      });
    });

    it('places the Brazil fixture at R16 slot 1 (fed by R32 slots 2,3), not slot 0', () => {
      const bracket = buildRegression();
      const r16 = round(bracket, 'ROUND_OF_16');

      // matchNumber 90 → slot 1. The earlier-kickoff fixture must NOT land in slot 0.
      const slot1 = r16.nodes[BRAZIL_R16_SLOT];
      expect(slot1.matchId).toBe(r16BrazilFixture.id);
      expect(isResolved(slot1.home.team) && slot1.home.team.team.id).toBe(BRAZIL.id);

      // Bracket slot 0 must carry the OTHER fixture (Argentina/Canada from R32 0,1),
      // proving the early kickoff did not pull Brazil into slot 0.
      const slot0 = r16.nodes[OTHER_R16_SLOT];
      expect(slot0.matchId).toBe(r16Slot0Fixture.id);
      expect(isResolved(slot0.home.team) && slot0.home.team.team.id).toBe(ARGENTINA.id);
    });

    it('does NOT mis-feed Brazil from R32 slots 6 & 7 (the kickoff-bug pairing)', () => {
      const bracket = buildRegression();
      const r32Round = round(bracket, 'ROUND_OF_32');

      const brazilNode = findBrazilNode(bracket);

      // The "Brazil never played these" guard: France/Portugal's R32 (slots 6,7)
      // must never be a source of the node that shows Brazil.
      const sourceIds = [brazilNode.home.source, brazilNode.away.source]
        .filter((s): s is { kind: 'winnerOf'; matchId: string } => s.kind === 'winnerOf')
        .map((s) => s.matchId);
      expect(sourceIds).not.toContain(r32Round.nodes[6].matchId);
      expect(sourceIds).not.toContain(r32Round.nodes[7].matchId);
    });

    it('INVARIANT: across EVERY knockout node, the displayed teams are exactly its two sources’ feeders', () => {
      const bracket = buildRegression();
      const matchById = new Map(allFixtures.map((m) => [m.id, m] as const));

      // Resolve the team a child node's winner/loser feeds upward, when that
      // child's match is real + finished with a derivable result; otherwise null
      // (lineage not yet known → nothing to assert).
      function feederTeamId(source: BracketNode['home']['source']): string | null {
        if (source.kind === 'group') return null; // group seeds aren't modelled as matches
        const child = matchById.get(source.matchId);
        if (!child || child.status !== 'finished') return null;
        const w = child.score.winner;
        if (w === null || w === 'draw') return null;
        const winningSide = w; // 'home' | 'away'
        const take: 'winner' | 'loser' = source.kind === 'winnerOf' ? 'winner' : 'loser';
        const side = take === 'winner' ? winningSide : winningSide === 'home' ? 'away' : 'home';
        const ref = side === 'home' ? child.home : child.away;
        return isResolved(ref) ? ref.team.id : null;
      }

      // The requirement's invariant is a SET (multiset) relation on each node, NOT
      // a per-side positional match: a knockout node has TWO sources (home.source
      // and away.source), and the displayed pair of teams must be exactly the pair
      // of those two sources' feeders. Real FIFA fixtures order home/away
      // independently of feeder index (see the regression fixture: Brazil is the
      // node's HOME yet is the winner of the AWAY source, R32 slot 3), and the
      // "resolved beats propagation" tests above require the fixture's own
      // home/away to be honoured — so positional matching can never hold. Set
      // membership is the real meaning: every displayed team must be reachable from
      // ONE of the node's two advance edges, and no team that is NOT a winner/loser
      // of either source may appear (exactly the Brazil-fed-from-slots-6&7 bug).
      //
      // Walk the ENTIRE bracket — R32 through Final AND the third-place play-off —
      // so the invariant is not silently scoped to R16. Only assert a node when
      // BOTH displayed teams are resolved AND BOTH sources resolve to a feeder
      // team (guarding placeholders / not-yet-known lineage); then compare the two
      // multisets directly.
      const multiset = (ids: readonly string[]) => [...ids].sort();
      let nodeChecks = 0;
      for (const r of bracket.rounds) {
        for (const node of r.nodes) {
          if (!isResolved(node.home.team) || !isResolved(node.away.team)) continue;
          const homeFeeder = feederTeamId(node.home.source);
          const awayFeeder = feederTeamId(node.away.source);
          if (homeFeeder === null || awayFeeder === null) continue;

          const displayed = multiset([node.home.team.team.id, node.away.team.team.id]);
          const feeders = multiset([homeFeeder, awayFeeder]);
          expect(
            displayed,
            `${r.stage} slot ${node.slotIndex}: displayed teams ${JSON.stringify(displayed)} ` +
              `must equal the feeders of its two sources ${JSON.stringify(feeders)}`,
          ).toEqual(feeders);
          nodeChecks++;
        }
      }

      // Guard against a vacuously-passing loop: the regression fixture fully
      // resolves both R16 nodes (Brazil/Spain from R32 slots 3,2 and
      // Argentina/Canada from R32 slots 0,1), so at least 2 node-level set checks
      // must have actually fired. (No SF result is supplied, so the loserOf
      // third-place edge legitimately stays unresolved here; it is exercised by the
      // third-place R2 suite above and by the structural invariant below.)
      expect(nodeChecks).toBeGreaterThanOrEqual(2);
    });

    it('INVARIANT: no knockout node draws both of its sources from the same child', () => {
      // A self-feeding node (both edges pointing at one child) is the structural
      // shape of the original bug class — a slot decoupled from the topology. This
      // must hold for the WHOLE tree (R32 → Final + third place), every node,
      // regardless of whether the displayed teams are resolved yet.
      const nodeCount = assertNoSelfFeeding(buildRegression());

      // Sanity: the full 32-team tree (16+8+4+2+1) plus the third-place node = 32
      // nodes were all visited, so the assertion ran over the entire bracket.
      expect(nodeCount).toBe(32);
    });
  });

  // ==========================================================================
  // R16 · derive feeders from FIFA PlaceHolder (W##) refs, NOT adjacency
  // ==========================================================================
  // Live bug: a Round-of-16 card rendered the SAME team on both sides — "Paraguay
  // vs Paraguay". FIFA sent no duplicate (Away.IdTeam was null); build-bracket
  // manufactured it from an ADJACENT-PAIR feeder map. FIFA's real 2026 bracket
  // interleaves the halves and encodes the true pairing in each KO fixture's
  // PlaceHolderA/B ("W74" = winner of MatchNumber 74):
  //   R16 match 89: W74 / W77  → winner(74) vs winner(77)
  //   R16 match 90: W73 / W75  → winner(73) vs winner(75)
  // build-bracket must wire R16+ sources from those refs (look up the prior-round
  // child at `refMatchNumber − STAGE_FIRST_MATCH[childStage]`), not from
  // childNodes[2k]/[2k+1]. RED under the current adjacency wiring.
  describe('R16 feeders derived from FIFA PlaceHolder refs (not adjacency)', () => {
    // Stage bases, mirrored from STAGE_FIRST_MATCH (R32 = 73, R16 = 89). Local so a
    // bug in the production constant cannot mask a bug in the feeder lookup. A real
    // fixture's slot = matchNumber − base, so e.g. W77 → R32 slot 77−73 = 4.
    const R32_BASE = 73;
    const R16_BASE = 89;

    const winnerOf = (matchId: string) => ({ kind: 'winnerOf' as const, matchId });

    function round(bracket: Bracket, stage: Stage) {
      return bracket.rounds.find((r) => r.stage === stage)!;
    }

    // ---- Shared FIFA-fixture factories (DRY across both repro scenarios) ------
    // The Paraguay 2-match case and the full 16-match case differ only in WHICH
    // R32 slots are present and which feeder refs each R16 fixture carries — so
    // both are built from one R32 row factory + one feeder-fixture builder. No
    // copy-pasted match literals.

    interface R32Spec {
      readonly slot: number; // 0..15 → matchNumber R32_BASE + slot
      readonly home: Team;
      readonly away: Team;
      readonly winner: Outcome; // 'home' | 'away' — the team that advances
    }

    /** A finished R32 fixture pinned to its true slot via matchNumber. */
    function makeR32(spec: R32Spec): Match {
      return makeMatch({
        id: `wc2026-ko-r32-${spec.slot + 1}`,
        stage: 'ROUND_OF_32',
        home: teamRef(spec.home),
        away: teamRef(spec.away),
        kickoff: `2026-06-28T${String(spec.slot % 24).padStart(2, '0')}:00:00Z`,
        status: 'finished',
        winner: spec.winner,
        matchNumber: R32_BASE + spec.slot,
      });
    }

    /**
     * An R16 fixture SHELL carrying FIFA feeder refs. `home`/`away` default to the
     * cosmetic "W##" placeholder labels (matching how FIFA ships an unresolved
     * shell); pass an explicit ref to model a side FIFA has pre-resolved.
     */
    function makeR16WithFeeders(opts: {
      readonly id: string;
      readonly matchNumber: number;
      readonly homeFeederMatch: number;
      readonly awayFeederMatch: number;
      readonly home?: TeamRef;
      readonly away?: TeamRef;
    }): Match {
      return makeMatch({
        id: opts.id,
        stage: 'ROUND_OF_16',
        home: opts.home ?? placeholderRef(`W${opts.homeFeederMatch}`),
        away: opts.away ?? placeholderRef(`W${opts.awayFeederMatch}`),
        kickoff: `2026-07-05T${String(opts.matchNumber % 24).padStart(2, '0')}:00:00Z`,
        status: 'scheduled',
        matchNumber: opts.matchNumber,
        feeders: {
          home: { kind: 'winnerOf', matchNumber: opts.homeFeederMatch },
          away: { kind: 'winnerOf', matchNumber: opts.awayFeederMatch },
        },
      });
    }

    // --------------------------------------------------------------------------
    // PARAGUAY REGRESSION — the live "Paraguay vs Paraguay" duplicate
    // --------------------------------------------------------------------------
    // Protagonists & their match numbers (named so the intent is unmistakable):
    //   match 73 (R32 slot 0): South Africa 0–1 Canada → the top-ADJACENT feeder
    //     the buggy wiring would point R16 slot 0's home at.
    //   match 74 (R32 slot 1, "W74"): Germany 1–1 Paraguay, Paraguay wins → the
    //     team that gets DUPLICATED under adjacency (childNodes[1] = buggy away).
    //   match 77 (R32 slot 4, "W77"): ABSENT — the GENUINE unplayed other feeder;
    //     synthetic node, decidedTeam null → an unresolved placeholder.
    //   R16 match 89 (slot 0): scheduled shell, home pre-resolved to Paraguay
    //     (FIFA's W74), away placeholder "W77", feeders {home: W74, away: W77}.
    const PARAGUAY = makeTeam('paraguay'); // wins match 74 — the would-be duplicate
    const W74_PARAGUAY = 74; // Paraguay's real R32 → home feeder of R16 89
    const W77_UNPLAYED = 77; // the genuine unplayed other feeder of R16 89

    const r32m73 = makeR32({
      slot: 0,
      home: makeTeam('south-africa'),
      away: makeTeam('canada'), // Canada wins — top-adjacent decoy feeder
      winner: 'away',
    });
    const r32m74 = makeR32({
      slot: W74_PARAGUAY - R32_BASE, // slot 1
      home: makeTeam('germany'),
      away: PARAGUAY, // Paraguay wins
      winner: 'away',
    });
    // Match 77 is intentionally ABSENT (slot 4 stays synthetic + unresolved).
    const r16m89 = makeR16WithFeeders({
      id: 'wc2026-ko-r16-paraguay',
      matchNumber: 89,
      homeFeederMatch: W74_PARAGUAY,
      awayFeederMatch: W77_UNPLAYED,
      home: teamRef(PARAGUAY), // FIFA pre-resolved W74
      away: placeholderRef('W77'), // W77 unplayed → placeholder
    });

    function paraguayBracket(): Bracket {
      return buildBracket([r32m73, r32m74, r16m89]);
    }

    it('does NOT render the same team on both sides (no "Paraguay vs Paraguay")', () => {
      const r16Slot0 = round(paraguayBracket(), 'ROUND_OF_16').nodes[0];

      // Home is the resolved fixture team, Paraguay (W74).
      expect(isResolved(r16Slot0.home.team) && r16Slot0.home.team.team.id).toBe(PARAGUAY.id);

      // Away must NOT also be Paraguay. Match 77 is unplayed → away is an
      // UNRESOLVED placeholder, not back-filled from the adjacent match-74 feeder.
      expect(r16Slot0.away.team.kind).toBe('placeholder');
      expect(isResolved(r16Slot0.away.team)).toBe(false);
    });

    it('keeps every KO node free of a same-team duplicate (whole-tree invariant)', () => {
      // The duplicate manifests in THIS bracket under adjacency, so walking the
      // entire tree here (R32 → Final + third place) is the load-bearing guard,
      // not just the slot-0 spot check above.
      const checks = assertNoDuplicateTeam(paraguayBracket());
      // R32 slots 0 & 1 are finished with distinct teams → at least those two
      // resolved-pair nodes were actually compared (no vacuous pass).
      expect(checks).toBeGreaterThanOrEqual(2);
    });

    it('sources R16 slot 0 from W74 (R32 slot 1) and W77 (R32 slot 4), not the adjacent pair', () => {
      const bracket = paraguayBracket();
      const r32 = round(bracket, 'ROUND_OF_32');
      const r16Slot0 = round(bracket, 'ROUND_OF_16').nodes[0];

      // home.source = winnerOf(match 74) → R32 slot 74−73 = 1 (the real r32m74).
      expect(r16Slot0.home.source).toEqual(winnerOf(r32.nodes[W74_PARAGUAY - R32_BASE].matchId));
      // away.source = winnerOf(match 77) → R32 slot 77−73 = 4 (synthetic node).
      expect(r16Slot0.away.source).toEqual(winnerOf(r32.nodes[W77_UNPLAYED - R32_BASE].matchId));

      // And explicitly NOT the adjacency pair (winnerOf slot 0 / slot 1):
      expect(r16Slot0.home.source).not.toEqual(winnerOf(r32.nodes[0].matchId));
      expect(r16Slot0.away.source).not.toEqual(winnerOf(r32.nodes[1].matchId));
    });

    // --------------------------------------------------------------------------
    // FEEDERS-MATCH-PLACEHOLDER — 89=W74/W77 and 90=W73/W75 (a second pairing)
    // --------------------------------------------------------------------------
    // A full R32 round (matchNumbers 73–88, slots 0–15, all finished home-wins so
    // every lineage resolves) plus two R16 fixtures carrying their FIFA feeder
    // refs. Asserts each R16 node's two sources reference the matches named in its
    // PlaceHolders, NOT the adjacent pair. All-distinct R32 teams keep the
    // no-duplicate invariant meaningful (every resolved pair is genuinely two
    // different teams).
    describe('feeders match the named PlaceHolder matches for 89 and 90', () => {
      const r32: readonly Match[] = Array.from({ length: 16 }, (_, slot) =>
        makeR32({
          slot,
          home: makeTeam(`r32-home-${slot}`),
          away: makeTeam(`r32-away-${slot}`),
          winner: 'home',
        }),
      );

      // R16 match 89 (slot 0): W74 / W77 → R32 slots 1 & 4.
      const r16m89Full = makeR16WithFeeders({
        id: 'wc2026-ko-r16-89',
        matchNumber: 89,
        homeFeederMatch: 74,
        awayFeederMatch: 77,
      });
      // R16 match 90 (slot 1): W73 / W75 → R32 slots 0 & 2.
      const r16m90Full = makeR16WithFeeders({
        id: 'wc2026-ko-r16-90',
        matchNumber: 90,
        homeFeederMatch: 73,
        awayFeederMatch: 75,
      });

      function fullBracket(): Bracket {
        return buildBracket([...r32, r16m89Full, r16m90Full]);
      }

      it('R16 slot 0 (match 89) sources reference R32 slots 1 (W74) and 4 (W77)', () => {
        const bracket = fullBracket();
        const r32Round = round(bracket, 'ROUND_OF_32');
        const slot0 = round(bracket, 'ROUND_OF_16').nodes[89 - R16_BASE];

        expect(slot0.home.source).toEqual(winnerOf(r32Round.nodes[74 - R32_BASE].matchId)); // slot 1
        expect(slot0.away.source).toEqual(winnerOf(r32Round.nodes[77 - R32_BASE].matchId)); // slot 4
      });

      it('R16 slot 1 (match 90) sources reference R32 slots 0 (W73) and 2 (W75), not 73/74', () => {
        const bracket = fullBracket();
        const r32Round = round(bracket, 'ROUND_OF_32');
        const slot1 = round(bracket, 'ROUND_OF_16').nodes[90 - R16_BASE];

        // PlaceHolder-driven: 73→R32 slot 0, 75→R32 slot 2.
        expect(slot1.home.source).toEqual(winnerOf(r32Round.nodes[73 - R32_BASE].matchId)); // slot 0
        expect(slot1.away.source).toEqual(winnerOf(r32Round.nodes[75 - R32_BASE].matchId)); // slot 2

        // Adjacency (childNodes[2*1]/[2*1+1] = slots 2 & 3) would put slot 3 here;
        // the feeder W73 routes home to slot 0 instead. Guard against adjacency.
        expect(slot1.home.source).not.toEqual(winnerOf(r32Round.nodes[3].matchId));
      });

      it('INVARIANT: no KO node built with feeders shows the same team on both sides', () => {
        // The two R16 feeder fixtures fully resolve from the finished R32 round, so
        // at least those two resolved-pair nodes are compared (guard against a
        // vacuous loop). Walks the whole tree incl. the third-place play-off.
        const resolvedPairChecks = assertNoDuplicateTeam(fullBracket());
        expect(resolvedPairChecks).toBeGreaterThanOrEqual(2);
      });

      it('INVARIANT: no KO node draws both sources from the same child (with feeders)', () => {
        // The full 32-node tree (16+8+4+2+1 + third place) is walked end to end.
        expect(assertNoSelfFeeding(fullBracket())).toBe(32);
      });
    });
  });
});
