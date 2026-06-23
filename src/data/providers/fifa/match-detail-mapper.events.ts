import type { MatchEvent, MatchEventKind } from '@/domain/types';
import { classifyGoalKind, labelToKind } from './event-labels';
import type { RawMatchLive } from './match-detail-schema';
import {
  type RawEvent,
  type Side,
  type SideResolver,
  parseMinute,
  pickLocale,
} from './match-detail-mapper.shared';

/**
 * Event-assembly pipeline for the FIFA match-detail mapper (AF-7 split out of
 * `match-detail-mapper.stats.ts`). Pure helpers extracted from `mapFifaMatchDetail`
 * so the orchestrator stays a thin composition; behavior is byte-for-byte
 * identical to the inline blocks they replace.
 */

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

/**
 * Build the sorted, side-resolved domain event list from the raw timeline:
 * resolve substitution/assist related names, map each raw event, drop nulls,
 * and order chronologically by minute. Pure over its inputs.
 */
export function buildMatchEvents(
  rawEvents: readonly RawEvent[],
  resolveSide: SideResolver,
  lineupNames: ReadonlyMap<string, string>,
  live: RawMatchLive | null,
  hasSides: boolean,
): MatchEvent[] {
  const related: RelatedNames = {
    subOn: buildSubOnNames(live),
    assistScorer: buildAssistScorers(rawEvents, resolveSide, lineupNames),
  };

  return rawEvents
    .map((raw) => mapEvent(raw, resolveSide, lineupNames, related, hasSides))
    .filter((e): e is MatchEvent => e !== null)
    .sort((a, b) => a.minute - b.minute);
}
