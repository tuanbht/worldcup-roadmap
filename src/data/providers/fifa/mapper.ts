import type {
  Match,
  MatchStatus,
  Outcome,
  ProviderRef,
  Score,
  Stage,
  TeamRef,
  Venue,
} from '@/domain/types';
import { placeholderRef, teamRef } from '@/domain/types';
import { env } from '@/data/config/env';
import { fifaFlagUrl } from '@/data/flag-url';
import type { RawMatch } from './schema';

type Localized = ReadonlyArray<{ Locale: string; Description: string }> | undefined;

function pickLocale(values: Localized): string | null {
  if (!values || values.length === 0) return null;
  const en =
    values.find((v) => v.Locale === 'en-GB') ?? values.find((v) => v.Locale.startsWith('en'));
  return (en ?? values[0]).Description;
}

function mapStage(desc: string | null): Stage {
  const d = (desc ?? '').toLowerCase();
  if (d.includes('group') || d.includes('first stage')) return 'GROUP_STAGE';
  if (d.includes('round of 32')) return 'ROUND_OF_32';
  if (d.includes('round of 16')) return 'ROUND_OF_16';
  if (d.includes('quarter')) return 'QUARTER_FINALS';
  if (d.includes('semi')) return 'SEMI_FINALS';
  if (d.includes('third') || d.includes('play-off for')) return 'THIRD_PLACE';
  if (d.includes('final')) return 'FINAL';
  return 'GROUP_STAGE';
}

function mapGroup(desc: string | null): string | null {
  if (!desc) return null;
  const match = desc.match(/group\s+([a-l])/i);
  return match ? match[1].toUpperCase() : null;
}

/** FIFA MatchStatus: 0 = played, 1 = fixture, 3 = live (others → scheduled). */
function mapStatus(raw: RawMatch): MatchStatus {
  if (raw.MatchStatus === 3) return 'live';
  if (raw.MatchStatus === 0) {
    const hasScore = raw.HomeTeamScore != null && raw.AwayTeamScore != null;
    return hasScore ? 'finished' : 'scheduled';
  }
  return 'scheduled';
}

function mapTeam(raw: RawMatch['Home'], placeholder: string | null | undefined): TeamRef {
  if (!raw || !raw.IdTeam) return placeholderRef(placeholder ?? 'TBD');
  const code = raw.IdCountry ?? null;
  return teamRef({
    id: `fifa-${raw.IdTeam}`,
    name: pickLocale(raw.TeamName) ?? code ?? 'TBD',
    code,
    flagUrl: code ? fifaFlagUrl(code) : (raw.PictureUrl ?? null),
  });
}

function computeWinner(
  home: number | null,
  away: number | null,
  ph: number | null,
  pa: number | null,
): Outcome | null {
  if (home == null || away == null) return null;
  if (home > away) return 'home';
  if (away > home) return 'away';
  if (ph != null && pa != null) return ph > pa ? 'home' : 'away';
  return 'draw';
}

function mapScore(raw: RawMatch, status: MatchStatus): Score {
  const home = raw.HomeTeamScore ?? null;
  const away = raw.AwayTeamScore ?? null;
  const ph = raw.HomeTeamPenaltyScore ?? null;
  const pa = raw.AwayTeamPenaltyScore ?? null;
  return {
    home,
    away,
    penaltyHome: ph,
    penaltyAway: pa,
    resolution: status === 'finished' ? (ph != null ? 'penalties' : 'regular') : null,
    winner: status === 'finished' ? computeWinner(home, away, ph, pa) : null,
  };
}

function mapMinute(raw: RawMatch, status: MatchStatus): number | null {
  if (status !== 'live' || !raw.MatchTime) return null;
  const n = parseInt(raw.MatchTime.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function mapVenue(raw: RawMatch): Venue {
  return {
    name: pickLocale(raw.Stadium?.Name),
    city: pickLocale(raw.Stadium?.CityName),
  };
}

/**
 * FIFA detail coordinates for the per-match `/live` + `/timelines` fetch. Built
 * from the calendar row's `IdStage` + `IdMatch` and the configured comp/season;
 * `null` when `IdStage` is absent so the detail endpoint degrades gracefully.
 *
 * L-A: if a live `/calendar/matches` probe shows `IdStage` is never present,
 * derive it from the stage list instead and revisit this branch.
 */
function mapProviderRef(raw: RawMatch): ProviderRef | null {
  if (!raw.IdStage) return null;
  return {
    idCompetition: env.WC_FIFA_COMPETITION_ID,
    idSeason: env.WC_FIFA_SEASON_ID,
    idStage: raw.IdStage,
    idMatch: raw.IdMatch,
  };
}

/** Normalize raw FIFA match records into the domain model. Pure + immutable. */
export function mapFifaMatches(raws: readonly RawMatch[]): Match[] {
  return raws.map((raw) => {
    const stage = mapStage(pickLocale(raw.StageName));
    const status = mapStatus(raw);
    return {
      id: `wc2026-fifa-${raw.IdMatch}`,
      providerMatchId: raw.IdMatch,
      providerRef: mapProviderRef(raw),
      stage,
      group: stage === 'GROUP_STAGE' ? mapGroup(pickLocale(raw.GroupName)) : null,
      matchday: raw.MatchDay ?? null,
      home: mapTeam(raw.Home, raw.PlaceHolderA),
      away: mapTeam(raw.Away, raw.PlaceHolderB),
      score: mapScore(raw, status),
      kickoff: raw.Date,
      status,
      minute: mapMinute(raw, status),
      venue: mapVenue(raw),
    };
  });
}
