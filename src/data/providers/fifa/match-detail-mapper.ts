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

type Localized = ReadonlyArray<{ Locale: string; Description: string }> | null | undefined;
type RawSquad = NonNullable<RawMatchLive['HomeTeam']>;
type RawPlayer = NonNullable<NonNullable<RawSquad['Players']>[number]>;
type RawEvent = NonNullable<NonNullable<RawTimeline['Event']>[number]>;
type Side = 'home' | 'away';

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

function pickLocale(values: Localized): string | null {
  if (!values || values.length === 0) return null;
  const en =
    values.find((v) => v.Locale === 'en-GB') ?? values.find((v) => v.Locale.startsWith('en'));
  return (en ?? values[0]).Description;
}

/** Parse a FIFA match-minute string ("23'", "45'+2'") into its base integer minute. */
function parseMinute(raw: string | null | undefined): number {
  if (!raw) return 0;
  const match = raw.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

/** Coerce a possibly-numeric `EventId` to a stable string id. */
function eventIdToString(id: string | number | null | undefined): string | null {
  if (id == null) return null;
  return String(id);
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

interface SideResolver {
  (idTeam: string | null | undefined): Side | null;
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
 * `relatedName` lookups for the two enriched event kinds:
 *  - substitution → the player coming ON (from live `Substitutions[]`, keyed by
 *    the OFF player so a timeline sub event can resolve it);
 *  - assist → the scorer they set up (paired with the adjacent same-minute,
 *    same-side `Goal!` timeline event — `IdAssistPlayer` is null in real data).
 */
interface RelatedNames {
  readonly subOn: ReadonlyMap<string, string>; // IdPlayerOff → name of player coming ON
  readonly assistScorer: ReadonlyMap<string, string>; // assist EventId → paired scorer name
}

/** Map each live substitution's OFF player id to the ON player's display name. */
function buildSubOnNames(live: RawMatchLive | null): ReadonlyMap<string, string> {
  const subOn = new Map<string, string>();
  for (const squad of [live?.HomeTeam, live?.AwayTeam]) {
    for (const sub of squad?.Substitutions ?? []) {
      const off = sub?.IdPlayerOff;
      const onName = pickLocale(sub?.PlayerOnName);
      if (off && onName) subOn.set(off, onName);
    }
  }
  return subOn;
}

/**
 * Pair each `Assist` timeline event with the adjacent same-minute, same-side
 * `Goal!` event and record the scorer's lineup name keyed by the assist's
 * `EventId`. Deterministic over the chronological raw event order.
 */
function buildAssistScorers(
  events: readonly RawEvent[],
  resolveSide: SideResolver,
  lineupNames: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const assistScorer = new Map<string, string>();
  events.forEach((assist, index) => {
    if (labelToKind(pickLocale(assist.TypeLocalized)) !== 'assist') return;
    const assistId = eventIdToString(assist.EventId);
    if (!assistId) return;
    const assistSide = resolveSide(assist.IdTeam);
    const assistMinute = parseMinute(assist.MatchMinute);
    for (let i = index + 1; i < events.length; i += 1) {
      const candidate = events[i]!;
      if (parseMinute(candidate.MatchMinute) !== assistMinute) break;
      if (resolveSide(candidate.IdTeam) !== assistSide) continue;
      if (labelToKind(pickLocale(candidate.TypeLocalized)) !== 'goal') continue;
      const scorer = candidate.IdPlayer ? lineupNames.get(candidate.IdPlayer) : null;
      if (scorer) assistScorer.set(assistId, scorer);
      break;
    }
  });
  return assistScorer;
}

/** For a substitution event the primary player is the one going OFF. */
function eventPlayerId(kind: MatchEventKind, raw: RawEvent): string | null {
  if (kind === 'substitution') return raw.IdSubPlayer ?? raw.IdPlayer ?? null;
  return raw.IdPlayer ?? null;
}

function relatedNameFor(
  kind: MatchEventKind,
  raw: RawEvent,
  playerId: string | null,
  related: RelatedNames,
): string | null {
  if (kind === 'substitution') {
    return playerId ? (related.subOn.get(playerId) ?? null) : null;
  }
  if (kind === 'assist') {
    const assistId = eventIdToString(raw.EventId);
    return assistId ? (related.assistScorer.get(assistId) ?? null) : null;
  }
  return null;
}

function mapEvent(
  raw: RawEvent,
  resolveSide: SideResolver,
  lineupNames: ReadonlyMap<string, string>,
  related: RelatedNames,
  hasSides: boolean,
): MatchEvent | null {
  const label = pickLocale(raw.TypeLocalized);
  const kind = labelToKind(label);
  if (kind === null) return null;
  const resolved = resolveSide(raw.IdTeam);
  // VAR and period boundaries are real first-class events that carry no team —
  // keep them (attributed to 'home' for the side-typed shape) when the live
  // payload anchors the match. Without sides (live missing) there is no match to
  // attribute them to, so they are dropped. Other teamless events have no domain
  // meaning → skip.
  const teamless = (kind === 'var' || kind === 'period') && hasSides;
  if (resolved === null && !teamless) return null;
  const side: Side = resolved ?? 'home';
  const refinedKind = kind === 'goal' ? classifyGoalKind(label) : kind;
  const playerId = eventPlayerId(refinedKind, raw);
  const playerName = playerId ? (lineupNames.get(playerId) ?? null) : null;
  const relatedName = relatedNameFor(refinedKind, raw, playerId, related);
  const minute = parseMinute(raw.MatchMinute);
  return {
    id: eventIdToString(raw.EventId) ?? `${playerId ?? 'evt'}-${minute}`,
    minute,
    period: periodLabel(raw.Period),
    kind: refinedKind,
    side,
    playerId,
    playerName,
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
  const lineupNames = buildLineupNames(live);
  const hasSides = live?.HomeTeam?.IdTeam != null || live?.AwayTeam?.IdTeam != null;

  const rawEvents = (timeline?.Event ?? []).filter((e): e is RawEvent => e != null);

  const related: RelatedNames = {
    subOn: buildSubOnNames(live),
    assistScorer: buildAssistScorers(rawEvents, resolveSide, lineupNames),
  };

  const events = rawEvents
    .map((raw) => mapEvent(raw, resolveSide, lineupNames, related, hasSides))
    .filter((e): e is MatchEvent => e !== null)
    .sort((a, b) => a.minute - b.minute);

  const home = mapLineup(live?.HomeTeam, 'home');
  const away = mapLineup(live?.AwayTeam, 'away');

  const stats = statEvents(rawEvents, resolveSide);
  const homeStats = deriveTeamStats(stats, possessionFor(live, 'home'), 'home');
  const awayStats = deriveTeamStats(stats, possessionFor(live, 'away'), 'away');

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
