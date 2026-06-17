import { z } from 'zod';

/** FIFA localizes text as an array of {Locale, Description}. */
const localized = z.array(z.object({ Locale: z.string(), Description: z.string() }));

const rawTeam = z
  .object({
    IdTeam: z.string().nullable().optional(),
    IdCountry: z.string().nullable().optional(),
    PictureUrl: z.string().nullable().optional(),
    TeamName: localized.optional(),
  })
  .passthrough();

const rawStadium = z
  .object({
    Name: localized.optional(),
    CityName: localized.optional(),
  })
  .passthrough();

export const rawMatchSchema = z
  .object({
    IdMatch: z.string(),
    MatchNumber: z.number().nullable().optional(),
    MatchDay: z.number().nullable().optional(),
    StageName: localized.optional(),
    GroupName: localized.optional(),
    Home: rawTeam.nullable().optional(),
    Away: rawTeam.nullable().optional(),
    HomeTeamScore: z.number().nullable().optional(),
    AwayTeamScore: z.number().nullable().optional(),
    HomeTeamPenaltyScore: z.number().nullable().optional(),
    AwayTeamPenaltyScore: z.number().nullable().optional(),
    Date: z.string(),
    LocalDate: z.string().nullable().optional(),
    MatchStatus: z.number(),
    MatchTime: z.string().nullable().optional(),
    Winner: z.string().nullable().optional(),
    PlaceHolderA: z.string().nullable().optional(),
    PlaceHolderB: z.string().nullable().optional(),
    Stadium: rawStadium.nullable().optional(),
  })
  .passthrough();

export const rawMatchesResponseSchema = z
  .object({
    Results: z.array(rawMatchSchema).nullable().optional(),
    ContinuationToken: z.string().nullable().optional(),
  })
  .passthrough();

export type RawMatch = z.infer<typeof rawMatchSchema>;
export type RawMatchesResponse = z.infer<typeof rawMatchesResponseSchema>;
