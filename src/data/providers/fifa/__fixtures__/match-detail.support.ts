import type { ProviderRef } from '@/domain/types';
import { mapFifaMatchDetail } from '../match-detail-mapper';
import { rawMatchLiveSchema, rawTimelineSchema } from '../match-detail-schema';
import liveFixture from './match-detail.live.json';
import timelineFixture from './match-detail.timeline.json';

/**
 * Shared test support for the match-detail data layer.
 *
 * SINGLE SOURCE of the captured real payloads + their ground-truth facts so the
 * mapper and integration specs assert against the SAME values without copy-paste.
 * Fixtures are byte-copies of `docs/fifa-real-payloads/*` (match 400021443,
 * Mexico v South Africa, 2026-06-11). No live FIFA network access anywhere.
 */

export { liveFixture, timelineFixture };

/** Provider ref keyed to the captured match. */
export const REF: ProviderRef = {
  idCompetition: '17',
  idSeason: '255711',
  idStage: 'st-1',
  idMatch: '400021443',
};

/**
 * Ground-truth facts verified directly from the fixtures. Centralized so a test
 * never re-states a magic value the helper can name. Names use the FIFA
 * `ShortName` the panel displays (e.g. 356731 displays "RAÚL", not the formal
 * `PlayerName` "Raul JIMENEZ").
 */
export const FACTS = {
  matchId: '400021443',
  home: {
    idTeam: '43911',
    formation: '4-1-2-3',
    coach: 'Javier AGUIRRE', // head coach = Role 0 (NOT Coaches[0] = Rafael MARQUEZ).
    captain: { id: '395516', name: 'MONTES', shirtNumber: 3 },
    keeper: { id: '485070', name: 'RANGEL', shirtNumber: 1, position: 0 },
    starters: 11,
    bench: 15,
    goals: [
      { id: '429157', minute: 9, name: 'QUINONES' },
      // PlayerName is "Raul JIMENEZ"; ShortName (what the panel shows) is "RAÚL".
      { id: '356731', minute: 67, name: 'RAÚL' },
    ],
    yellowCard: { id: '464533', minute: 23, name: 'GUTIERREZ' },
    secondYellowRed: { id: '395516', minute: 90, name: 'MONTES' }, // "90'+2'" → 90.
    sub: { offId: '464533', offName: 'GUTIERREZ', onName: 'CHAVEZ', minute: 66 },
    stats: { shots: 16, corners: 3, fouls: 10, offsides: 1 },
  },
  away: {
    idTeam: '43883',
    formation: '5-3-2',
    coach: 'Hugo BROOS', // head coach = Role 0 (listed first for the away side).
    captain: { id: '395986', name: 'WILLIAMS', shirtNumber: 1 },
    starters: 11,
    bench: 15,
    reds: [
      { id: '390475', minute: 49, name: 'SITHOLE' },
      { id: '395984', minute: 84, name: 'ZWANE' },
    ],
    stats: { shots: 3, corners: 1, fouls: 8, offsides: 1 },
  },
  varMinute: 82,
  /** Raw `/timelines` Event[] length before any mapping/filtering. */
  rawEventCount: 80,
  /** Possession is null in BOTH BallPossession and TerritorialPossesion. */
  possession: null,
} as const;

/** Parse a fixture through the lenient boundary schema (mirrors fetchSection). */
export function parseLive() {
  return rawMatchLiveSchema.parse(liveFixture);
}

export function parseTimeline() {
  return rawTimelineSchema.parse(timelineFixture);
}

/**
 * Build a MatchDetail from BOTH real payloads via the production path
 * (schema.parse → mapFifaMatchDetail). Built fresh per call so a still-rejecting
 * schema fails the calling assertion with a readable message instead of aborting
 * collection of the whole file.
 */
export function buildDetail() {
  return mapFifaMatchDetail(parseLive(), parseTimeline(), REF);
}

/** Count how many raw timeline events carry a given English `TypeLocalized` label. */
export function rawLabelCount(label: string): number {
  const events = (timelineFixture as { Event: { TypeLocalized?: { Description: string }[] }[] })
    .Event;
  return events.filter((e) => e.TypeLocalized?.[0]?.Description === label).length;
}
