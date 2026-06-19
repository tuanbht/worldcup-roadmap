// Node environment (the global vitest default).
//
// CR-8: env.ts reads process.env at module-eval and lives under src/. A client
// bundle importing it would crash the SPA with a cryptic `process is not defined`.
// The guard must instead throw a clear, descriptive "server-only" error when the
// module is evaluated in a browser context (window defined / process undefined).
//
// The guard fires at module-eval, so each case must `vi.resetModules()` and stub
// globals BEFORE the dynamic `import('./env')`, then restore globals afterwards —
// otherwise a cached module instance hides the throw / leaks into sibling suites.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_MODULE = './env';

/**
 * Force a fresh module-eval of `./env` so its top-level server-only guard runs
 * against whatever globals the current case has stubbed. `vi.resetModules()` in
 * `beforeEach` clears any cached instance from a prior case; this just imports.
 */
function importEnvModule(): Promise<typeof import('./env')> {
  return import(ENV_MODULE);
}

/** Simulate a browser by defining `window` (the SPA bundle's tell-tale global). */
function withWindowGlobal(): void {
  vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);
}

/** Simulate a non-Node runtime by removing the `process` global entirely. */
function withoutProcessGlobal(): void {
  vi.stubGlobal('process', undefined);
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('env server-only guard (CR-8)', () => {
  describe('#7 browser context → loud, descriptive server-only error', () => {
    it('rejects the import with a server-only error when a window global is present', async () => {
      withWindowGlobal();

      await expect(importEnvModule()).rejects.toThrow(/server-only/i);
    });

    it('rejects the import with a server-only error when process is undefined (no Node global)', async () => {
      withoutProcessGlobal();

      // Must throw the descriptive guard error, NOT a raw `Cannot read
      // properties of undefined` from a later `process.env` read — proving the
      // guard runs before any env access.
      await expect(importEnvModule()).rejects.toThrow(/server-only/i);
    });

    it('names the client-import mistake so the dev knows what to fix', async () => {
      withWindowGlobal();

      await expect(importEnvModule()).rejects.toThrow(/do not import from client/i);
    });

    it('throws a real Error instance (not a string or bare reject)', async () => {
      withWindowGlobal();

      await expect(importEnvModule()).rejects.toBeInstanceOf(Error);
    });
  });

  describe('#8 server context → existing behavior unchanged', () => {
    it('imports successfully and exposes a frozen-shaped, validated env object', async () => {
      const { env } = await importEnvModule();

      expect(env).toBeDefined();
      expect(typeof env).toBe('object');
    });

    it('keeps the schema defaults intact (provider pinned to mock; FIFA + TTL defaults applied)', async () => {
      const { env } = await importEnvModule();

      // vitest.config pins WC_PROVIDER=mock; every default-bearing var must still
      // resolve to its schema default, proving validation/coercion still runs.
      expect(env.WC_PROVIDER).toBe('mock');
      expect(env.WC_FIFA_COMPETITION_ID).toBe('17');
      expect(env.WC_FIFA_SEASON_ID).toBe('285023');
      expect(env.WC_FIFA_COUNTRY).toBe('US');
      expect(env.WC_CACHE_TTL_LIVE_MS).toBe(30_000);
      expect(env.WC_CACHE_TTL_IDLE_MS).toBe(600_000);
    });

    it('coerces every TTL var to a positive integer', async () => {
      const { env } = await importEnvModule();

      for (const ttl of [
        env.WC_CACHE_TTL_LIVE_MS,
        env.WC_CACHE_TTL_IDLE_MS,
        env.WC_CACHE_TTL_DETAIL_LIVE_MS,
        env.WC_CACHE_TTL_DETAIL_IDLE_MS,
      ]) {
        expect(Number.isInteger(ttl)).toBe(true);
        expect(ttl).toBeGreaterThan(0);
      }
    });

    it('still enforces validation (a non-numeric TTL is rejected by the Zod schema)', async () => {
      vi.stubEnv('WC_CACHE_TTL_LIVE_MS', 'not-a-number');

      await expect(importEnvModule()).rejects.toThrow();
    });

    it('still enforces validation (an out-of-enum provider is rejected)', async () => {
      vi.stubEnv('WC_PROVIDER', 'bogus-provider');

      await expect(importEnvModule()).rejects.toThrow();
    });
  });
});
