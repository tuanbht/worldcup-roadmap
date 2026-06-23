import { z } from 'zod';

/**
 * Browser-safe, build-time FIFA config (replaces the server-only `env.ts`). Read
 * from `import.meta.env.VITE_FIFA_*` — NOT `process.env` — so it runs in the SPA
 * bundle without a `process is not defined` crash and needs no `window` guard.
 * The FIFA ids/base are public (not secrets), so inlining them at build time is
 * safe.
 *
 * `country` defaults to `'US'` and is ALWAYS emitted as `?country=US` unless
 * `VITE_FIFA_COUNTRY` is explicitly set to an empty string — the only way to drop
 * the param (Review L-B). An unset env therefore differs from an explicit empty.
 */
const FifaConfigSchema = z.object({
  provider: z.enum(['auto', 'fifa', 'mock']).default('auto'),
  baseUrl: z.string().url().default('https://api.fifa.com/api/v3'),
  competitionId: z.string().default('17'),
  seasonId: z.string().default('285023'),
  country: z.string().default('US'),
});

export type FifaConfig = z.infer<typeof FifaConfigSchema>;

/**
 * Parsed ONCE at module eval. `undefined` (env unset) lets the zod default apply
 * — so `country` resolves to `'US'`; an explicit `''` is preserved (param
 * omitted). An unknown `VITE_FIFA_PROVIDER` value fails the enum and throws a
 * clear config error rather than silently honoring junk.
 */
export const fifaConfig: FifaConfig = FifaConfigSchema.parse({
  provider: import.meta.env.VITE_FIFA_PROVIDER,
  baseUrl: import.meta.env.VITE_FIFA_BASE_URL,
  competitionId: import.meta.env.VITE_FIFA_COMPETITION_ID,
  seasonId: import.meta.env.VITE_FIFA_SEASON_ID,
  country: import.meta.env.VITE_FIFA_COUNTRY,
});
