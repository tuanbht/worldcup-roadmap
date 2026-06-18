import { z } from 'zod';

/**
 * Tolerant zod schemas for the undocumented FIFA v3 per-match payloads,
 * matched to the REAL captured `/live/football` + `/timelines` shapes
 * (match 400021443 — Mexico v South Africa).
 *
 * The schema's ONLY job is to ACCEPT: every field is `.optional()`/`.nullable()`
 * and every object is `.passthrough()`, so unknown/extra real fields (Officials,
 * Stadium, Weather, VarNotificationData, PositionX/Y, IdSubTeam, SpecialStatus,
 * LineupX/Y, …) never reject. Degradation to an empty section is the mapper's job.
 */

/** FIFA localized text array: `[{ Locale, Description }]` (extra keys allowed). */
const localized = z
  .array(z.object({ Locale: z.string(), Description: z.string() }).passthrough())
  .nullable()
  .optional();

const rawPicture = z.object({ PictureUrl: z.string().nullable().optional() }).passthrough();

const rawPlayer = z
  .object({
    IdPlayer: z.string().nullable().optional(),
    IdTeam: z.string().nullable().optional(),
    ShirtNumber: z.number().nullable().optional(),
    Status: z.number().nullable().optional(), // 1 = starter, 2 = bench
    Position: z.number().nullable().optional(), // 0 GK, 1 DEF, 2 MID, 3 FWD
    Captain: z.boolean().nullable().optional(),
    PlayerName: localized,
    ShortName: localized,
    PlayerPicture: rawPicture.nullable().optional(),
  })
  .passthrough();

const rawCoach = z
  .object({
    Role: z.number().nullable().optional(), // 0 = head coach, 1 = assistant
    Name: localized,
    Alias: localized,
  })
  .passthrough();

const rawGoal = z
  .object({
    IdPlayer: z.string().nullable().optional(),
    IdAssistPlayer: z.string().nullable().optional(), // null in real data
    Type: z.number().nullable().optional(), // NOT used for own-goal detection
    Minute: z.string().nullable().optional(),
  })
  .passthrough();

const rawBooking = z
  .object({
    IdPlayer: z.string().nullable().optional(),
    Card: z.number().nullable().optional(), // 1 yellow, 2 second yellow (→ red), 3 straight red
    Minute: z.string().nullable().optional(),
  })
  .passthrough();

const rawSubstitution = z
  .object({
    IdPlayerOff: z.string().nullable().optional(),
    IdPlayerOn: z.string().nullable().optional(),
    PlayerOffName: localized,
    PlayerOnName: localized,
    Minute: z.string().nullable().optional(),
  })
  .passthrough();

const rawTeamSquad = z
  .object({
    IdTeam: z.string().nullable().optional(),
    Tactics: z.string().nullable().optional(), // formation, e.g. "4-1-2-3"
    TeamName: localized,
    Players: z.array(rawPlayer).nullable().optional(),
    Coaches: z.array(rawCoach).nullable().optional(),
    // Per-team event arrays from the live payload. Used to enrich each
    // LineupPlayer with goal/card/sub badges (the timeline is a fallback).
    Goals: z.array(rawGoal).nullable().optional(),
    Bookings: z.array(rawBooking).nullable().optional(),
    Substitutions: z.array(rawSubstitution).nullable().optional(),
  })
  .passthrough();

/** Possession block; both top-level fields are `null` for this match. */
const possessionObj = z
  .object({
    OverallHome: z.number().nullable().optional(),
    OverallAway: z.number().nullable().optional(),
  })
  .passthrough();

export const rawMatchLiveSchema = z
  .object({
    IdMatch: z.string().nullable().optional(),
    HomeTeam: rawTeamSquad.nullable().optional(),
    AwayTeam: rawTeamSquad.nullable().optional(),
    BallPossession: possessionObj.nullable().optional(),
    TerritorialPossesion: possessionObj.nullable().optional(), // FIFA's one-'s' spelling
  })
  .passthrough();

const rawTimelineEvent = z
  .object({
    EventId: z.union([z.string(), z.number()]).nullable().optional(),
    IdTeam: z.string().nullable().optional(),
    IdPlayer: z.string().nullable().optional(),
    IdSubPlayer: z.string().nullable().optional(), // timeline sub: player going OFF
    IdSubTeam: z.string().nullable().optional(),
    MatchMinute: z.string().nullable().optional(), // "4'", "45'+2'"
    Period: z.number().nullable().optional(),
    Type: z.number().nullable().optional(),
    Qualifiers: z.array(z.unknown()).nullable().optional(),
    TypeLocalized: localized, // event LABEL source
    EventDescription: localized,
    HomeGoals: z.number().nullable().optional(),
    AwayGoals: z.number().nullable().optional(),
  })
  .passthrough();

export const rawTimelineSchema = z
  .object({
    IdMatch: z.string().nullable().optional(),
    Event: z.array(rawTimelineEvent).nullable().optional(),
  })
  .passthrough();

export type RawMatchLive = z.infer<typeof rawMatchLiveSchema>;
export type RawTimeline = z.infer<typeof rawTimelineSchema>;
