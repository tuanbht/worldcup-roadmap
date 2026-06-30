/**
 * Shared, deterministic builders for the winner-resolution + score-caption unit
 * specs (`resolve-teams.test.ts`, `format-score.test.ts`) — requirement
 * 2026-06-30-1416.
 *
 * ONE source of truth for the `Score` / `Match` / `BracketNode` shapes those two
 * specs exercise, so the winner rule (`resolve-teams.ts`) and the score formatter
 * (`format-score.ts`) are pinned against the SAME fixture data instead of two
 * copy-pasted literals drifting apart. Every builder returns a FRESH object per
 * call (spread of literals) — no shared mutable state, isolation by construction.
 *
 * The two teams are DISTINCT on every field (id, name, code) so a transposed
 * home<->away wiring is caught; `flagUrl` is non-null on ARG so the builder tests
 * can assert `winnerFlagUrl` carries a real value (not just `null === null`).
 * Kept under `__test-support__` so it is excluded from coverage and never
 * collected as a test.
 */
import type { BracketNode, Match, Score, Team, TeamRef } from '@/domain/types';
import { teamRef } from '@/domain/types';

/** The canonical HOME team (the regulation/penalty winner in these fixtures). */
export const ARG: Team = {
  id: 'team-arg',
  name: 'Argentina',
  code: 'ARG',
  flagUrl: 'https://flags.example/arg.svg',
};

/** The canonical AWAY team — distinct on every field, `flagUrl` null. */
export const FRA: Team = { id: 'team-fra', name: 'France', code: 'FRA', flagUrl: null };

/** A regulation win for the home side (`2–1`, winner 'home'). */
export const REGULAR_WIN: Score = {
  home: 2,
  away: 1,
  penaltyHome: null,
  penaltyAway: null,
  resolution: 'regular',
  winner: 'home',
};

/** A penalty-shootout win for the home side (`1–1 (4–2 pens)`). */
export const PENALTY_WIN: Score = {
  home: 1,
  away: 1,
  penaltyHome: 4,
  penaltyAway: 2,
  resolution: 'penalties',
  winner: 'home',
};

/** Build a `Score` off the regulation-win baseline; spread overrides last. */
export function makeScore(overrides: Partial<Score> = {}): Score {
  return { ...REGULAR_WIN, ...overrides };
}

/** A KO bracket node whose two `winnerOf`-fed sides carry the given refs. */
export function koNode(home: TeamRef, away: TeamRef, matchId = 'wc2026-r16-1'): BracketNode {
  return {
    matchId,
    stage: 'ROUND_OF_16',
    slotIndex: 0,
    home: { side: 'home', source: { kind: 'winnerOf', matchId: 'a' }, team: home },
    away: { side: 'away', source: { kind: 'winnerOf', matchId: 'b' }, team: away },
  };
}

/** A finished `Match` (ARG 2–1 FRA) keyed by the node's matchId; override freely. */
export function koMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'wc2026-r16-1',
    providerMatchId: 'wc2026-r16-1',
    providerRef: null,
    stage: 'ROUND_OF_16',
    group: null,
    matchday: null,
    home: teamRef(ARG),
    away: teamRef(FRA),
    score: REGULAR_WIN,
    kickoff: '2026-07-01T00:00:00Z',
    status: 'finished',
    minute: null,
    venue: { name: null, city: null },
    ...overrides,
  };
}

/** A single-entry `matchId -> Match` lookup, as the resolver/builder consume it. */
export function mapOf(match: Match): Map<string, Match> {
  return new Map([[match.id, match]]);
}
