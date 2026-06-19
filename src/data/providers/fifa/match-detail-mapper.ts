import type { Lineup, LineupPlayer, MatchDetail, ProviderRef } from '@/domain/types';
import { EMPTY_MATCH_DETAIL } from '@/domain/types';
import { buildMatchEvents, deriveMatchStats } from './match-detail-mapper.stats';
import {
  type RawEvent,
  type RawPlayer,
  type RawSquad,
  type Side,
  makeSideResolver,
  parseMinute,
  pickLocale,
} from './match-detail-mapper.shared';
import type { RawMatchLive, RawTimeline } from './match-detail-schema';

/** Default ordering rank for a player whose `Position` line is unknown. */
const UNKNOWN_LINE = 9;
const LINE_STRIDE = 100;

/** Per-player badge data accumulated from a squad's live Goals/Bookings/Subs. */
interface PlayerEnrichment {
  readonly goals: number;
  readonly yellow: boolean;
  readonly red: boolean;
  readonly subbedOff?: number;
  readonly subbedOn?: number;
}

const NO_ENRICHMENT: PlayerEnrichment = { goals: 0, yellow: false, red: false };

/** FIFA booking card codes: 1 = yellow, 2 = second yellow (→ red), 3 = straight red. */
function isYellow(card: number | null | undefined): boolean {
  return card === 1 || card === 2;
}
function isRed(card: number | null | undefined): boolean {
  return card === 2 || card === 3;
}

/** A player's display name, preferring the panel's `ShortName` over the formal name. */
function playerDisplayName(raw: RawPlayer): string | null {
  return pickLocale(raw.ShortName) ?? pickLocale(raw.PlayerName);
}

/**
 * Build the central `IdPlayer → display name` map from BOTH squads' `Players[]`.
 * Real timeline events carry only `IdPlayer` (no `PlayerName`), so every event's
 * player name is resolved through this map.
 */
function buildLineupNames(live: RawMatchLive | null): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const squad of [live?.HomeTeam, live?.AwayTeam]) {
    for (const player of squad?.Players ?? []) {
      const id = player?.IdPlayer;
      const name = player ? playerDisplayName(player) : null;
      if (id && name) names.set(id, name);
    }
  }
  return names;
}

/**
 * Accumulate per-player badge data (goals scored, cards, sub on/off minute) from
 * one squad's live `Goals`/`Bookings`/`Substitutions` arrays, keyed by IdPlayer.
 *
 * Every per-team `Goals[]` entry is credited to its scorer — `Goal.Type` is NOT
 * used to detect own goals (both legit Mexico goals carry `Type: 2`).
 */
function buildEnrichment(squad: RawSquad): ReadonlyMap<string, PlayerEnrichment> {
  const acc = new Map<
    string,
    { goals: number; yellow: boolean; red: boolean; off?: number; on?: number }
  >();
  const at = (id: string | null | undefined) => {
    if (!id) return null;
    const cur = acc.get(id) ?? { goals: 0, yellow: false, red: false };
    acc.set(id, cur);
    return cur;
  };

  for (const goal of squad.Goals ?? []) {
    const entry = at(goal?.IdPlayer);
    if (entry) entry.goals += 1;
  }
  for (const booking of squad.Bookings ?? []) {
    const entry = at(booking?.IdPlayer);
    if (!entry) continue;
    if (isYellow(booking?.Card)) entry.yellow = true;
    if (isRed(booking?.Card)) entry.red = true;
  }
  for (const sub of squad.Substitutions ?? []) {
    const minute = parseMinute(sub?.Minute);
    const off = at(sub?.IdPlayerOff);
    if (off) off.off = minute;
    const on = at(sub?.IdPlayerOn);
    if (on) on.on = minute;
  }

  const out = new Map<string, PlayerEnrichment>();
  for (const [id, e] of acc) {
    out.set(id, {
      goals: e.goals,
      yellow: e.yellow,
      red: e.red,
      ...(e.off != null ? { subbedOff: e.off } : {}),
      ...(e.on != null ? { subbedOn: e.on } : {}),
    });
  }
  return out;
}

