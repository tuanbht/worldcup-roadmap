// localStorage cache persister for the direct-FIFA SPA (requirement 1044, §3).
//
// The pure-SPA fetches FIFA directly and lost the deleted edge cache; persisting
// the TanStack cache to localStorage restores instant hydration on reload (kills
// the F5 refetch spike) while COMPOSING with — not reverting — the owner's 3s
// gcTime decision (commit 1da3090). The snapshot lifetime is governed by this
// module's own `maxAge` (24h), which is INDEPENDENT of the 3s in-memory gcTime:
//   - `gcTime` only evicts UNOBSERVED queries from the in-memory cache.
//   - `maxAge` bounds how stale a localStorage snapshot may be before it is
//     discarded on restore.
// On reload, hydration restores the cached Tournament instantly; because the
// restored query is already past its 3s staleTime, mount/refocus triggers a
// background refetch — "hydrate instant, then revalidate".
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type {
  PersistedClient,
  Persister,
  PersistQueryClientOptions,
} from '@tanstack/react-query-persist-client';

/**
 * The minimal slice of a TanStack `Query` that the dehydrate predicate reads:
 * its `state.status`. Typing to this shape (rather than the full `Query`) keeps
 * the predicate callable with a lightweight `{ state: { status } }` object while
 * remaining assignable where the library expects `(query: Query) => boolean`,
 * because a real `Query` satisfies this structural subset.
 */
interface DehydrateQueryInput {
  state: { status: string };
}

/** Long localStorage snapshot lifetime — independent of the 3s in-memory gcTime. */
export const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

/** localStorage key for the dehydrated cache snapshot. */
const PERSIST_KEY = 'wc-roadmap-query-cache';

/**
 * Snapshot schema/build version. Bumping it invalidates every persisted entry on
 * the next load — change this when the cached domain shape changes so a stale
 * snapshot can never be hydrated against an incompatible schema.
 */
const PERSIST_BUSTER = `wc-roadmap-${import.meta.env.VITE_BUILD_ID ?? 'v1'}`;

/** localStorage is absent in Node/SSR; guard so unit tests/SSR don't throw. */
function resolveStorage(): Storage | undefined {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

/**
 * Build the cache persister. We delegate `restoreClient`/`removeClient` and the
 * serialization format to the official `createSyncStoragePersister`, but write
 * `persistClient` SYNCHRONOUSLY (the library throttles writes via `setTimeout`,
 * which would let the 3s gcTime evict a success before it ever lands in
 * localStorage). A synchronous write captures every success immediately — the
 * exact "hydrate-instant" guarantee the round-trip test asserts.
 */
function buildPersister(): Persister {
  const storage = resolveStorage();
  const base = createSyncStoragePersister({ storage, key: PERSIST_KEY });
  if (!storage) return base;
  return {
    ...base,
    persistClient(client: PersistedClient) {
      storage.setItem(PERSIST_KEY, JSON.stringify(client));
    },
  };
}

const persister = buildPersister();

/**
 * Persist only SUCCESS queries — never freeze a pending (in-flight) or errored
 * query into localStorage. Mirrors the persist plugin's default but is made
 * explicit so the dehydrate contract is visible and unit-tested.
 */
function shouldDehydrateQuery(query: DehydrateQueryInput): boolean {
  return query.state.status === 'success';
}

/**
 * Persist options forwarded to `<PersistQueryClientProvider persistOptions>`.
 * `queryClient` is supplied by the provider, so it is omitted here. `maxAge`,
 * `buster`, and `dehydrateOptions` are narrowed to required so consumers (and
 * the unit tests) can read them without optional-chaining.
 */
export type QueryPersistOptions = Omit<PersistQueryClientOptions, 'queryClient'> & {
  maxAge: number;
  buster: string;
  dehydrateOptions: { shouldDehydrateQuery: (query: DehydrateQueryInput) => boolean };
};

export const persistOptions: QueryPersistOptions = {
  persister,
  maxAge: PERSIST_MAX_AGE_MS,
  buster: PERSIST_BUSTER,
  dehydrateOptions: { shouldDehydrateQuery },
};
