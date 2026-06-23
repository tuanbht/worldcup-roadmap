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

/**
 * CR-11 — accept an image URL only when it is `https:` (any scheme casing) or
 * relative; degrade everything else to `null` (defense-in-depth against
 * mixed-content and `javascript:`/`data:` injection through `<img src>`).
 * NEVER throws — this preserves the tolerant-but-validating boundary posture.
 *
 * Single rule:
 *  - `null`/`undefined`/empty/whitespace-only -> `null`.
 *  - protocol-relative (`//host/x.png`, after trimming leading whitespace) -> `null`.
 *  - unparseable by `new URL()` (no scheme) -> a RELATIVE url, accepted unchanged.
 *  - parseable absolute url -> accepted unchanged iff `protocol === 'https:'`,
 *    otherwise `null` (rejects `http:`, `javascript:`, `data:`, `ftp:`, …).
 *
 * AF-3 (TIGHTEN) — protocol-relative urls (`//host/x.png`) load from an ARBITRARY
 * host (they inherit the page scheme but not its origin), so for defense-in-depth
 * they are REJECTED to `null`, like `http:`/`javascript:`. A single leading slash
 * (`/path`) is an ordinary same-origin path and stays accepted.
 */
export function sanitizePictureUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  // Reject protocol-relative ("//host/x.png") and network-path ("///…") forms:
  // trim leading whitespace FIRST, then a leading "//" means an arbitrary host.
  if (trimmed.startsWith('//')) return null;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? value : null;
  } catch {
    // No parseable scheme => genuinely-relative URL (/path, ./x, x.png, ?q, #a) => accept.
    return value;
  }
}

/**
 * Image-URL field used for every photo/flag URL the schema exposes. Uses
 * `.transform()` (not `.refine()`) so a rejected URL downgrades to `null`
 * instead of rejecting the whole payload, mirroring the mapper's `?? null`.
 */
const safePictureUrl = z
  .string()
  .nullable()
  .optional()
  .transform((v) => sanitizePictureUrl(v));

const rawPicture = z.object({ PictureUrl: safePictureUrl }).passthrough();

export const rawPlayer = z
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
    // FIFA match status: 3 = in-play (live); 0 = played; other = fixture. Used by
    // the win-probability label (AF-2). Tolerant like every other field;
    // `.passthrough()` already lets it survive — this only types it.
    MatchStatus: z.number().nullable().optional(),
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
