// @vitest-environment jsdom
//
// Unit tests for `useInteractionMode` — mode state + localStorage persistence,
// SSR/no-window safe (plan Test Strategy: "Unit — useInteractionMode.test.tsx").
//
// The hook is the device-preference store behind the canvas toggle. It must:
//   - default to 'zoom' on a clean slate,
//   - hydrate a previously persisted choice,
//   - reject garbage in storage,
//   - persist on change and survive a fresh mount,
//   - never throw when window/localStorage is missing or throwing.
//
// d3-zoom behaviour is out of scope here (proven in e2e); this file only
// asserts state + persistence.
//
// RED until `src/features/roadmap/hooks/useInteractionMode.ts` exists.
import { act, renderHook, waitFor, type RenderHookResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INTERACTION_MODE, INTERACTION_MODE_STORAGE_KEY } from '../interaction-mode';
import { useInteractionMode } from './useInteractionMode';

type HookValue = ReturnType<typeof useInteractionMode>;
type HookRender = RenderHookResult<HookValue, void>;

/** Mount the hook and wait for it to settle on `expected` (default mode). */
async function mountSettled(
  expected: HookValue['mode'] = DEFAULT_INTERACTION_MODE,
): Promise<HookRender> {
  const view = renderHook(() => useInteractionMode());
  await waitFor(() => expect(view.result.current.mode).toBe(expected));
  return view;
}

function readStored(): string | null {
  return window.localStorage.getItem(INTERACTION_MODE_STORAGE_KEY);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('useInteractionMode — default', () => {
  it('starts in "zoom" with an empty store', async () => {
    const { result } = await mountSettled();
    expect(result.current.mode).toBe('zoom');
  });

  it('leaves storage untouched until the user picks a mode', async () => {
    await mountSettled();
    expect(readStored()).toBeNull();
  });
});

describe('useInteractionMode — hydration from storage', () => {
  it('adopts a persisted "pan" preference on mount', async () => {
    window.localStorage.setItem(INTERACTION_MODE_STORAGE_KEY, 'pan');
    const { result } = renderHook(() => useInteractionMode());
    await waitFor(() => expect(result.current.mode).toBe('pan'));
  });

  it('falls back to "zoom" when the stored value is not a valid mode', async () => {
    window.localStorage.setItem(INTERACTION_MODE_STORAGE_KEY, 'garbage');
    const { result } = renderHook(() => useInteractionMode());

    await waitFor(() => expect(result.current.mode).toBe('zoom'));
    // It must NEVER expose the garbage value, even transiently.
    expect(result.current.mode).toBe('zoom');
  });
});

describe('useInteractionMode — setMode persistence', () => {
  it('updates the mode and writes it to localStorage', async () => {
    const { result } = await mountSettled();

    act(() => result.current.setMode('pan'));

    expect(result.current.mode).toBe('pan');
    expect(readStored()).toBe('pan');
  });

  it('persists a switch back to "zoom" (round-trips both directions)', async () => {
    const { result } = await mountSettled();

    act(() => result.current.setMode('pan'));
    act(() => result.current.setMode('zoom'));

    expect(result.current.mode).toBe('zoom');
    expect(readStored()).toBe('zoom');
  });

  it('survives a remount via the persisted value', async () => {
    const first = await mountSettled();
    act(() => first.result.current.setMode('pan'));
    first.unmount();

    const second = renderHook(() => useInteractionMode());
    await waitFor(() => expect(second.result.current.mode).toBe('pan'));
  });

  it('does not mutate the previous mode value in place (immutable set)', async () => {
    const { result } = await mountSettled();
    const before = result.current.mode;

    act(() => result.current.setMode('pan'));

    // The captured snapshot must remain 'zoom' — state replaced, not mutated.
    expect(before).toBe('zoom');
    expect(result.current.mode).toBe('pan');
  });

  it('keeps a stable setMode identity across re-renders', async () => {
    const { result, rerender } = await mountSettled();
    const firstSetMode = result.current.setMode;

    rerender();

    expect(result.current.setMode).toBe(firstSetMode);
  });
});

describe('useInteractionMode — storage failure tolerance', () => {
  it('returns the default and does not throw when getItem throws (private mode)', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage disabled');
    });

    const { result } = renderHook(() => useInteractionMode());
    await waitFor(() => expect(result.current.mode).toBe('zoom'));

    // Prove the hook actually consulted (and survived) the throwing reader.
    expect(getItem).toHaveBeenCalledWith(INTERACTION_MODE_STORAGE_KEY);
  });

  it('keeps working when setItem throws (mode usable, persist is a no-op)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = await mountSettled();

    // setMode must not throw even though persistence fails underneath.
    expect(() => act(() => result.current.setMode('pan'))).not.toThrow();
    expect(result.current.mode).toBe('pan');
    // It tried to persist (and swallowed the failure) rather than skipping it.
    expect(setItem).toHaveBeenCalledWith(INTERACTION_MODE_STORAGE_KEY, 'pan');
  });
});
