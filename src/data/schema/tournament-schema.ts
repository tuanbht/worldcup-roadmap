import { z } from 'zod';
import type { Tournament } from '@/domain/types';

const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  flagUrl: z.string().nullable(),
});

const teamRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('team'), team: teamSchema }),
  z.object({ kind: z.literal('placeholder'), label: z.string() }),
]);

const scoreSchema = z.object({
  home: z.number().nullable(),
  away: z.number().nullable(),
  penaltyHome: z.number().nullable(),
  penaltyAway: z.number().nullable(),
  resolution: z.enum(['regular', 'extra_time', 'penalties']).nullable(),
  winner: z.enum(['home', 'away', 'draw']).nullable(),
});

const stageSchema = z.enum([
  'GROUP_STAGE',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
]);

const matchSchema = z.object({
  id: z.string(),
  providerMatchId: z.string(),
  stage: stageSchema,
  group: z.string().nullable(),
  matchday: z.number().nullable(),
  home: teamRefSchema,
  away: teamRefSchema,
  score: scoreSchema,
  kickoff: z.string(),
  status: z.enum(['scheduled', 'live', 'finished']),
  minute: z.number().nullable(),
  venue: z.object({ name: z.string().nullable(), city: z.string().nullable() }),
});

const standingRowSchema = z.object({
  position: z.number(),
  team: teamSchema,
  played: z.number(),
  won: z.number(),
  draw: z.number(),
  lost: z.number(),
  goalsFor: z.number(),
  goalsAgainst: z.number(),
  goalDifference: z.number(),
  points: z.number(),
  form: z.array(z.enum(['W', 'D', 'L'])),
  qualified: z.boolean(),
});

const groupSchema = z.object({ name: z.string(), table: z.array(standingRowSchema) });

const slotSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('group'), position: z.string() }),
  z.object({ kind: z.literal('winnerOf'), matchId: z.string() }),
  z.object({ kind: z.literal('loserOf'), matchId: z.string() }),
]);

const bracketSlotSchema = z.object({
  side: z.enum(['home', 'away']),
  source: slotSourceSchema,
  team: teamRefSchema,
});

const knockoutStageSchema = z.enum([
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
]);

const bracketNodeSchema = z.object({
  matchId: z.string(),
  stage: knockoutStageSchema,
  slotIndex: z.number(),
  home: bracketSlotSchema,
  away: bracketSlotSchema,
});

const bracketSchema = z.object({
  rounds: z.array(
    z.object({
      stage: knockoutStageSchema,
      label: z.string(),
      nodes: z.array(bracketNodeSchema),
    }),
  ),
});

export const tournamentSchema = z.object({
  meta: z.object({
    id: z.literal('WC-2026'),
    name: z.string(),
    season: z.number(),
    provider: z.enum(['fifa', 'mock', 'football-data', 'api-football']),
    fetchedAt: z.string(),
  }),
  teams: z.array(teamSchema),
  matches: z.array(matchSchema),
  groups: z.array(groupSchema),
  bracket: bracketSchema,
});

/** Validate an untrusted value as a Tournament, throwing on mismatch. */
export function parseTournament(value: unknown): Tournament {
  return tournamentSchema.parse(value) as Tournament;
}
