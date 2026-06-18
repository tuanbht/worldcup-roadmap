import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_MATCH_DETAIL } from '@/domain/types';
import type { MatchDetail } from '@/domain/types';
import { getCachedMatchDetail, resetMatchDetailCache } from './match-detail-cache';

const MATCH_A = 'wc2026-fifa-a';
const MATCH_B = 'wc2026-fifa-b';

function detail(id: string): MatchDetail {
  return EMPTY_MATCH_DETAIL(id);
}

beforeEach(() => {
  resetMatchDetailCache();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetMatchDetailCache();
});

describe('getCachedMatchDetail', () => {
  it('loads on a cold cache and returns the loaded snapshot', async () => {
    const loader = vi.fn(async () => detail(MATCH_A));
    const result = await getCachedMatchDetail(MATCH_A, loader, false);
    expect(result.matchId).toBe(MATCH_A);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('serves the cached snapshot within the TTL (no second load)', async () => {
    const loader = vi.fn(async () => detail(MATCH_A));
    await getCachedMatchDetail(MATCH_A, loader, false);
    await getCachedMatchDetail(MATCH_A, loader, false);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('refreshes after the idle TTL expires', async () => {
    const loader = vi.fn(async () => detail(MATCH_A));
    await getCachedMatchDetail(MATCH_A, loader, false);
    // Idle TTL default is 600_000ms; advance just past it.
    vi.advanceTimersByTime(600_001);
    await getCachedMatchDetail(MATCH_A, loader, false);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('uses the shorter live TTL when the match is live', async () => {
    const loader = vi.fn(async () => detail(MATCH_A));
    await getCachedMatchDetail(MATCH_A, loader, true);
    // Live TTL default is 30_000ms — still fresh just before, stale just after.
    vi.advanceTimersByTime(29_000);
    await getCachedMatchDetail(MATCH_A, loader, true);
    expect(loader).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await getCachedMatchDetail(MATCH_A, loader, true);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('single-flights concurrent callers for the same id', async () => {
    let resolve: (value: MatchDetail) => void = () => {};
    const loader = vi.fn(
      () =>
        new Promise<MatchDetail>((r) => {
          resolve = r;
        }),
    );
    const a = getCachedMatchDetail(MATCH_A, loader, false);
    const b = getCachedMatchDetail(MATCH_A, loader, false);
    resolve(detail(MATCH_A));
    const [ra, rb] = await Promise.all([a, b]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(ra).toBe(rb);
  });

  it('keys the cache per matchId (different ids load independently)', async () => {
    const loaderA = vi.fn(async () => detail(MATCH_A));
    const loaderB = vi.fn(async () => detail(MATCH_B));
    await getCachedMatchDetail(MATCH_A, loaderA, false);
    await getCachedMatchDetail(MATCH_B, loaderB, false);
    expect(loaderA).toHaveBeenCalledTimes(1);
    expect(loaderB).toHaveBeenCalledTimes(1);
  });

  it('serves the last good snapshot on a refresh error (stale-on-error)', async () => {
    const good = detail(MATCH_A);
    const loader = vi
      .fn<() => Promise<MatchDetail>>()
      .mockResolvedValueOnce(good)
      .mockRejectedValueOnce(new Error('upstream down'));
    await getCachedMatchDetail(MATCH_A, loader, false);
    vi.advanceTimersByTime(600_001); // force a refresh that will reject
    const result = await getCachedMatchDetail(MATCH_A, loader, false);
    expect(result).toBe(good);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('throws when the very first load fails (no snapshot to fall back to)', async () => {
    const loader = vi.fn(async () => {
      throw new Error('cold failure');
    });
    await expect(getCachedMatchDetail(MATCH_A, loader, false)).rejects.toThrow('cold failure');
  });
});
