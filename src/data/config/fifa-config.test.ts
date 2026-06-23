// @vitest-environment jsdom
//
// Browser-safe FIFA config (replaces the server-only env.ts). jsdom so a
// `typeof window !== 'undefined'` regression would surface — the successor must
// NOT guard against the browser and must NEVER throw `process is not defined`.
//
// `fifaConfig` is parsed ONCE at module eval from `import.meta.env.VITE_FIFA_*`,
// so each case stubs the env, then dynamically imports a FRESH module copy
// (`vi.resetModules()` + dynamic `import()`), and finally unstubs. No shared
// mutable state between cases — isolation by construction.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FIFA_ENV_KEYS = [
  'VITE_FIFA_PROVIDER',
  'VITE_FIFA_BASE_URL',
  'VITE_FIFA_COMPETITION_ID',
  'VITE_FIFA_SEASON_ID',
  'VITE_FIFA_COUNTRY',
] as const;

interface FifaConfigShape {
  readonly provider: 'auto' | 'fifa' | 'mock';
  readonly baseUrl: string;
  readonly competitionId: string;
  readonly seasonId: string;
  readonly country: string;
}

/** Clear every VITE_FIFA_* key, then apply the per-case overrides. */
function stubFifaEnv(overrides: Partial<Record<(typeof FIFA_ENV_KEYS)[number], string>>): void {
  for (const key of FIFA_ENV_KEYS) {
    // `''` is meaningful for VITE_FIFA_COUNTRY (explicit omission); for the rest
    // an empty stub is equivalent to "unset" as far as the zod default applies,
    // but we only stub a key when the case provides it.
    if (key in overrides) vi.stubEnv(key, overrides[key]!);
  }
}

/** Load a fresh copy of the config module after the env has been stubbed. */
async function loadConfig(): Promise<FifaConfigShape> {
  vi.resetModules();
  const mod = await import('./fifa-config');
  return mod.fifaConfig as FifaConfigShape;
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('fifaConfig — defaults when env unset', () => {
  it('applies the documented defaults (provider auto, comp 17, season 285023, country US)', async () => {
    const config = await loadConfig();

    expect(config.provider).toBe('auto');
    expect(config.competitionId).toBe('17');
    expect(config.seasonId).toBe('285023');
    // L-B: country defaults to 'US' and is ALWAYS present unless explicitly emptied.
    expect(config.country).toBe('US');
  });

  it('defaults baseUrl to the FIFA v3 origin', async () => {
    const config = await loadConfig();
    expect(config.baseUrl).toBe('https://api.fifa.com/api/v3');
  });

  it('never throws "process is not defined" under jsdom (no server-only window guard)', async () => {
    // The successor to env.ts must be browser-safe: no process.env read, no
    // assertServerContext throw. Importing it in a jsdom (window-defined) context
    // must resolve a valid config object, not crash.
    await expect(loadConfig()).resolves.toMatchObject({ provider: 'auto' });
  });
});

describe('fifaConfig — VITE_FIFA_* overrides honored', () => {
  it('honors VITE_FIFA_PROVIDER=mock', async () => {
    stubFifaEnv({ VITE_FIFA_PROVIDER: 'mock' });
    const config = await loadConfig();
    expect(config.provider).toBe('mock');
  });

  it('honors VITE_FIFA_PROVIDER=fifa', async () => {
    stubFifaEnv({ VITE_FIFA_PROVIDER: 'fifa' });
    const config = await loadConfig();
    expect(config.provider).toBe('fifa');
  });

  it('honors competition / season / country / baseUrl overrides', async () => {
    stubFifaEnv({
      VITE_FIFA_COMPETITION_ID: '999',
      VITE_FIFA_SEASON_ID: '424242',
      VITE_FIFA_COUNTRY: 'GB',
      VITE_FIFA_BASE_URL: 'https://example.test/api/v3',
    });
    const config = await loadConfig();

    expect(config.competitionId).toBe('999');
    expect(config.seasonId).toBe('424242');
    expect(config.country).toBe('GB');
    expect(config.baseUrl).toBe('https://example.test/api/v3');
  });
});

describe('fifaConfig — explicit empty country is opt-in omission (L2/L-B)', () => {
  it('resolves country to an empty string when VITE_FIFA_COUNTRY is explicitly ""', async () => {
    // Omission is opt-in: only an EXPLICIT empty string drops ?country=, never the
    // natural default (which is 'US').
    stubFifaEnv({ VITE_FIFA_COUNTRY: '' });
    const config = await loadConfig();
    expect(config.country).toBe('');
  });

  it('distinguishes the UNSET default ("US") from an explicit empty ("") — they are not the same', async () => {
    // The crux of L-B: leaving the env unset must NOT collapse to the same result
    // as setting it empty. Default → 'US' (param always sent); explicit '' → ''
    // (param omitted). Asserting both in one case pins the boundary directly.
    const unset = await loadConfig();
    expect(unset.country).toBe('US');

    vi.unstubAllEnvs();
    stubFifaEnv({ VITE_FIFA_COUNTRY: '' });
    const emptied = await loadConfig();
    expect(emptied.country).toBe('');

    expect(unset.country).not.toBe(emptied.country);
  });
});

describe('fifaConfig — boundary / invalid input', () => {
  it('falls back to the default provider when VITE_FIFA_PROVIDER is an unknown value', async () => {
    // provider is an enum('auto'|'fifa'|'mock'); a junk value must not be honored
    // verbatim. Either zod rejects it (and the module surfaces a clear error) or
    // it resolves to a valid enum member — never the raw junk string.
    stubFifaEnv({ VITE_FIFA_PROVIDER: 'bogus-provider' });
    await expect(loadConfig()).rejects.toBeInstanceOf(Error);
  });

  it('re-parses per import: a second fresh import reflects the newly-stubbed env', async () => {
    // Determinism guard: `fifaConfig` is parsed once at module eval, so two
    // resetModules()+import() cycles with different env must yield different
    // configs (no stale cached parse leaking across cases).
    stubFifaEnv({ VITE_FIFA_COMPETITION_ID: '17' });
    const first = await loadConfig();
    expect(first.competitionId).toBe('17');

    vi.unstubAllEnvs();
    stubFifaEnv({ VITE_FIFA_COMPETITION_ID: '999' });
    const second = await loadConfig();
    expect(second.competitionId).toBe('999');
  });
});
