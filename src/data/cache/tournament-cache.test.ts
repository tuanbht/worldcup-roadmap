import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchRepository } from '@/data/repository';
import type { Match, Tournament } from '@/domain/types';
import { env } from '@/data/config/env';
import { loadTournament } from '@/features/roadmap/__test-support__/roadmap-fixtures';
import { getCachedTournament, resetTournamentCache } from './tournament-cache';

/**
 * CR-10a — direct coverage of the `tournament-cache` singleton, mirroring the
 * proven `match-detail-cache.test.ts` shape (fake timers + a `vi.fn()`-backed
 * `MatchRepository` stub, reset between cases). The headline branch is
 * STALE-ON-ERROR (`tournament-cache.ts` lines ~35-37): when a post-TTL refresh
 * throws but a snapshot exists, the cache serves the stale snapshot instead of
 * propagating; with no snapshot the error propagates.
 *
 * The TTL tiers and single-flight cases are documented behaviours covered here
 * too. Tests assert relative to `env.WC_CACHE_TTL_*` (the same values the
 * production module reads) so they stay deterministic under default tuning.
 * `WC_PROVIDER=mock` is pinned by the vitest config, so no FIFA fetch occurs.
 */

/**
 * A genuinely IDLE tournament: the parsed mock with every match forced to a
 * non-live status, so `ttlFor` picks the long idle tier. (The raw mock fixture
 * already contains a live match, which would otherwise pick the live tier and
 * make the idle-tier assertions pass for the wrong reason.) Built immutably.
 */
function idleTournament(): Tournament {
  const base = loadTournament();
  const matches: Match[] = base.matches.map((m) =>
    m.status === 'live' ? { ...m, status: 'finished' } : m,
  );
  return { ...base, matches };
}

/**
 * The idle tournament with exactly one match flipped to `status: 'live'`, so
 * `ttlFor` picks the shorter live tier. Built immutably (no in-place mutation).
 */
function liveTournament(): Tournament {
  const base = idleTournament();
  const [first, ...rest] = base.matches;
  const liveMatch: Match = { ...first, status: 'live' };
  return { ...base, matches: [liveMatch, ...rest] };
}

/** A stub repository whose `getTournament` is fully controlled per test. */
function stubRepo(getTournament: MatchRepository['getTournament']): MatchRepository {
  return { name: 'stub', getTournament };
}

/**
 * A stub repository that resolves the SAME snapshot on every call, exposing the
 * underlying `vi.fn()` as `repo.getTournament` for call-count assertions. The
 * default DRYs the common "always returns this snapshot" arrangement.
 */
function repoAlwaysReturning(snapshot: Tournament): MatchRepository {
  return stubRepo(vi.fn(async () => snapshot));
}

beforeEach(() => {
  resetTournamentCache();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetTournamentCache();
});

