import type { RawMatchLive, RawTimeline } from './match-detail-schema';

/**
 * Shared FIFA payload aliases + locale/minute parsing primitives used by BOTH
 * the lineup-mapping side (`match-detail-mapper.ts`) and the events/stats side
 * (`match-detail-mapper.stats.ts`). Kept in one place so the two single-
 * responsibility modules never duplicate the parsing rules.
 */

export type Localized = ReadonlyArray<{ Locale: string; Description: string }> | null | undefined;
export type RawSquad = NonNullable<RawMatchLive['HomeTeam']>;
export type RawPlayer = NonNullable<NonNullable<RawSquad['Players']>[number]>;
export type RawEvent = NonNullable<NonNullable<RawTimeline['Event']>[number]>;
export type Side = 'home' | 'away';

export interface SideResolver {
  (idTeam: string | null | undefined): Side | null;
}

export function pickLocale(values: Localized): string | null {
  if (!values || values.length === 0) return null;
  const en =
    values.find((v) => v.Locale === 'en-GB') ?? values.find((v) => v.Locale.startsWith('en'));
  return (en ?? values[0]).Description;
}

/** Parse a FIFA match-minute string ("23'", "45'+2'") into its base integer minute. */
export function parseMinute(raw: string | null | undefined): number {
  if (!raw) return 0;
  const match = raw.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

/** Build a resolver that maps a raw `IdTeam` to the home/away side. */
export function makeSideResolver(live: RawMatchLive | null): SideResolver {
  const homeId = live?.HomeTeam?.IdTeam ?? null;
  const awayId = live?.AwayTeam?.IdTeam ?? null;
  return (idTeam) => {
    if (idTeam == null) return null;
    if (idTeam === homeId) return 'home';
    if (idTeam === awayId) return 'away';
    return null;
  };
}
