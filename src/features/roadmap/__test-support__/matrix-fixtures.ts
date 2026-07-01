/**
 * Shared, deterministic FIXTURE-DERIVED helpers for the matrix "journey-lanes"
 * specs (build-matrix-graph / matrix-layout / matrix-lane) — requirement
 * 2026-07-01-1030. Everything here is derived straight off the validated mock
 * tournament, so the specs never hardcode counts and stay honest if the fixture
 * changes (mirroring `roadmap-fixtures.ts`'s doctrine). Kept under
 * `__test-support__/` so it is excluded from coverage and never collected as a
 * test.
 */
import type { Match, Stage, Team, Tournament } from '@/domain/types';
import { EMPTY_SCORE, placeholderRef, teamRef } from '@/domain/types';
import { teamIdOfRef } from '../team-focus';

/** kickoff ascending then id — the team's chronological journey order (mirrors
 *  the grid's `bySlotOrder` + the plan's lane-sort rule). */
export function byKickoffThenId(a: Match, b: Match): number {
  return a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id);
}

/** The chronological stage-column order the matrix packs left → right. The three
 *  group matchdays are separate columns 0/1/2; THIRD_PLACE + FINAL share col 7. */
export const MATRIX_STAGE_ORDER: readonly Stage[] = [
  'GROUP_STAGE', // MD1 (col 0)
  'GROUP_STAGE', // MD2 (col 1)
  'GROUP_STAGE', // MD3 (col 2)
  'ROUND_OF_32', // col 3
  'ROUND_OF_16', // col 4
  'QUARTER_FINALS', // col 5
  'SEMI_FINALS', // col 6
  'THIRD_PLACE', // col 7 (final band)
  'FINAL', // col 7 (final band)
];

/** Every match in the tournament (the station ground truth: one station/match). */
export function allMatches(t: Tournament): Match[] {
  return [...t.matches];
}

/** The expected total station count == every match (group + all KO). */
export function expectedStationCount(t: Tournament): number {
  return t.matches.length;
}

/** Fixture-derived per-stage match counts (the station-count oracle). */
export function stageMatchCounts(t: Tournament): Record<Stage, number> {
  const counts = {
    GROUP_STAGE: 0,
    ROUND_OF_32: 0,
    ROUND_OF_16: 0,
    QUARTER_FINALS: 0,
    SEMI_FINALS: 0,
    THIRD_PLACE: 0,
    FINAL: 0,
  } as Record<Stage, number>;
  for (const m of t.matches) counts[m.stage] += 1;
  return counts;
}

/** The single FINAL match (the champion's terminal station). */
export function finalMatch(t: Tournament): Match {
  const m = t.matches.find((x) => x.stage === 'FINAL');
  if (!m) throw new Error('fixture invariant: FINAL match missing');
  return m;
}

/**
 * The RESOLVED matches a team plays, chronologically ordered — the team's
 * expected lane (station sequence). Resolved-membership only (`teamIdOfRef`), so
 * a placeholder side never attributes a phantom match, exactly as `teamLanes`.
 */
export function teamMatchesInOrder(t: Tournament, teamId: string): Match[] {
  return t.matches
    .filter((m) => teamIdOfRef(m.home) === teamId || teamIdOfRef(m.away) === teamId)
    .sort(byKickoffThenId);
}

/** Distinct resolved team ids that actually play ≥1 match (the lane owners). */
export function teamIdsWithMatches(t: Tournament): string[] {
  const ids = new Set<string>();
  for (const m of t.matches) {
    const h = teamIdOfRef(m.home);
    const a = teamIdOfRef(m.away);
    if (h !== null) ids.add(h);
    if (a !== null) ids.add(a);
  }
  return [...ids].sort();
}

/** A known GROUP non-qualifier (plays exactly 3 group matches, no KO) — the
 *  "lane ends after MD3" oracle. Fixture-derived; throws if the fixture has none. */
export function aGroupNonQualifier(t: Tournament): string {
  for (const id of teamIdsWithMatches(t)) {
    const ms = teamMatchesInOrder(t, id);
    if (ms.length === 3 && ms.every((m) => m.stage === 'GROUP_STAGE')) return id;
  }
  throw new Error('fixture invariant: no group non-qualifier found');
}

/** A known R32 loser (plays 3 group + 1 R32, eliminated at R32) — a second
 *  "lane terminates mid-tournament" oracle. Throws if the fixture has none. */
