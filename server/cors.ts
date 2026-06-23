import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';

/**
 * Origin allowlist config (Batch G). `single` is the legacy
 * `CORS_ALLOWED_ORIGIN`; `allowlist` is the comma-separated `CORS_ALLOWED_ORIGINS`.
 * The builder also still accepts a bare `string | undefined` for back-compat.
 */
export interface CorsOriginConfig {
  readonly single?: string | undefined;
  readonly allowlist?: string | undefined;
}

/** Split a comma-separated allowlist into trimmed, non-empty origins. */
function parseAllowlist(allowlist: string | undefined): string[] {
  if (!allowlist) return [];
  return allowlist
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Resolve any builder input to a deduped list of allowed origins (untrusted env). */
function resolveOrigins(input: string | CorsOriginConfig | undefined): string[] {
  const config: CorsOriginConfig =
    typeof input === 'string' || input === undefined ? { single: input } : input;

  const single = config.single?.trim();
  const origins = [...(single ? [single] : []), ...parseAllowlist(config.allowlist)];
  return [...new Set(origins)];
}

/**
 * Build origin-restricted CORS middleware for `/api/*`, gated on the
 * `CORS_ALLOWED_ORIGIN` / `CORS_ALLOWED_ORIGINS` opt-in (CR-7 + Batch G).
 *
 * Accepts either the legacy bare `string | undefined` (single origin) OR a
 * `{ single, allowlist }` config object. The legacy single var and the
 * comma-separated allowlist are unioned and deduped into one origin set.
 *
 * Returns `null` when no real origin is configured (all inputs unset/empty/
 * whitespace) — the default same-origin posture, byte-identical to registering
 * nothing (no CORS headers, no security regression). When at least one real
 * origin is given, returns `cors({ origin: [...] })`, which echoes
 * `Access-Control-Allow-Origin` ONLY on an exact request-Origin match — a
 * different origin (and a no-Origin request) is never granted access.
 *
 * GET-only `allowMethods` matches the route surface (the API is read-only).
 */
export function buildCorsMiddleware(
  origin: string | CorsOriginConfig | undefined,
): MiddlewareHandler | null {
  const origins = resolveOrigins(origin);
  if (origins.length === 0) return null;
  return cors({ origin: origins, allowMethods: ['GET'] });
}
