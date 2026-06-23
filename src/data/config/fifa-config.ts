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
const PROVIDER_DEFAULT = 'auto';
const BASE_URL_DEFAULT = 'https://api.fifa.com/api/v3';
const COMPETITION_ID_DEFAULT = '17';
const SEASON_ID_DEFAULT = '285023';
const COUNTRY_DEFAULT = 'US';

/**
 * R1 fail-soft (per-field `.catch`): a single bad build-time env var must NEVER
 * throw a synchronous `ZodError` at module eval — that would blank the whole SPA
 * before React mounts. Each field independently falls back to its default when
 * the override is malformed, so one junk value (e.g. an unknown provider or a
 * non-URL base) cannot discard the other valid overrides.
 *
 * `country` still defaults to `'US'` and is ALWAYS emitted unless explicitly set
 * to an empty string — `z.string().catch` keeps a valid `''` intact (the only
 * way to drop `?country=`); an unset env resolves to the `'US'` default.
 */
const FifaConfigSchema = z.object({
  provider: z.enum(['auto', 'fifa', 'mock']).catch(PROVIDER_DEFAULT),
  baseUrl: z.string().url().catch(BASE_URL_DEFAULT),
  competitionId: z.string().catch(COMPETITION_ID_DEFAULT),
  seasonId: z.string().catch(SEASON_ID_DEFAULT),
  country: z.string().catch(COUNTRY_DEFAULT),
});

export type FifaConfig = z.infer<typeof FifaConfigSchema>;

/**
 * Resolve a single config field, applying the field default when the env var is
 * unset (`undefined`). The schema's per-field `.catch` then repairs any malformed
 * *present* value, so the parse below cannot throw.
 */
function envOrDefault(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

const rawInput = {
  provider: envOrDefault(import.meta.env.VITE_FIFA_PROVIDER, PROVIDER_DEFAULT),
  baseUrl: envOrDefault(import.meta.env.VITE_FIFA_BASE_URL, BASE_URL_DEFAULT),
  competitionId: envOrDefault(import.meta.env.VITE_FIFA_COMPETITION_ID, COMPETITION_ID_DEFAULT),
  seasonId: envOrDefault(import.meta.env.VITE_FIFA_SEASON_ID, SEASON_ID_DEFAULT),
  // `country` is the one field where an explicit `''` is meaningful (drops the
  // param), so it must NOT collapse to the default when present-but-empty — only
  // an unset (`undefined`) env falls back to `'US'`.
  country: import.meta.env.VITE_FIFA_COUNTRY ?? COUNTRY_DEFAULT,
};

/**
 * Parsed ONCE at module eval. With per-field `.catch` the parse always resolves a
 * complete, valid config — never a throw. When DEV and a present override was
 * repaired (the parsed value differs from the raw input), warn so a build-time
 * typo is visible in development; production stays silent (no-console rule).
 */
export const fifaConfig: FifaConfig = FifaConfigSchema.parse(rawInput);

if (import.meta.env.DEV) {
  for (const key of Object.keys(rawInput) as (keyof FifaConfig)[]) {
    if (rawInput[key] !== fifaConfig[key]) {
      // eslint-disable-next-line no-console
      console.warn(
        `[fifa-config] Invalid VITE_FIFA_${key
          .replace(/([A-Z])/g, '_$1')
          .toUpperCase()} value "${rawInput[key]}" — falling back to "${fifaConfig[key]}".`,
      );
    }
  }
}
