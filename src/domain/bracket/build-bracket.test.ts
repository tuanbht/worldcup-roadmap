import { describe, expect, it } from 'vitest';
import { buildBracket } from './build-bracket';
import type { Match, Outcome, Score, Stage, Team, TeamRef } from '../types';
import { placeholderRef, teamRef } from '../types';

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
  };
}

function findNode(bracket: ReturnType<typeof buildBracket>, stage: Stage, slot: number) {
  const round = bracket.rounds.find((r) => r.stage === stage)!;
  return round.nodes[slot];
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
});
