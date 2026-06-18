import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_INTERACTION_MODE,
  persistMode,
  readStoredMode,
  type InteractionMode,
} from '../interaction-mode';

/**
 * Device-preference store behind the canvas zoom/pan toggle.
 *
 * Owns the `'zoom' | 'pan'` mode and persists it to `localStorage` (not the URL —
 * interaction preference is a per-device ergonomic setting, not shareable view
 * state). Mirrors `useStageView`'s client-only hydrate to avoid an SSR mismatch:
 * state starts at the default and adopts the persisted value on mount.
 *
 * SSR/no-window safe and storage-failure tolerant via `readStoredMode` /
 * `persistMode`; `setMode` never throws to the UI.
 */
export function useInteractionMode(): {
  mode: InteractionMode;
  setMode: (mode: InteractionMode) => void;
} {
  const [mode, setModeState] = useState<InteractionMode>(DEFAULT_INTERACTION_MODE);

  // Hydrate from storage after mount (client-only SPA, no SSR mismatch).
  useEffect(() => setModeState(readStoredMode()), []);

  const setMode = useCallback((next: InteractionMode) => {
    setModeState(next);
    persistMode(next);
  }, []);

  return { mode, setMode };
}
