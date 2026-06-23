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

// Part 1 (Batch G): origin ALLOWLIST inputs for the extended builder.
const SPA_ORIGIN = 'https://spa.example.com';
const PROD_ORIGIN = 'https://roadmap.example.com';
const DISALLOWED_ORIGIN = 'https://attacker.example.com';

// The extended builder accepts either the legacy bare string|undefined OR a
// config object carrying the single (legacy) var and the comma-separated
// allowlist var. Declared as a structural type here so these RED tests bind to
// the behavioural contract, not an incidental exported name.
type CorsBuilderInput =
  | string
  | undefined
  | { readonly single?: string | undefined; readonly allowlist?: string | undefined };

/**
 * Build a tiny `/api/*` app, conditionally applying the middleware the gate
 * returns, then issue a GET with the given (optional) request Origin header.
 *
 * The `config` is threaded into `buildCorsMiddleware` UNCAST — so the legacy
 * bare-string AND the `{ single, allowlist }` object reach the builder exactly
 * as a real caller (`server/index.ts`) would pass them. (An earlier draft cast
 * the object to `string | undefined`, hiding the object branch from the type
 * checker; binding to the true `string | CorsOriginConfig | undefined` contract
 * keeps these tests honest about what the implementer must accept.)
 *
 * @param config        value passed to buildCorsMiddleware (legacy string or
 *                      `{ single, allowlist }` config object)
 * @param requestOrigin Origin header on the incoming request (undefined = none)
 */
async function requestApi(config: CorsBuilderInput, requestOrigin?: string): Promise<Response> {
  const app = new Hono();
  const middleware = buildCorsMiddleware(config);
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

  // Part 1 (Batch G): extend the builder to an origin ALLOWLIST while keeping
  // the legacy single-origin var working (back-compat) and the unset→null default.
  describe('origin allowlist via CORS_ALLOWED_ORIGINS (comma-separated)', () => {
    describe('gate: both vars unset/empty → null (no-CORS default preserved)', () => {
      it('returns null when neither single nor allowlist is set', () => {
        expect(buildCorsMiddleware({ single: undefined, allowlist: undefined })).toBeNull();
      });

      it('returns null when allowlist is empty / whitespace-only and single is unset', () => {
        expect(buildCorsMiddleware({ single: undefined, allowlist: '   ' })).toBeNull();
        expect(buildCorsMiddleware({ single: '', allowlist: ',  ,' })).toBeNull();
      });
    });

    describe('back-compat: legacy single CORS_ALLOWED_ORIGIN still works', () => {
      it('accepts the legacy single origin passed via { single }', async () => {
        const res = await requestApi({ single: ALLOWED_ORIGIN }, ALLOWED_ORIGIN);

        expect(res.status).toBe(200);
        expect(res.headers.get(ACAO)).toBe(ALLOWED_ORIGIN);
      });

      it('still denies a non-matching origin under the legacy single var', async () => {
        const res = await requestApi({ single: ALLOWED_ORIGIN }, OTHER_ORIGIN);

        expect(res.headers.get(ACAO)).toBeNull();
      });
    });

    describe('allowlist accept/reject (single origin)', () => {
      it('echoes ACAO for a single-entry allowlist on an exact match', async () => {
        const res = await requestApi({ allowlist: SPA_ORIGIN }, SPA_ORIGIN);

        expect(res.status).toBe(200);
        expect(res.headers.get(ACAO)).toBe(SPA_ORIGIN);
      });

      it('denies a non-member when the allowlist has a single entry', async () => {
        const res = await requestApi({ allowlist: SPA_ORIGIN }, DISALLOWED_ORIGIN);

        expect(res.headers.get(ACAO)).toBeNull();
      });
    });

    describe('allowlist accept/reject (multiple origins)', () => {
      it('echoes ACAO for the FIRST listed origin on an exact match', async () => {
        const res = await requestApi({ allowlist: `${SPA_ORIGIN},${PROD_ORIGIN}` }, SPA_ORIGIN);

        expect(res.status).toBe(200);
        expect(res.headers.get(ACAO)).toBe(SPA_ORIGIN);
      });

      it('echoes ACAO for the SECOND listed origin on an exact match', async () => {
        const res = await requestApi({ allowlist: `${SPA_ORIGIN},${PROD_ORIGIN}` }, PROD_ORIGIN);

        expect(res.status).toBe(200);
        expect(res.headers.get(ACAO)).toBe(PROD_ORIGIN);
      });

      it('denies (no ACAO) an origin absent from the allowlist', async () => {
        const res = await requestApi(
          { allowlist: `${SPA_ORIGIN},${PROD_ORIGIN}` },
          DISALLOWED_ORIGIN,
        );

        expect(res.headers.get(ACAO)).not.toBe(DISALLOWED_ORIGIN);
        expect(res.headers.get(ACAO)).toBeNull();
      });

      it('ignores empty / whitespace entries in the list', async () => {
        const res = await requestApi(
          { allowlist: `${SPA_ORIGIN}, , ${PROD_ORIGIN} ,` },
          PROD_ORIGIN,
        );

        // Trimmed + de-junked: PROD_ORIGIN is still a real member.
        expect(res.headers.get(ACAO)).toBe(PROD_ORIGIN);
      });

      it('does not echo a wildcard to a disallowed allowlist request', async () => {
        const res = await requestApi(
          { allowlist: `${SPA_ORIGIN},${PROD_ORIGIN}` },
          DISALLOWED_ORIGIN,
        );

        expect(res.headers.get(ACAO)).not.toBe('*');
      });

      it('never grants a wildcard to an allowlist request that carries no Origin header', async () => {
        // A non-browser / same-origin GET (no Origin) must not be answered with
        // `*` under the allowlist any more than under the legacy single var.
        const res = await requestApi({ allowlist: `${SPA_ORIGIN},${PROD_ORIGIN}` }, undefined);

        expect(res.headers.get(ACAO)).not.toBe('*');
      });

      it('tolerates a duplicate origin in the list (dedupe does not break the match)', async () => {
        // Repeated entries are deduped to a single member; an exact match is
        // still echoed exactly once, never a comma-joined value.
        const res = await requestApi(
          { allowlist: `${SPA_ORIGIN},${SPA_ORIGIN},${PROD_ORIGIN}` },
          SPA_ORIGIN,
        );

        expect(res.headers.get(ACAO)).toBe(SPA_ORIGIN);
      });

      it('echoes only the requesting member, not a comma-joined origin list', async () => {
        // Defensive: a naive `origin: list.join(',')` would echo the whole list;
        // assert the single requesting origin is returned verbatim.
        const res = await requestApi({ allowlist: `${SPA_ORIGIN},${PROD_ORIGIN}` }, PROD_ORIGIN);

        const acao = res.headers.get(ACAO);
        expect(acao).toBe(PROD_ORIGIN);
        expect(acao).not.toContain(',');
      });
    });

    describe('union: legacy single + allowlist both honored when both set', () => {
      it('accepts an origin from the allowlist when single is also set', async () => {
        const res = await requestApi({ single: ALLOWED_ORIGIN, allowlist: SPA_ORIGIN }, SPA_ORIGIN);

        expect(res.headers.get(ACAO)).toBe(SPA_ORIGIN);
      });

      it('still accepts the legacy single origin when an allowlist is also present', async () => {
        const res = await requestApi(
          { single: ALLOWED_ORIGIN, allowlist: SPA_ORIGIN },
          ALLOWED_ORIGIN,
        );

        expect(res.headers.get(ACAO)).toBe(ALLOWED_ORIGIN);
      });
    });
  });
});
