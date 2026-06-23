// Node environment (global vitest default). Pure-function unit tests for
// `apiUrl` — the single helper that joins VITE_API_BASE_URL (the Hono origin)
// with a relative API path. No network, no React, no fetch.
//
// `apiUrl` reads `import.meta.env.VITE_API_BASE_URL` LAZILY (per the plan), so
// `vi.stubEnv` set inside a test is observed by the call that follows it.
// `vi.unstubAllEnvs()` after each test keeps cases isolated.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl } from './api';

const ORIGIN = 'http://localhost:8787';
const TOURNAMENT_PATH = '/api/worldcup';
const DETAIL_PATH = '/api/worldcup/match/wc2026-fifa-400251/detail';

/** Stub the configured Hono origin, then return what `apiUrl` builds for `path`. */
function urlWithBase(base: string, path: string): string {
  vi.stubEnv('VITE_API_BASE_URL', base);
  return apiUrl(path);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('apiUrl', () => {
  describe('base set (direct absolute origin — the intended prod config)', () => {
    it('joins VITE_API_BASE_URL + path into an absolute URL', () => {
      expect(urlWithBase(ORIGIN, TOURNAMENT_PATH)).toBe('http://localhost:8787/api/worldcup');
    });

    it('joins a deep match-detail path correctly', () => {
      expect(urlWithBase(ORIGIN, DETAIL_PATH)).toBe(
        'http://localhost:8787/api/worldcup/match/wc2026-fifa-400251/detail',
      );
    });

    it('collapses a trailing slash on the base so the join has exactly one slash', () => {
      // No `//` at the boundary, no dropped path segment.
      expect(urlWithBase('http://localhost:8787/', TOURNAMENT_PATH)).toBe(
        'http://localhost:8787/api/worldcup',
      );
    });

    it('normalizes a path missing its leading slash to a single join slash', () => {
      expect(urlWithBase(ORIGIN, 'api/worldcup')).toBe('http://localhost:8787/api/worldcup');
    });

    it('does not double the slash when base has a trailing slash AND path has a leading slash', () => {
      expect(urlWithBase('http://localhost:8787/', '/api/worldcup')).toBe(
        'http://localhost:8787/api/worldcup',
      );
    });

    it('trims surrounding whitespace on the base before joining', () => {
      // A real origin padded by stray whitespace in the env file is still a
      // real origin — trim it, then build the absolute URL (do not fall back).
      expect(urlWithBase('  http://localhost:8787  ', TOURNAMENT_PATH)).toBe(
        'http://localhost:8787/api/worldcup',
      );
    });

    it('builds a stable, idempotent URL across repeated calls (no hidden state)', () => {
      vi.stubEnv('VITE_API_BASE_URL', ORIGIN);

      const first = apiUrl(TOURNAMENT_PATH);
      const second = apiUrl(TOURNAMENT_PATH);

      expect(first).toBe('http://localhost:8787/api/worldcup');
      expect(second).toBe(first);
    });
  });

  describe('base unset / empty (relative fallback — dev proxy still works)', () => {
    it('returns the path unchanged when VITE_API_BASE_URL is unset', () => {
      // No stub: env var absent.
      expect(apiUrl(TOURNAMENT_PATH)).toBe(TOURNAMENT_PATH);
    });

    it.each([
      { label: 'an empty string', base: '' },
      { label: 'a whitespace-only string', base: '   ' },
      { label: 'a tab/newline-only string', base: '\t\n' },
    ])('treats $label base as unset and returns the path unchanged', ({ base }) => {
      expect(urlWithBase(base, TOURNAMENT_PATH)).toBe(TOURNAMENT_PATH);
    });

    it('preserves a deep path verbatim in the fallback case', () => {
      expect(apiUrl(DETAIL_PATH)).toBe(DETAIL_PATH);
    });

    it('preserves a path without a leading slash verbatim in the fallback case', () => {
      // With no base to join against, the path is returned exactly as given —
      // normalization only happens when there is a base to join to.
      expect(apiUrl('api/worldcup')).toBe('api/worldcup');
    });
  });
});
