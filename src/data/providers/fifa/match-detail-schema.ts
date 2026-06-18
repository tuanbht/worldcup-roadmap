import { z } from 'zod';

/**
 * Tolerant zod schemas for the undocumented FIFA v3 per-match payloads.
 * Everything is nullable/optional + `.passthrough()` so a partial/empty payload
 * still validates and the mapper degrades it to empty rather than throwing.
 *
 * Field names mirror the requirement's documented shape; swap in a captured real
 * payload later and adjust accessors only.
 */

const localized = z.array(z.object({ Locale: z.string(), Description: z.string() }));

const rawPicture = z.object({ PictureUrl: z.string().nullable().optional() }).passthrough();

const rawPlayer = z
  .object({
    IdPlayer: z.string().nullable().optional(),
    IdTeam: z.string().nullable().optional(),
    ShirtNumber: z.number().nullable().optional(),
    Captain: z.boolean().nullable().optional(),
    Position: z.string().nullable().optional(),
    Status: z.number().nullable().optional(),
    FieldStatus: z.number().nullable().optional(),
    PlayerName: localized.optional(),
    ShortName: localized.optional(),
    PlayerPicture: rawPicture.nullable().optional(),
  })
  .passthrough();

const rawGoal = z
  .object({
    IdPlayer: z.string().nullable().optional(),
    IdAssistPlayer: z.string().nullable().optional(),
    AssistPlayerName: localized.optional(),
    Type: z.number().nullable().optional(),
    Minute: z.string().nullable().optional(),
  })
  .passthrough();

const rawBooking = z
  .object({
    IdPlayer: z.string().nullable().optional(),
    Card: z.number().nullable().optional(),
    Minute: z.string().nullable().optional(),
  })
  .passthrough();

const rawSubstitution = z
  .object({
    IdPlayerOff: z.string().nullable().optional(),
    IdPlayerOn: z.string().nullable().optional(),
    PlayerOnName: localized.optional(),
    Minute: z.string().nullable().optional(),
  })
  .passthrough();

const rawTeamSquad = z
  .object({
    IdTeam: z.string().nullable().optional(),
    Tactics: z.string().nullable().optional(),
    Players: z.array(rawPlayer).nullable().optional(),
    Coaches: z
      .array(z.object({ Name: localized.optional() }).passthrough())
      .nullable()
      .optional(),
    // Per-team event arrays from the live payload. Used to enrich each
    // LineupPlayer with goal/card/sub badges (the timeline is a fallback).
    Goals: z.array(rawGoal).nullable().optional(),
    Bookings: z.array(rawBooking).nullable().optional(),
    Substitutions: z.array(rawSubstitution).nullable().optional(),
  })
  .passthrough();

export const rawMatchLiveSchema = z
  .object({
    IdMatch: z.string().nullable().optional(),
    HomeTeam: rawTeamSquad.nullable().optional(),
    AwayTeam: rawTeamSquad.nullable().optional(),
    BallPossession: z
      .object({
        OverallHome: z.number().nullable().optional(),
        OverallAway: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const rawTimelineEvent = z
  .object({
    EventId: z.string().nullable().optional(),
    MatchMinute: z.string().nullable().optional(),
    Period: z.number().nullable().optional(),
    IdTeam: z.string().nullable().optional(),
    IdPlayer: z.string().nullable().optional(),
    PlayerName: localized.optional(),
    Type: z.number().nullable().optional(),
    TypeLocalized: localized.optional(),
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
