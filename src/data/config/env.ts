import { z } from 'zod';

/**
 * Zod-validated configuration, read from the Node process env (now plain Node,
 * not a Next server runtime). Validates and fails fast on bad config.
 */
const EnvSchema = z.object({
  WC_PROVIDER: z.enum(['auto', 'fifa', 'mock']).default('auto'),
  WC_FIFA_COMPETITION_ID: z.string().default('17'),
  WC_FIFA_SEASON_ID: z.string().default('285023'),
  WC_FIFA_COUNTRY: z.string().default('US'),
  WC_CACHE_TTL_LIVE_MS: z.coerce.number().int().positive().default(30_000),
  WC_CACHE_TTL_IDLE_MS: z.coerce.number().int().positive().default(600_000),
  WC_CACHE_TTL_DETAIL_LIVE_MS: z.coerce.number().int().positive().default(30_000),
  WC_CACHE_TTL_DETAIL_IDLE_MS: z.coerce.number().int().positive().default(600_000),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
