// @vitest-environment jsdom
//
// Hook spec for `useMobileViewport` — the single matchMedia read that drives the
// canvas mobile zoom floor (requirement 2026-06-23-1336-mobile-friendly-small-
// screens, plan To-build #1 / Data-Model).
//
// Contract:
//   - returns `{ isMobile: true }` when `matchMedia('(max-width: 640px)')`
//     reports a match, `{ isMobile: false }` otherwise,
//   - subscribes once (cleanup on unmount — no listener leak),
//   - NEVER throws when `window.matchMedia` is absent (jsdom default), returning
//     `{ isMobile: false }` so any suite mounting it transitively stays safe.
//
// jsdom does NOT provide `window.matchMedia`, so we install a controllable fake
// per-test and restore it in afterEach. The "absent matchMedia" case deletes it
// entirely to exercise the SSR/test guard. RED until useMobileViewport.ts exists
// — it fails as a missing module, not a typo.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMobileViewport } from './useMobileViewport';

interface FakeMql {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  // Legacy fallback some hooks still call — provide spies so either path works.
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
}

const originalMatchMedia = window.matchMedia;
let lastMql: FakeMql | null = null;

/**
 * Replay a media-query change through whichever listener the hook registered
 * (modern `addEventListener('change', …)` OR legacy `addListener`). Flips the
 * MQL's `matches` first so the hook reads the new value, then invokes every
 * registered handler with a `MediaQueryListEvent`-shaped payload.
 */
function emitMediaChange(mql: FakeMql, matches: boolean): void {
  mql.matches = matches;
  const event = { matches, media: mql.media } as MediaQueryListEvent;
  for (const [, handler] of mql.addEventListener.mock.calls) {
    (handler as (e: MediaQueryListEvent) => void)(event);
  }
  for (const [handler] of mql.addListener.mock.calls) {
    (handler as (e: MediaQueryListEvent) => void)(event);
  }
}

/** Install a fake `matchMedia` whose query reports `matches`. Records the MQL so
 *  a test can assert subscribe/cleanup happened on it (and replay a change). */
function installMatchMedia(matches: boolean): void {
  lastMql = null;
  window.matchMedia = vi.fn((media: string): FakeMql => {
    const mql: FakeMql = {
      matches,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    lastMql = mql;
    return mql;
  }) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  // Restore the real (jsdom-absent) matchMedia between cases.
  if (originalMatchMedia) {
    window.matchMedia = originalMatchMedia;
  } else {
    // jsdom default is undefined — delete the fake so the "absent" case is honest.
    delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
  }
  lastMql = null;
  vi.restoreAllMocks();
});

describe('useMobileViewport — matchMedia drives isMobile', () => {
  it('returns { isMobile: true } when the (max-width: 640px) query matches', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useMobileViewport());
    expect(result.current.isMobile).toBe(true);
  });

  it('returns { isMobile: false } when the query does not match', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useMobileViewport());
    expect(result.current.isMobile).toBe(false);
  });

  it('queries the 640px breakpoint (the max-[640px]/sm cutover)', () => {
    installMatchMedia(true);
    renderHook(() => useMobileViewport());
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 640px)');
  });
});

describe('useMobileViewport — subscription lifecycle', () => {
  it('subscribes to the media query list on mount', () => {
    installMatchMedia(true);
    renderHook(() => useMobileViewport());
    // Either the modern addEventListener or the legacy addListener must be used
    // exactly once — the hook subscribes so a rotation/resize updates isMobile.
    const subscribed =
      lastMql!.addEventListener.mock.calls.length + lastMql!.addListener.mock.calls.length;
    expect(subscribed).toBeGreaterThanOrEqual(1);
  });

  it('removes its listener on unmount (no leak)', () => {
    installMatchMedia(true);
    const { unmount } = renderHook(() => useMobileViewport());
    unmount();
    const unsubscribed =
      lastMql!.removeEventListener.mock.calls.length + lastMql!.removeListener.mock.calls.length;
    expect(unsubscribed).toBeGreaterThanOrEqual(1);
  });

  it('updates isMobile when the media query changes (the subscription is load-bearing)', () => {
    // Start desktop, then replay a change to mobile through the registered
    // listener. This is the WHY of subscribing — a rotation/resize from
    // desktop->mobile width must flip isMobile, not just register a no-op handler.
    installMatchMedia(false);
    const { result } = renderHook(() => useMobileViewport());
    expect(result.current.isMobile).toBe(false);

    act(() => emitMediaChange(lastMql!, true));
    expect(result.current.isMobile).toBe(true);
  });

  it('updates isMobile back to false when the query stops matching (symmetric)', () => {
    // The reverse transition (mobile->desktop) must also propagate, so a device
    // rotating back to a wide layout restores the desktop zoom floor.
    installMatchMedia(true);
    const { result } = renderHook(() => useMobileViewport());
    expect(result.current.isMobile).toBe(true);

    act(() => emitMediaChange(lastMql!, false));
    expect(result.current.isMobile).toBe(false);
  });
});

describe('useMobileViewport — SSR/test guard (matchMedia absent)', () => {
  it('does not throw and reports isMobile:false when window.matchMedia is undefined', () => {
    // jsdom default: no matchMedia. The hook must guard this so every suite that
    // mounts RoadmapCanvas transitively (without polyfilling matchMedia) is safe.
    delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
    const { result } = renderHook(() => useMobileViewport());
    expect(result.current.isMobile).toBe(false);
  });
});
