/**
 * Shared, deterministic test fixtures + derivation helpers for the continuous
 * per-match canvas specs (group-layout / bracket-layout / build-graph).
 *
 * Everything here is FIXTURE-DERIVED, never hardcoded: counts and structural
 * relations come straight off the validated mock tournament, so the specs stay
 * honest if the fixture changes. Kept out of `coverage.include` (test support,
 * not production geometry).
 */
import { buildMockTournament } from '@/data/providers/mock/build-mock-tournament';
import { parseTournament } from '@/data/schema/tournament-schema';
import { buildBracket } from '@/domain/bracket/build-bracket';
import { R32_SEEDING } from '@/domain/bracket/seeding';
import type { Bracket, BracketNode, Match, Tournament } from '@/domain/types';

/** Fixed clock so every derived kickoff/order is reproducible across runs. */
export const FIXTURE_AT = '2026-06-17T00:00:00Z';

/**
 * A freshly parsed + validated mock tournament. Re-parsed per call so no test
 * shares mutable state — isolation by construction.
 */
export function loadTournament(): Tournament {
  return parseTournament(buildMockTournament(FIXTURE_AT));
}

/** The complete synthetic bracket topology (16->8->4->2->1 + 3rd place). */
export function loadBracket(): Bracket {
  return buildBracket([]);
}

/** Every group-stage `Match`, in fixture order. */
export function groupStageMatches(t: Tournament): Match[] {
  return t.matches.filter((m) => m.stage === 'GROUP_STAGE');
}

/** Flatten all bracket nodes (every round, including THIRD_PLACE). */
export function allBracketNodes(bracket: Bracket): BracketNode[] {
  return bracket.rounds.flatMap((r) => r.nodes);
}

/** Group names in canonical A..L lane order. */
export function groupNames(t: Tournament): string[] {
  return t.groups.map((g) => g.name);
}

/** Match a group letter as a winner/runner-up R32 seed label ("1A" / "2A"). */
function seedFeedsGroup(label: string, group: string): boolean {
  return label === `1${group}` || label === `2${group}`;
}

/**
 * Feeder edges = one per (group, R32 slot) pair the group seeds. Derived from
 * `R32_SEEDING` exactly as `build-graph` must wire them.
 */
export function expectedFeederCount(t: Tournament): number {
  const r32 = t.bracket.rounds.find((r) => r.stage === 'ROUND_OF_32');
  if (!r32) throw new Error('fixture invariant: ROUND_OF_32 round missing');
  let total = 0;
  for (const group of t.groups) {
    r32.nodes.forEach((_node, slot) => {
      const pair = R32_SEEDING[slot];
      if (seedFeedsGroup(pair.home, group.name) || seedFeedsGroup(pair.away, group.name)) {
        total += 1;
      }
    });
  }
  return total;
}

/** Advance edges = one per non-group bracket slot (child -> parent). */
export function expectedAdvanceEdgeCount(t: Tournament): number {
  return allBracketNodes(t.bracket).reduce(
    (count, node) => count + [node.home, node.away].filter((s) => s.source.kind !== 'group').length,
    0,
  );
}

/**
 * Recursively freeze a value so a layout/transform that tries to mutate its
 * input throws — proving purity by construction.
 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Stable, comparable snapshot of a `Map<string, XY>`-shaped layout. */
export function sortedEntries<V>(map: ReadonlyMap<string, V>): [string, V][] {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
