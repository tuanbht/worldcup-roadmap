import type { MatchEvent, TeamStats, WinProbability } from '@/domain/types';
import { deriveTeamStats, type StatEvent } from './match-detail-stats';
import { estimateWinProbability } from './win-probability';
import type { RawMatchLive } from './match-detail-schema';
import {
  type RawEvent,
  type Side,
  type SideResolver,
  pickLocale,
} from './match-detail-mapper.shared';

/**
 * Derived stats / win-probability for the FIFA match-detail mapper. Pure helpers
 * extracted from `mapFifaMatchDetail`. The event-assembly pipeline lives in the
 * sibling `match-detail-mapper.events.ts` (AF-7 split); this module keeps only the
 * stats + win-probability block. Behavior is byte-for-byte identical to the inline
 * blocks it replaces.
 */

/** Collect raw stat labels per side for the stats derivation. */
function statEvents(events: readonly RawEvent[], resolveSide: SideResolver): StatEvent[] {
  const out: StatEvent[] = [];
  for (const raw of events) {
    const label = pickLocale(raw.TypeLocalized);
    if (!label) continue;
    const side = resolveSide(raw.IdTeam);
    if (side === null) continue;
    out.push({ label, side });
  }
  return out;
}

/** Count goals per side from the mapped events, for the win-probability input. */
function countGoals(events: readonly MatchEvent[], side: Side): number {
  return events.filter((e) => e.side === side && (e.kind === 'goal' || e.kind === 'penalty-goal'))
    .length;
}

/** Possession for one side: ball possession, else territorial fallback, else null. */
function possessionFor(live: RawMatchLive | null, side: Side): number | null {
  const key = side === 'home' ? 'OverallHome' : 'OverallAway';
  return live?.BallPossession?.[key] ?? live?.TerritorialPossesion?.[key] ?? null;
}

/**
 * AF-2: map a raw FIFA live `MatchStatus` to the win-probability status LABEL.
 * FIFA `MatchStatus`: 3 = in-play (live); 0 = played; others = fixture. For a
 * match that already HAS play (the only branch this is called from), the only
 * distinction the estimate cares about is live (3) vs finished. A scheduled match
 * never reaches here — the caller falls back to `emptyWinProbability` when there
 * is no play.
 */
export function liveStatusToWinProb(matchStatus: number | null | undefined): 'live' | 'finished' {
  return matchStatus === 3 ? 'live' : 'finished';
}

export interface MatchStatsResult {
  readonly homeStats: TeamStats;
  readonly awayStats: TeamStats;
  readonly winProbability: WinProbability | null;
}

/**
 * Derive both sides' `TeamStats` (shots/corners/fouls/possession from the raw
 * timeline) and the labeled win-probability estimate from the mapped events.
 * Falls back to `emptyWinProbability` when there is no play. Pure.
 */
export function deriveMatchStats(
  live: RawMatchLive | null,
  rawEvents: readonly RawEvent[],
  events: readonly MatchEvent[],
  resolveSide: SideResolver,
  emptyWinProbability: WinProbability | null,
): MatchStatsResult {
  const stats = statEvents(rawEvents, resolveSide);
  const homeStats = deriveTeamStats(stats, possessionFor(live, 'home'), 'home');
  const awayStats = deriveTeamStats(stats, possessionFor(live, 'away'), 'away');

  const homeGoals = countGoals(events, 'home');
  const awayGoals = countGoals(events, 'away');
  const hasPlay = events.length > 0;
  const winProbability = hasPlay
    ? estimateWinProbability({
        status: liveStatusToWinProb(live?.MatchStatus),
        homeGoals,
        awayGoals,
        minute: events[events.length - 1]?.minute ?? null,
        homeShots: homeStats.shots,
        awayShots: awayStats.shots,
        homePossession: homeStats.possession,
        awayPossession: awayStats.possession,
      })
    : emptyWinProbability;

  return { homeStats, awayStats, winProbability };
}
