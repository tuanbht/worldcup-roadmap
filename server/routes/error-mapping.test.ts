// Node environment (the global vitest default).
//
// CR-6: `toHttpStatus(n)` is the runtime narrow that replaces the unsound
// `as 429 | 500 | 502` cast in worldcup.ts / match-detail.ts. It must return a
// valid Hono ContentfulStatusCode unchanged when in range, and degrade to 500
// for anything outside the accepted set — never a type lie.
//
// Hono's accepted set is an explicit enumeration with GAPS, not a contiguous
// 100..599 range (e.g. 419/420/512 are not valid status codes). These tests pin
// SET-membership semantics, so a naive range check `n >= 100 && n <= 599` would
// fail them.
import { describe, expect, it } from 'vitest';
import { toHttpStatus } from './error-mapping';

const FALLBACK = 500;
// The only statuses the two routes actually emit (RateLimitError→429,
// Repository/ValidationError→502, unexpected→500). All are contentful.
const ROUTE_EMITTED_STATUSES = [429, 500, 502] as const;

describe('toHttpStatus (CR-6 runtime status narrow)', () => {
  describe('in-range passthrough (valid contentful status → unchanged)', () => {
    it.each([
      { label: '100 Continue (lowest contentful info code)', n: 100 },
      { label: '200 OK', n: 200 },
      { label: '418 I am a teapot', n: 418 },
      { label: '429 Too Many Requests (RateLimitError)', n: 429 },
      { label: '500 Internal Server Error (unexpected)', n: 500 },
      { label: '502 Bad Gateway (RepositoryError/ValidationError)', n: 502 },
      { label: '511 Network Authentication Required (highest server code)', n: 511 },
    ])('returns $label unchanged', ({ n }) => {
      expect(toHttpStatus(n)).toBe(n);
    });

    it('passes through every status the routes actually emit (429/500/502)', () => {
      const passed = ROUTE_EMITTED_STATUSES.map(toHttpStatus);
      expect(passed).toEqual([...ROUTE_EMITTED_STATUSES]);
    });
  });

  describe('contentless statuses → 500 (call sites always send a JSON body)', () => {
    // The routes pass a `fail(...)` / `ok(...)` body, so the helper narrows to
    // ContentfulStatusCode; the four contentless codes are excluded from that set.
    it.each([
      { label: '101 Switching Protocols', n: 101 },
      { label: '204 No Content', n: 204 },
      { label: '205 Reset Content', n: 205 },
      { label: '304 Not Modified', n: 304 },
    ])('degrades $label to 500', ({ n }) => {
      expect(toHttpStatus(n)).toBe(FALLBACK);
    });
  });

  describe('out-of-set / invalid → 500 fallback', () => {
    it.each([
      { label: 'zero', n: 0 },
      { label: 'negative', n: -1 },
      { label: 'below the HTTP range', n: 99 },
      { label: 'above the HTTP range', n: 600 },
      { label: 'absurdly large', n: 200000 },
      // In numeric range but NOT a real status code — only a set check catches
      // these; a `100 <= n <= 599` range check would wrongly pass them through.
      { label: 'in-range but unassigned (419)', n: 419 },
      { label: 'in-range but unassigned (420)', n: 420 },
      { label: 'in-range but unassigned (512)', n: 512 },
      { label: 'NaN', n: Number.NaN },
      { label: 'positive Infinity', n: Number.POSITIVE_INFINITY },
      { label: 'a fractional non-status', n: 418.5 },
    ])('degrades $label to 500', ({ n }) => {
      expect(toHttpStatus(n)).toBe(FALLBACK);
    });
  });
});