describe('getCachedTournament', () => {
  it('runs against an environment where the live TTL is shorter than the idle TTL', () => {
    // Precondition the live-TTL behavior test relies on: the tiers are ordered.
    // Asserting it once here keeps that test deterministic under TTL re-tuning.
    expect(env.WC_CACHE_TTL_LIVE_MS).toBeLessThan(env.WC_CACHE_TTL_IDLE_MS);
  });

  it('loads on a cold cache and returns the loaded snapshot', async () => {
    const snapshot = idleTournament();
    const repo = repoAlwaysReturning(snapshot);
    const result = await getCachedTournament(repo);
    expect(result).toBe(snapshot);
    expect(repo.getTournament).toHaveBeenCalledTimes(1);
  });

  it('serves the cached snapshot within the TTL (no second upstream call)', async () => {
    const snapshot = idleTournament();
    const repo = repoAlwaysReturning(snapshot);
    await getCachedTournament(repo);
    const second = await getCachedTournament(repo);
    expect(second).toBe(snapshot);
    expect(repo.getTournament).toHaveBeenCalledTimes(1);
  });

  it('still serves the cache comfortably before the idle TTL expires', async () => {
    const repo = repoAlwaysReturning(idleTournament());
    await getCachedTournament(repo);
    // Well within the window: still fresh, so no refresh.
    vi.advanceTimersByTime(env.WC_CACHE_TTL_IDLE_MS - 1_000);
    await getCachedTournament(repo);
    expect(repo.getTournament).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the idle TTL has elapsed', async () => {
    const repo = repoAlwaysReturning(idleTournament());
    await getCachedTournament(repo);
    vi.advanceTimersByTime(env.WC_CACHE_TTL_IDLE_MS + 1);
    await getCachedTournament(repo);
    expect(repo.getTournament).toHaveBeenCalledTimes(2);
  });

  it('uses the shorter live TTL when any match is live', async () => {
    const repo = repoAlwaysReturning(liveTournament());
    await getCachedTournament(repo);
    // Still fresh just before the live TTL elapses…
    vi.advanceTimersByTime(env.WC_CACHE_TTL_LIVE_MS - 1_000);
    await getCachedTournament(repo);
    expect(repo.getTournament).toHaveBeenCalledTimes(1);
    // …and stale just after — but still well before the (longer) idle TTL would expire,
    // proving the refresh was driven by the LIVE tier, not the idle one.
    vi.advanceTimersByTime(2_000);
    await getCachedTournament(repo);
    expect(repo.getTournament).toHaveBeenCalledTimes(2);
  });

  it('single-flights concurrent callers (one upstream call, shared reference)', async () => {
    const snapshot = idleTournament();
    let resolve: (value: Tournament) => void = () => {};
    const getTournament = vi.fn(
      () =>
        new Promise<Tournament>((r) => {
          resolve = r;
        }),
    );
    const repo = stubRepo(getTournament);
    const a = getCachedTournament(repo);
    const b = getCachedTournament(repo);
    resolve(snapshot);
    const [ra, rb] = await Promise.all([a, b]);
    expect(getTournament).toHaveBeenCalledTimes(1);
    expect(ra).toBe(snapshot);
    expect(rb).toBe(ra);
  });

  it('serves the last good snapshot when a refresh throws (stale-on-error)', async () => {
    const good = idleTournament();
    const getTournament = vi
      .fn<() => Promise<Tournament>>()
      .mockResolvedValueOnce(good)
      .mockRejectedValueOnce(new Error('upstream down'));
    const repo = stubRepo(getTournament);

    // Prime the cache with a good snapshot, then force a refresh that rejects.
    await getCachedTournament(repo);
    vi.advanceTimersByTime(env.WC_CACHE_TTL_IDLE_MS + 1);
    const result = await getCachedTournament(repo);

    // The stale snapshot is returned BY REFERENCE — the error never surfaces.
    expect(result).toBe(good);
    expect(getTournament).toHaveBeenCalledTimes(2);
  });

  it('propagates the error when the cold load throws (no snapshot to fall back to)', async () => {
    const getTournament = vi.fn(async () => {
      throw new Error('cold failure');
    });
    const repo = stubRepo(getTournament);
    await expect(getCachedTournament(repo)).rejects.toThrow('cold failure');
    expect(getTournament).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight slot after a cold failure so the next call retries', async () => {
    const recovered = idleTournament();
    const getTournament = vi
      .fn<() => Promise<Tournament>>()
      .mockRejectedValueOnce(new Error('cold failure'))
      .mockResolvedValueOnce(recovered);
    const repo = stubRepo(getTournament);

    await expect(getCachedTournament(repo)).rejects.toThrow('cold failure');
    // The rejected refresh must release `inflight`; the retry must hit upstream again.
    const result = await getCachedTournament(repo);
    expect(result).toBe(recovered);
    expect(getTournament).toHaveBeenCalledTimes(2);
  });

  it('recovers on the next refresh after a stale-on-error fallback', async () => {
    const good = idleTournament();
    const recovered = idleTournament();
    const getTournament = vi
      .fn<() => Promise<Tournament>>()
      .mockResolvedValueOnce(good)
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(recovered);
    const repo = stubRepo(getTournament);

    await getCachedTournament(repo);
    vi.advanceTimersByTime(env.WC_CACHE_TTL_IDLE_MS + 1);
    expect(await getCachedTournament(repo)).toBe(good); // stale served
    vi.advanceTimersByTime(env.WC_CACHE_TTL_IDLE_MS + 1);
    expect(await getCachedTournament(repo)).toBe(recovered); // fresh after recovery
    expect(getTournament).toHaveBeenCalledTimes(3);
  });
});
