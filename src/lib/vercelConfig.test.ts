// Node environment (global vitest default). Asserts the committed `vercel.json`
// static-hosting config (requirement 1044, §1): immutable long-lived caching for
// Vite-hashed assets, the four security headers, and a CSP that allowlists the
// two FIFA origins the browser fetches directly — without breaking the Vite
// bundle's own script/style loading. Reading the file from disk and asserting on
// its parsed shape keeps this deterministic (no network, no build).
//
// RED until `vercel.json` is created at the repo root.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vercelJsonPath = path.join(repoRoot, 'vercel.json');

const FIFA_ORIGINS = ['api.fifa.com', 'digitalhub.fifa.com'] as const;
/** A week, in seconds — the floor for "very long" immutable asset caching. */
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

interface VercelHeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}
interface VercelConfig {
  headers?: VercelHeaderRule[];
}

/**
 * Load + parse `vercel.json`. Tolerant of an absent file so describe-level
 * setup doesn't throw at collection time (the per-`it` assertions then fail
 * loudly with a clear "missing config" reason instead of a collection error).
 */
function loadVercelConfig(): VercelConfig {
  try {
    return JSON.parse(readFileSync(vercelJsonPath, 'utf8')) as VercelConfig;
  } catch {
    return { headers: [] };
  }
}

/** Collect every header (key→value) that applies to a given source-matching rule. */
function headersForSource(config: VercelConfig, predicate: (source: string) => boolean) {
  const map: Record<string, string> = {};
  for (const rule of config.headers ?? []) {
    if (!predicate(rule.source)) continue;
    for (const h of rule.headers) map[h.key.toLowerCase()] = h.value;
  }
  return map;
}

const isAssetSource = (source: string) => source.includes('/assets');
/** The catch-all / global rule is any rule that is NOT the narrower /assets one. */
const isGlobalSource = (source: string) => !isAssetSource(source);

/** Pull a single CSP directive's value (the tokens after its name). */
function cspDirective(csp: string, name: string): string {
  const match = csp.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]+)`));
  return match?.[1]?.trim() ?? '';
}

describe('vercel.json — exists and is valid JSON', () => {
  it('must parse the committed file (not the empty fallback) with a non-empty headers array', () => {
    // Asserting the file truly parses from disk — readFileSync throwing would
    // surface here rather than being swallowed by the tolerant loader.
    const raw = (() => {
      try {
        return readFileSync(vercelJsonPath, 'utf8');
      } catch {
        return '';
      }
    })();
    expect(raw.length).toBeGreaterThan(0);
    const config = JSON.parse(raw === '' ? '{}' : raw) as VercelConfig;
    expect(Array.isArray(config.headers)).toBe(true);
    expect((config.headers ?? []).length).toBeGreaterThan(0);
  });
});

describe('vercel.json — immutable caching for Vite-hashed assets', () => {
  const assetHeaders = headersForSource(loadVercelConfig(), isAssetSource);

  it('sets an immutable, long max-age Cache-Control on /assets/(.*)', () => {
    const cacheControl = assetHeaders['cache-control'];
    expect(cacheControl).toBeDefined();
    expect(cacheControl).toContain('immutable');
    expect(cacheControl).toContain('public');

    const maxAgeMatch = cacheControl?.match(/max-age=(\d+)/);
    expect(maxAgeMatch).not.toBeNull();
    // At minimum "very long" — more than a week of seconds (Vite hashes bust it).
    expect(Number(maxAgeMatch?.[1])).toBeGreaterThan(ONE_WEEK_SECONDS);
  });
});

describe('vercel.json — security headers on the global (/(.*)) route', () => {
  const globalHeaders = headersForSource(loadVercelConfig(), isGlobalSource);

  it('sets Strict-Transport-Security (HSTS) with a max-age', () => {
    const hsts = globalHeaders['strict-transport-security'];
    expect(hsts).toBeDefined();
    expect(hsts).toMatch(/max-age=\d+/);
  });

  it('sets X-Content-Type-Options: nosniff', () => {
    expect(globalHeaders['x-content-type-options']).toBe('nosniff');
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', () => {
    expect(globalHeaders['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('sets X-Frame-Options: DENY', () => {
    expect(globalHeaders['x-frame-options']).toBe('DENY');
  });
});

describe('vercel.json — CSP allowlists FIFA origins without breaking the Vite bundle', () => {
  const globalHeaders = headersForSource(loadVercelConfig(), isGlobalSource);
  const csp = globalHeaders['content-security-policy'] ?? '';

  it('declares a Content-Security-Policy', () => {
    expect(csp.length).toBeGreaterThan(0);
  });

  it('connect-src allows self and both FIFA origins (the browser fetches them directly)', () => {
    const connect = cspDirective(csp, 'connect-src');
    expect(connect).toContain("'self'");
    for (const origin of FIFA_ORIGINS) expect(connect).toContain(origin);
  });

  it('img-src allows self and both FIFA origins (flags/photos load from them)', () => {
    const img = cspDirective(csp, 'img-src');
    expect(img).toContain("'self'");
    for (const origin of FIFA_ORIGINS) expect(img).toContain(origin);
  });

  it('does NOT omit script-src — the Vite bundle must still be allowed to load', () => {
    // Coverage gap guard (plan Risk: "CSP breaking fonts/assets"): a CSP that
    // forgets script-src would silently block the app's own JS. It must be
    // present and allow same-origin self-hosted scripts.
    const scriptSrc = cspDirective(csp, 'script-src');
    expect(scriptSrc.length).toBeGreaterThan(0);
    expect(scriptSrc).toContain("'self'");
  });

  it('style-src allows self + unsafe-inline (Tailwind / React inline styles)', () => {
    // Plan Risk note: style-src 'unsafe-inline' is required for inline styles;
    // omitting it blanks the UI. Assert presence without over-constraining.
    const styleSrc = cspDirective(csp, 'style-src');
    expect(styleSrc).toContain("'self'");
    expect(styleSrc).toContain("'unsafe-inline'");
  });

  it('locks down default-src and object-src to a self/none baseline', () => {
    expect(cspDirective(csp, 'default-src')).toContain("'self'");
    expect(cspDirective(csp, 'object-src')).toContain("'none'");
  });
});
