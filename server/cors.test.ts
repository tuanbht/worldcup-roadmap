// Node environment (the global vitest default).
//
// CR-7: origin-restricted CORS, opt-in via CORS_ALLOWED_ORIGIN. `buildCorsMiddleware`
// is the pure gate extracted from server/index.ts so it is testable without
// booting serve(). We mount it (when non-null) on a throwaway Hono app and assert
// the Access-Control-Allow-Origin header via app.request() with an Origin header.
//
// Deterministic: no network, no serve(), no process.env mutation — the configured
// origin is passed directly into the builder per case, keeping cases parallel-safe.
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { buildCorsMiddleware } from './cors';

const ALLOWED_ORIGIN = 'https://app.example.com';
const OTHER_ORIGIN = 'https://evil.example.com';
const ACAO = 'access-control-allow-origin';

/**
 * Build a tiny `/api/*` app, conditionally applying the middleware the gate
 * returns, then issue a GET with the given (optional) request Origin header.
 *
 * @param configuredOrigin value of CORS_ALLOWED_ORIGIN (undefined = opt-out)
 * @param requestOrigin    Origin header on the incoming request (undefined = none)
 */
async function requestApi(
  configuredOrigin: string | undefined,
  requestOrigin?: string,
): Promise<Response> {
  const app = new Hono();
  const middleware = buildCorsMiddleware(configuredOrigin);
  if (middleware) app.use('/api/*', middleware);
  app.get('/api/worldcup', (c) => c.json({ ok: true }));

  const headers = requestOrigin ? { Origin: requestOrigin } : undefined;
  return app.request('/api/worldcup', { headers });
}

describe('buildCorsMiddleware (CR-7 opt-in origin-restricted CORS)', () => {
  describe('gate behavior (env value → middleware or null)', () => {
    it('returns null when CORS_ALLOWED_ORIGIN is unset (undefined)', () => {
      expect(buildCorsMiddleware(undefined)).toBeNull();
    });

    it.each([
      { label: 'empty string', value: '' },
      { label: 'whitespace-only string', value: '   ' },
    ])('returns null for $label (treated as unset)', ({ value }) => {
      expect(buildCorsMiddleware(value)).toBeNull();
    });

    it('returns a usable middleware handler when a real origin is configured', () => {
      const middleware = buildCorsMiddleware(ALLOWED_ORIGIN);

      expect(middleware).not.toBeNull();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('#4 unset → no ACAO header (default unchanged, no security regression)', () => {
    it.each([
      { label: 'undefined', value: undefined },
      { label: 'empty string', value: '' },
      { label: 'whitespace-only string', value: '   ' },
    ])('omits Access-Control-Allow-Origin on /api/* when origin is $label', async ({ value }) => {
      const res = await requestApi(value, ALLOWED_ORIGIN);

      expect(res.status).toBe(200);
      expect(res.headers.get(ACAO)).toBeNull();
    });
  });

  describe('#5 set → matching origin echoed, every other origin denied', () => {
    it('echoes exactly the configured origin when the request Origin matches', async () => {
      const res = await requestApi(ALLOWED_ORIGIN, ALLOWED_ORIGIN);

      expect(res.status).toBe(200);
      expect(res.headers.get(ACAO)).toBe(ALLOWED_ORIGIN);
    });

    it('does not grant ACAO to a different (untrusted) origin', async () => {
      const res = await requestApi(ALLOWED_ORIGIN, OTHER_ORIGIN);

      // hono/cors echoes ACAO only on an exact match; a mismatch leaves it
      // absent — never echoing the attacker-controlled origin.
      expect(res.headers.get(ACAO)).not.toBe(OTHER_ORIGIN);
      expect(res.headers.get(ACAO)).toBeNull();
    });

    it('never echoes a wildcard when the request carries no Origin header', async () => {
      const res = await requestApi(ALLOWED_ORIGIN, undefined);

      // A same-origin / non-browser request (no Origin) must not receive `*`,
      // which would re-open the cross-origin hole the opt-in is meant to close.
      expect(res.headers.get(ACAO)).not.toBe('*');
    });
  });
});
