// @vitest-environment jsdom
//
// Unit tests for the localStorage cache persister (requirement 1044, §3).
//
// The pure-SPA fetches FIFA directly and lost the deleted edge cache; persisting
// the TanStack cache to localStorage restores instant hydration on reload (kills
// the F5 refetch spike) while COMPOSING with — not reverting — the owner's 3s
// gcTime decision. The persister snapshot lifetime is governed by its own
// `maxAge` (24h), which is INDEPENDENT of the 3s in-memory gcTime.
//
// These tests import only `@tanstack/react-query` (installed) + the new module,
// so they fail because the persister is unimplemented (the stub throws
// "not implemented"), NOT because of an unresolved import. The round-trip uses
// the persister's own `persistClient`/`restoreClient` (provided by the real
// createSyncStoragePersister) so no browser is required.
import { dehydrate, hydrate, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PERSIST_MAX_AGE_MS, persistOptions } from './queryPersister';

/** The 3s in-memory gcTime this persistence must compose with (NOT revert). */
const IN_MEMORY_GC_TIME_MS = 3_000;
const TOURNAMENT_KEY = ['tournament'] as const;

/** A QueryClient pre-seeded with a successful `['tournament']` cache entry. */
function seedTournamentClient(data: unknown): QueryClient {
  const client = new QueryClient();
  client.setQueryData(TOURNAMENT_KEY, data);
  return client;
}

/** Minimal PersistedClient envelope, mirroring the persist plugin's shape. */
function makePersistedClient(client: QueryClient) {
  return {
    timestamp: Date.now(),
    buster: '',
    clientState: dehydrate(client),
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('persistOptions — configured against window.localStorage', () => {
  it('exposes a defined persister when window.localStorage is present', () => {
    expect(persistOptions.persister).toBeDefined();
  });

  it('sets a long maxAge (24h) that is INDEPENDENT of the 3s gcTime', () => {
    expect(persistOptions.maxAge).toBe(PERSIST_MAX_AGE_MS);
    // Composition invariant: the snapshot lifetime is orders of magnitude longer
    // than the 3s in-memory gcTime and must never collapse to it.
    expect(persistOptions.maxAge).toBeGreaterThan(IN_MEMORY_GC_TIME_MS);
    expect(persistOptions.maxAge).not.toBe(IN_MEMORY_GC_TIME_MS);
    // Sanity-pin the value so a typo (e.g. seconds vs ms) is caught: 24h in ms.
    expect(persistOptions.maxAge).toBe(1000 * 60 * 60 * 24);
  });

  it('sets a non-empty buster (build/schema version) so a deploy can invalidate snapshots', () => {
    expect(typeof persistOptions.buster).toBe('string');
    expect(persistOptions.buster.length).toBeGreaterThan(0);
  });
});

describe('persistOptions.persister — dehydrate → restore round-trip (hydrate-instant)', () => {
  it('persists a seeded ["tournament"] success and restores it into a fresh client', async () => {
    // Arrange: seed a client with a successful tournament query.
    const seeded = { id: 'wc2026', name: 'World Cup 2026' };
    const source = seedTournamentClient(seeded);

    // Act: persist the dehydrated source, then restore into a fresh client.
    const persister = persistOptions.persister;
    expect(persister).toBeDefined();
    await persister!.persistClient(makePersistedClient(source));

    const restored = await persister!.restoreClient();
    expect(restored).toBeTruthy();

    const target = new QueryClient();
    // The restored envelope carries `clientState` (the dehydrated cache).
    hydrate(target, (restored as { clientState: unknown }).clientState);

    // Assert: the seeded tournament is present in the fresh client without a fetch…
    expect(target.getQueryData(TOURNAMENT_KEY)).toEqual(seeded);
    // …and it round-tripped through serialization, not by sharing the object ref.
    expect(target.getQueryData(TOURNAMENT_KEY)).not.toBe(seeded);
  });

  it('writes the snapshot into window.localStorage (browser-backed, not an in-memory no-op)', async () => {
    const source = seedTournamentClient({ id: 'wc2026' });

    const persister = persistOptions.persister;
    await persister!.persistClient(makePersistedClient(source));

    // A storage entry must now exist AND carry the serialized payload, proving
    // the persister is genuinely localStorage-backed rather than a memory stub.
    expect(window.localStorage.length).toBeGreaterThan(0);
    const serialized = Object.keys(window.localStorage)
      .map((key) => window.localStorage.getItem(key) ?? '')
      .join('');
    expect(serialized).toContain('wc2026');
  });

  it('returns a falsy client from restoreClient when no snapshot was ever written', async () => {
    // Cold-start guard: an empty localStorage must not fabricate a snapshot.
    const restored = await persistOptions.persister!.restoreClient();
    expect(restored).toBeFalsy();
  });
});

describe('persistOptions.dehydrateOptions — only successful queries are frozen', () => {
  it('shouldDehydrateQuery rejects an errored/failed query (never freeze a failure)', () => {
    const failed = { state: { status: 'error', error: new Error('boom') } };
    expect(persistOptions.dehydrateOptions.shouldDehydrateQuery(failed)).toBe(false);
  });

  it('shouldDehydrateQuery rejects a still-pending query (never freeze an in-flight fetch)', () => {
    const pending = { state: { status: 'pending', fetchStatus: 'fetching', data: undefined } };
    expect(persistOptions.dehydrateOptions.shouldDehydrateQuery(pending)).toBe(false);
  });

  it('shouldDehydrateQuery accepts a successful query (snapshot persists it)', () => {
    const ok = { state: { status: 'success', data: { id: 'wc2026' } } };
    expect(persistOptions.dehydrateOptions.shouldDehydrateQuery(ok)).toBe(true);
  });
});
