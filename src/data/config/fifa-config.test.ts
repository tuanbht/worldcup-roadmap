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

describe('fifaConfig — boundary / invalid input (fail-soft, never throws)', () => {
  it('falls back to provider "auto" for an unknown VITE_FIFA_PROVIDER without throwing (R1)', async () => {
    // R1 fail-soft: an invalid VITE_FIFA_PROVIDER (a build-time typo) must NOT
    // throw a synchronous ZodError at module eval (which would blank the whole
    // SPA before React mounts). Instead it resolves to the safe default 'auto'
    // and the rest of the config stays valid.
    stubFifaEnv({ VITE_FIFA_PROVIDER: 'bogus-provider' });

    // Importing the module must RESOLVE (not reject) — the parse no longer throws.
    const config = await loadConfig();

    expect(config.provider).toBe('auto');
    // The junk value must never be honored verbatim.
    expect(config.provider).not.toBe('bogus-provider');
    // The rest of the config still resolves to its defaults (not lost to the throw).
    expect(config.competitionId).toBe('17');
    expect(config.seasonId).toBe('285023');
  });

  it('does not reject at module eval for a bad provider (inverts the old throwing contract)', async () => {
    stubFifaEnv({ VITE_FIFA_PROVIDER: 'bogus-provider' });
    // Explicit RED-anchor: module import resolves to a config object, never rejects.
    await expect(loadConfig()).resolves.toMatchObject({ provider: 'auto' });
  });

  it('falls back per-field: a non-URL VITE_FIFA_BASE_URL reverts to the default base while other valid overrides hold (R1 AC5)', async () => {
    // Per-field .catch(): one bad field must NOT discard every other valid
    // override. A junk baseUrl reverts to the FIFA v3 default, yet a valid
    // competitionId/seasonId override is still honored.
    stubFifaEnv({
      VITE_FIFA_BASE_URL: 'not-a-valid-url',
      VITE_FIFA_COMPETITION_ID: '999',
      VITE_FIFA_SEASON_ID: '424242',
    });

    const config = await loadConfig();

    expect(config.baseUrl).toBe('https://api.fifa.com/api/v3');
    expect(config.competitionId).toBe('999');
    expect(config.seasonId).toBe('424242');
  });

  it('repairs MULTIPLE bad fields independently while still honoring the valid ones (per-field isolation)', async () => {
    // Two bad fields at once (bogus provider + non-URL base) must EACH fall back to
    // their own default without taking down the other valid overrides — proving the
    // .catch() is per-field, not an all-or-nothing parse.
    stubFifaEnv({
      VITE_FIFA_PROVIDER: 'bogus-provider',
      VITE_FIFA_BASE_URL: 'not-a-valid-url',
      VITE_FIFA_COMPETITION_ID: '999',
      VITE_FIFA_COUNTRY: 'GB',
    });

    const config = await loadConfig();

    expect(config.provider).toBe('auto'); // bad → default
    expect(config.baseUrl).toBe('https://api.fifa.com/api/v3'); // bad → default
    expect(config.competitionId).toBe('999'); // valid → honored
    expect(config.country).toBe('GB'); // valid → honored
    // Untouched field keeps its own default (not collapsed by the bad neighbours).
    expect(config.seasonId).toBe('285023');
  });

  it('emits a dev-only console.warn naming the repaired field on fallback (AC4)', async () => {
    // AC4: the fail-soft path must surface the misconfiguration in development
    // (dev-gated warn) so a build-time typo is visible — but never throw. We spy on
    // console.warn (restored in afterEach via restoreAllMocks-equivalent below) and
    // assert it names the offending VITE_FIFA_PROVIDER and the value it repaired.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      stubFifaEnv({ VITE_FIFA_PROVIDER: 'bogus-provider' });
      await loadConfig();

      expect(warnSpy).toHaveBeenCalled();
      const warned = warnSpy.mock.calls.flat().join(' ');
      expect(warned).toContain('VITE_FIFA_PROVIDER');
      expect(warned).toContain('bogus-provider');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('stays silent (no warn) when every present override is valid', async () => {
    // The dev-warn must fire ONLY on a repaired field — a fully-valid config must
    // not spam the console.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      stubFifaEnv({ VITE_FIFA_PROVIDER: 'fifa', VITE_FIFA_COMPETITION_ID: '999' });
      const config = await loadConfig();

      expect(config.provider).toBe('fifa');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
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