export function anR32Loser(t: Tournament): string {
  for (const id of teamIdsWithMatches(t)) {
    const ms = teamMatchesInOrder(t, id);
    if (
      ms.length === 4 &&
      ms.filter((m) => m.stage === 'GROUP_STAGE').length === 3 &&
      ms.some((m) => m.stage === 'ROUND_OF_32') &&
      !ms.some((m) => m.stage === 'ROUND_OF_16')
    ) {
      return id;
    }
  }
  throw new Error('fixture invariant: no R32 loser found');
}

/** A finalist team id (plays the FINAL) — the "lane reaches the Final" oracle. */
export function aFinalist(t: Tournament): string {
  const fin = finalMatch(t);
  const id = teamIdOfRef(fin.home) ?? teamIdOfRef(fin.away);
  if (id === null) throw new Error('fixture invariant: FINAL has no resolved side');
  return id;
}

/**
 * The finalist's SEMI-FINAL match — its PENULTIMATE station, the true source of
 * the SF→Final hop. Lets the champion-reaches-Final spec assert the specific
 * penultimate station (not just "some edge targets the Final"). Throws if the
 * finalist has no SF match (a malformed fixture).
 */
export function aFinalistSemiFinalMatch(t: Tournament): Match {
  const finalist = aFinalist(t);
  const sf = teamMatchesInOrder(t, finalist).find((m) => m.stage === 'SEMI_FINALS');
  if (!sf) throw new Error('fixture invariant: the finalist has no SEMI_FINALS match');
  return sf;
}

/**
 * Two DISTINCT lane owners (the finalist + a group non-qualifier) — the oracle
 * for "distinct teams get distinct hues". They are different teams on different
 * journeys, so a per-team hue function must not collapse them to one color.
 */
export function twoDistinctTeamIds(t: Tournament): readonly [string, string] {
  const a = aFinalist(t);
  const b = aGroupNonQualifier(t);
  if (a === b) throw new Error('fixture invariant: finalist and non-qualifier are the same team');
  return [a, b] as const;
}

// --- Synthetic placeholder fixtures (resolved-only lane guard) ---------------
//
// The validated mock has ZERO placeholder sides, so the RESOLVED-ONLY guard would
// never be exercised against it. These tiny synthetic tournaments make the guard
// testable WITHOUT hardcoded Match literals sprinkled across specs: ONE factory
// (`syntheticMatch`) plus two named tournaments the builder + lane suites share.

/** The single resolved team used by the synthetic placeholder fixtures. */
export const SYNTHETIC_TEAM: Team = {
  id: 'team-syn',
  name: 'Synthia',
  code: 'SYN',
  flagUrl: null,
};

/**
 * A minimal, valid `Match` for the synthetic guard fixtures. Defaults to a
 * scheduled KO match with an EMPTY score; callers override only the fields under
 * test (sides, id, stage, kickoff) so the placeholder-side shape lives in ONE
 * place instead of being copy-pasted per spec.
 */
export function syntheticMatch(
  overrides: Partial<Match> & Pick<Match, 'id' | 'home' | 'away'>,
): Match {
  return {
    providerMatchId: overrides.id,
    providerRef: null,
    stage: 'ROUND_OF_32',
    group: null,
    matchday: null,
    score: EMPTY_SCORE,
    kickoff: '2026-07-04T18:00:00Z',
    status: 'scheduled',
    minute: null,
    venue: { name: null, city: null },
    ...overrides,
  };
}

/**
 * A synthetic tournament with ONE match: a RESOLVED home vs a PLACEHOLDER away.
 * Reuses the real mock's bracket/groups so the shape stays valid; only
 * `teams`/`matches` are overridden (the lane derivation reads only those). The
 * placeholder side must NEVER attribute a lane.
 */
export function tournamentWithPlaceholderSide(t: Tournament): Tournament {
  const match = syntheticMatch({
    id: 'syn-ko-1',
    home: teamRef(SYNTHETIC_TEAM),
    away: placeholderRef('Winner M50'),
  });
  return { ...t, teams: [SYNTHETIC_TEAM], matches: [match] };
}

/**
 * A synthetic tournament with ONE match whose BOTH sides are placeholders (no
 * resolved membership at all) — the "empty lane set / no crash" oracle.
 */
export function tournamentWithBothSidesPlaceholder(t: Tournament): Tournament {
  const match = syntheticMatch({
    id: 'syn-ko-2',
    stage: 'ROUND_OF_16',
    home: placeholderRef('Winner M73'),
    away: placeholderRef('Winner M74'),
    kickoff: '2026-07-05T18:00:00Z',
  });
  return { ...t, teams: [], matches: [match] };
}
