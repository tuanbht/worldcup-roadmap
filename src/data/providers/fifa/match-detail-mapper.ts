import type {
  Lineup,
  LineupPlayer,
  MatchDetail,
  MatchEvent,
  MatchEventKind,
  ProviderRef,
} from '@/domain/types';
import { EMPTY_MATCH_DETAIL } from '@/domain/types';
import { classifyGoalKind, labelToKind } from './event-labels';
import { deriveTeamStats, type StatEvent } from './match-detail-stats';
import { estimateWinProbability } from './win-probability';
import type { RawMatchLive, RawTimeline } from './match-detail-schema';

type Localized = ReadonlyArray<{ Locale: string; Description: string }> | undefined;
type RawSquad = NonNullable<RawMatchLive['HomeTeam']>;
type RawPlayer = NonNullable<NonNullable<RawSquad['Players']>[number]>;
type RawEvent = NonNullable<NonNullable<RawTimeline['Event']>[number]>;

/** Per-player badge data accumulated from a squad's live Goals/Bookings/Subs. */
interface PlayerEnrichment {
  readonly goals: number;
  readonly yellow: boolean;
  readonly red: boolean;
  readonly subbedOff?: number;
  readonly subbedOn?: number;
}

const NO_ENRICHMENT: PlayerEnrichment = { goals: 0, yellow: false, red: false };

function pickLocale(values: Localized): string | null {
  if (!values || values.length === 0) return null;
  const en =
    values.find((v) => v.Locale === 'en-GB') ?? values.find((v) => v.Locale.startsWith('en'));
  return (en ?? values[0]).Description;
}