/**
 * `positionIndex` orders the lineup by line (GK first, forwards last) so
 * `layoutFormation` places the keeper on the own goal line. Shirt number is a
 * stable tiebreak within a line (`LineupX/Y` is null in this payload).
 */
function positionIndexOf(raw: RawPlayer): number {
  return (raw.Position ?? UNKNOWN_LINE) * LINE_STRIDE + (raw.ShirtNumber ?? 0);
}

function mapPlayer(
  raw: RawPlayer,
  enrichment: ReadonlyMap<string, PlayerEnrichment>,
): LineupPlayer {
  const name = playerDisplayName(raw) ?? 'Unknown';
  const shortName = pickLocale(raw.ShortName) ?? name;
  const id = raw.IdPlayer ?? shortName;
  const badges = (raw.IdPlayer && enrichment.get(raw.IdPlayer)) || NO_ENRICHMENT;
  return {
    id,
    shirtNumber: raw.ShirtNumber ?? 0,
    name,
    shortName,
    positionIndex: positionIndexOf(raw),
    isCaptain: raw.Captain === true,
    isStarter: raw.Status === 1,
    photoUrl: raw.PlayerPicture?.PictureUrl ?? null,
    goals: badges.goals,
    yellow: badges.yellow,
    red: badges.red,
    ...(badges.subbedOff != null ? { subbedOff: badges.subbedOff } : {}),
    ...(badges.subbedOn != null ? { subbedOn: badges.subbedOn } : {}),
  };
}

/** Head coach = the `Role === 0` entry, falling back to the first listed coach. */
function pickCoachName(squad: RawSquad): string | null {
  const coaches = squad.Coaches ?? [];
  const head = coaches.find((c) => c?.Role === 0) ?? coaches[0];
  if (!head) return null;
  return pickLocale(head.Alias) ?? pickLocale(head.Name);
}

function mapLineup(squad: RawSquad | null | undefined, side: Side): Lineup {
  if (!squad) {
    return { side, formation: null, coach: null, starters: [], bench: [] };
  }
  const enrichment = buildEnrichment(squad);
  const players = (squad.Players ?? [])
    .filter((p): p is RawPlayer => p != null)
    .map((p) => mapPlayer(p, enrichment));
  return {
    side,
    formation: squad.Tactics ?? null,
    coach: pickCoachName(squad),
    starters: players.filter((p) => p.isStarter),
    bench: players.filter((p) => !p.isStarter),
  };
}

/**
 * Pure mapper: raw FIFA `/live` + `/timelines` payloads → domain `MatchDetail`.
 * Degrades any null/empty section to an `EMPTY_MATCH_DETAIL`-shaped value
 * instead of throwing. A thin orchestrator composing the side resolver, lineup
 * names, events assembly (`buildMatchEvents`), lineups, and derived stats
 * (`deriveMatchStats`).
 */
export function mapFifaMatchDetail(
  live: RawMatchLive | null,
  timeline: RawTimeline | null,
  ref: ProviderRef,
): MatchDetail {
  const empty = EMPTY_MATCH_DETAIL(ref.idMatch);
  const resolveSide = makeSideResolver(live);
  const lineupNames = buildLineupNames(live);
  const hasSides = live?.HomeTeam?.IdTeam != null || live?.AwayTeam?.IdTeam != null;

  const rawEvents = (timeline?.Event ?? []).filter((e): e is RawEvent => e != null);
  const events = buildMatchEvents(rawEvents, resolveSide, lineupNames, live, hasSides);

  const home = mapLineup(live?.HomeTeam, 'home');
  const away = mapLineup(live?.AwayTeam, 'away');

  const { homeStats, awayStats, winProbability } = deriveMatchStats(
    live,
    rawEvents,
    events,
    resolveSide,
    empty.winProbability,
  );

  return {
    matchId: ref.idMatch,
    events,
    home,
    away,
    homeStats,
    awayStats,
    winProbability,
  };
}
