import type { TeamStats } from '@/domain/types';
import { labelToKind } from './event-labels';

/**
 * A timeline event reduced to the fields stats derivation needs. The `label` is
 * the FIFA `TypeLocalized` string (e.g. "Attempt at Goal", "Corner", "Foul",
 * "Offside", "Yellow card", "Red card"); `side` is resolved from `IdTeam`.
 *
 * Counting over the RAW timeline labels (not the mapped `MatchEvent` enum) is
 * deliberate: domain `MatchEventKind` does not include attempt/corner/foul/
 * offside, so those stats can only be derived from the raw timeline labels.
 */
export interface StatEvent {
  readonly label: string;
  readonly side: 'home' | 'away';
}

function normalize(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Derive one side's `TeamStats` by counting timeline events + reading possession.
 * Shots = `Attempt at Goal` count; corners/fouls/offsides/cards counted; passes /
 * passAccuracy / shotsOnTarget are OMITTED (null) — never faked as 0.
 */
export function deriveTeamStats(
  events: readonly StatEvent[],
  possession: number | null,
  side: 'home' | 'away',
): TeamStats {
  let shots = 0;
  let corners = 0;
  let fouls = 0;
  let offsides = 0;
  let yellowCards = 0;
  let redCards = 0;

  for (const event of events) {
    if (event.side !== side) continue;
    const label = normalize(event.label);
    if (label === 'attempt at goal') shots += 1;
    else if (label === 'corner') corners += 1;
    else if (label === 'foul') fouls += 1;
    else if (label === 'offside') offsides += 1;
    else {
      const kind = labelToKind(event.label);
      if (kind === 'yellow' || kind === 'second-yellow') yellowCards += 1;
      else if (kind === 'red') redCards += 1;
    }
  }

  return {
    possession,
    shots,
    // Omitted (null) — no FIFA source. Never faked as 0.
    shotsOnTarget: null,
    passes: null,
    passAccuracy: null,
    fouls,
    yellowCards,
    redCards,
    offsides,
    corners,
  };
}
