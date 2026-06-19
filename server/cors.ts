import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';

/**
 * Build origin-restricted CORS middleware for `/api/*`, gated on the
 * `CORS_ALLOWED_ORIGIN` opt-in (CR-7).
 *
 * Returns `null` when the configured origin is unset/empty/whitespace — the
 * default same-origin posture, byte-identical to registering nothing (no CORS
 * headers, no security regression). When a real origin is given, returns
 * `cors({ origin })`, which echoes `Access-Control-Allow-Origin` ONLY on an
 * exact request-Origin match — a different origin is never granted access.
 *
 * GET-only `allowMethods` matches the route surface (the API is read-only).
 */
export function buildCorsMiddleware(origin: string | undefined): MiddlewareHandler | null {
  const trimmed = origin?.trim();
  if (!trimmed) return null;
  return cors({ origin: trimmed, allowMethods: ['GET'] });
}
