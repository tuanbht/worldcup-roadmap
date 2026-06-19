import { z } from 'zod';

/**
 * Fail loudly if this module is evaluated in a browser context (CR-8). It reads
 * `process.env` at module-eval and lives under `src/`, so an accidental client
 * import would otherwise crash the SPA with a cryptic `process is not defined`.
 * A defined `window` (the SPA bundle's tell-tale global) or a missing `process`
 * both mean "not the server" — throw a clear, descriptive error at the boundary.
 */
function assertServerContext(): void {
  const inBrowser = typeof window !== 'undefined';
  const noNodeProcess = typeof process === 'undefined';
  if (inBrowser || noNodeProcess) {
    throw new Error(
      'env.ts is a server-only module — do not import from client code. It reads ' +
        'process.env at load time and will crash the browser bundle.',
    );
  }
}

assertServerContext();

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
