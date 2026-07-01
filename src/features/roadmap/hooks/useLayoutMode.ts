/**
 * `?layout=` URL-state store for the layout-mode switch (timeline `grid` default
 * vs the radial `circle`). Mirrors `useStageView`/`useFocusedTeam`: hydrate after
 * mount (client-only SPA, no SSR mismatch), allow-list `['grid','circle']` with
 * `grid` default, and `setMode` writes `?layout=` via `history.replaceState` on a
 * FRESH URL so a co-existing `?focus=`/`?team=` is preserved. SSR-safe (no
 * `window` → default).
 */
import { useCallback, useEffect, useState } from 'react';
import type { LayoutMode } from '../graph-model';

const VALID: readonly LayoutMode[] = ['grid', 'circle'];
const DEFAULT_MODE: LayoutMode = 'grid';

export interface LayoutModeState {
  readonly mode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
}

function readMode(): LayoutMode {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  const param = new URLSearchParams(window.location.search).get('layout');
  return VALID.includes(param as LayoutMode) ? (param as LayoutMode) : DEFAULT_MODE;
}

export function useLayoutMode(): LayoutModeState {
  const [mode, setModeState] = useState<LayoutMode>(DEFAULT_MODE);

  // Hydrate from the URL after mount (client-only SPA, no SSR mismatch).
  useEffect(() => setModeState(readMode()), []);

  const setMode = useCallback((next: LayoutMode) => {
    setModeState(next);
    // Fresh URL from the live location so any co-existing `?focus=`/`?team=`
    // written by useStageView/useFocusedTeam survives the layout write.
    const url = new URL(window.location.href);
    url.searchParams.set('layout', next);
    window.history.replaceState(null, '', url);
  }, []);

  return { mode, setMode };
}