/** Parse a FIFA match-minute string ("23'", "45+2'") into an integer minute. */
function parseMinute(raw: string | null | undefined): number {
  if (!raw) return 0;
  const match = raw.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

/** Map a numeric FIFA `Period` to a stable period label. */
function periodLabel(period: number | null | undefined): string {
  switch (period) {
    case 3:
      return 'first-half';
    case 4:
      return 'half-time';
    case 5:
      return 'second-half';
    case 6:
      return 'full-time';
    case 7:
    case 8:
      return 'extra-time';
    case 11:
      return 'penalties';
    default:
      return 'match';
  }
}

/** FIFA booking card codes: 1 = yellow, 2 = second yellow (→ red), 3 = straight red. */
function isYellow(card: number | null | undefined): boolean {
  return card === 1 || card === 2;
}
function isRed(card: number | null | undefined): boolean {
  return card === 2 || card === 3;
}

/**
 * Accumulate per-player badge data (goals scored, cards, sub on/off minute) from
 * one squad's live `Goals`/`Bookings`/`Substitutions` arrays, keyed by IdPlayer.
 * Own goals (Type 2 in FIFA's goal list) are excluded from the scorer's tally.
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
    if (goal?.Type === 2) continue; // own goal — not credited to this scorer
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

function mapPlayer(
  raw: RawPlayer,
  enrichment: ReadonlyMap<string, PlayerEnrichment>,
): LineupPlayer {
  const name = pickLocale(raw.PlayerName) ?? pickLocale(raw.ShortName) ?? 'Unknown';
  const shortName = pickLocale(raw.ShortName) ?? name;
  const id = raw.IdPlayer ?? shortName;
  const badges = (raw.IdPlayer && enrichment.get(raw.IdPlayer)) || NO_ENRICHMENT;
  return {
    id,
    shirtNumber: raw.ShirtNumber ?? 0,
    name,
    shortName,
    positionIndex: raw.ShirtNumber ?? 0,
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

function mapLineup(squad: RawSquad | null | undefined, side: 'home' | 'away'): Lineup {
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
    coach: pickLocale(squad.Coaches?.[0]?.Name) ?? null,
    starters: players.filter((p) => p.isStarter),
    bench: players.filter((p) => !p.isStarter),
  };
}

interface SideResolver {
  (idTeam: string | null | undefined): 'home' | 'away' | null;
}

/** Build a resolver that maps a raw `IdTeam` to the home/away side. */
function makeSideResolver(live: RawMatchLive | null): SideResolver {
  const homeId = live?.HomeTeam?.IdTeam ?? null;
  const awayId = live?.AwayTeam?.IdTeam ?? null;
  return (idTeam) => {
    if (idTeam == null) return null;
    if (idTeam === homeId) return 'home';
    if (idTeam === awayId) return 'away';
    return null;
  };
}

/**
 * `relatedName` lookups keyed by the event's primary `IdPlayer`:
 *  - assist → the player coming ON for a substitution (subOn) or, for an assist
 *    event, the scorer they set up (scorerByAssist);
 *  - a substitution event's related name is the player coming on (subOn).
 */
interface RelatedNames {
  readonly subOn: ReadonlyMap<string, string>; // IdPlayerOff → name of player coming on
  readonly scorerByAssist: ReadonlyMap<string, string>; // IdAssistPlayer → scorer name
}

function buildRelatedNames(
  live: RawMatchLive | null,
  scorerName: ReadonlyMap<string, string>,
): RelatedNames {
  const subOn = new Map<string, string>();
  const scorerByAssist = new Map<string, string>();
  for (const squad of [live?.HomeTeam, live?.AwayTeam]) {
    for (const sub of squad?.Substitutions ?? []) {
      const off = sub?.IdPlayerOff;
      const onName = pickLocale(sub?.PlayerOnName);
      if (off && onName) subOn.set(off, onName);
    }
    for (const goal of squad?.Goals ?? []) {
      const assistId = goal?.IdAssistPlayer;
      const scorer = goal?.IdPlayer ? scorerName.get(goal.IdPlayer) : null;
      if (assistId && scorer) scorerByAssist.set(assistId, scorer);
    }
  }
  return { subOn, scorerByAssist };
}

function relatedNameFor(
  kind: MatchEventKind,
  playerId: string | null,
  related: RelatedNames,
): string | null {
  if (!playerId) return null;
  if (kind === 'substitution') return related.subOn.get(playerId) ?? null;
  if (kind === 'assist') return related.scorerByAssist.get(playerId) ?? null;
  return null;
}

function mapEvent(
  raw: RawEvent,
  resolveSide: SideResolver,
  related: RelatedNames,
): MatchEvent | null {
  const label = pickLocale(raw.TypeLocalized);
  const kind = labelToKind(label);
  if (kind === null) return null;
  const side = resolveSide(raw.IdTeam);
  if (side === null) return null; // period boundaries carry no team → skip
  const refinedKind = kind === 'goal' ? classifyGoalKind(label) : kind;
  const playerId = raw.IdPlayer ?? null;
  const relatedName = relatedNameFor(refinedKind, playerId, related);
  return {
    id: raw.EventId ?? `${raw.IdPlayer ?? 'evt'}-${parseMinute(raw.MatchMinute)}`,
    minute: parseMinute(raw.MatchMinute),
    period: periodLabel(raw.Period),
    kind: refinedKind,
    side,
    playerId,
    playerName: pickLocale(raw.PlayerName),
    ...(relatedName != null ? { relatedName } : {}),
  };
}

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
function countGoals(events: readonly MatchEvent[], side: 'home' | 'away'): number {
  return events.filter((e) => e.side === side && (e.kind === 'goal' || e.kind === 'penalty-goal'))
    .length;
}

/**
 * Pure mapper: raw FIFA `/live` + `/timelines` payloads → domain `MatchDetail`.
 * Degrades any null/empty section to an `EMPTY_MATCH_DETAIL`-shaped value
 * instead of throwing.
 */
export function mapFifaMatchDetail(
  live: RawMatchLive | null,
  timeline: RawTimeline | null,
  ref: ProviderRef,
): MatchDetail {
  const empty = EMPTY_MATCH_DETAIL(ref.idMatch);
  const resolveSide = makeSideResolver(live);

  const rawEvents = (timeline?.Event ?? []).filter((e): e is RawEvent => e != null);

  // Map each scorer's IdPlayer → display name from the timeline goal events, so
  // an assist event can resolve the name of the goal it set up.
  const scorerName = new Map<string, string>();
  for (const raw of rawEvents) {
    if (labelToKind(pickLocale(raw.TypeLocalized)) !== 'goal') continue;
    const name = pickLocale(raw.PlayerName);
    if (raw.IdPlayer && name) scorerName.set(raw.IdPlayer, name);
  }
  const related = buildRelatedNames(live, scorerName);

  const events = rawEvents
    .map((raw) => mapEvent(raw, resolveSide, related))
    .filter((e): e is MatchEvent => e !== null)
    .sort((a, b) => a.minute - b.minute);

  const home = mapLineup(live?.HomeTeam, 'home');
  const away = mapLineup(live?.AwayTeam, 'away');

  const stats = statEvents(rawEvents, resolveSide);
  const homeStats = deriveTeamStats(stats, live?.BallPossession?.OverallHome ?? null, 'home');
  const awayStats = deriveTeamStats(stats, live?.BallPossession?.OverallAway ?? null, 'away');

  const homeGoals = countGoals(events, 'home');
  const awayGoals = countGoals(events, 'away');
  const hasPlay = events.length > 0;
  const winProbability = hasPlay
    ? estimateWinProbability({
        status: 'live',
        homeGoals,
        awayGoals,
        minute: events[events.length - 1]?.minute ?? null,
        homeShots: homeStats.shots,
        awayShots: awayStats.shots,
        homePossession: homeStats.possession,
        awayPossession: awayStats.possession,
      })
    : empty.winProbability;

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
