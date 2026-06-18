// Pure interaction-mode module: the seam between the canvas toggle and
// `<ReactFlow>`. No React, no DOM imports — only a localStorage read guarded for
// SSR/no-window. Keeping the mode → interaction-props mapping here lets the React
// Flow wiring stay declarative and lets the d3-zoom behaviour be proven in e2e.

export type InteractionMode = 'zoom' | 'pan';

export const INTERACTION_MODES = ['zoom', 'pan'] as const;
export const DEFAULT_INTERACTION_MODE: InteractionMode = 'zoom';
export const INTERACTION_MODE_STORAGE_KEY = 'wc-roadmap:interaction-mode';

/** Cross-platform zoom modifier keys used by 'pan' mode (⌘ on mac, Ctrl elsewhere). */
const PAN_ZOOM_ACTIVATION_KEYS: readonly string[] = ['Meta', 'Control'];

/** Only the interaction-related props; spread onto <ReactFlow>. */
export interface InteractionFlowProps {
  zoomOnScroll: boolean;
  panOnScroll: boolean;
  zoomOnPinch: boolean;
  panOnDrag: boolean;
  zoomActivationKeyCode?: string[];
}

export function isInteractionMode(value: unknown): value is InteractionMode {
  return value === 'zoom' || value === 'pan';
}

/**
 * Map an interaction mode to the exact React Flow interaction props.
 *
 * - 'zoom' (Option A, the hard requirement): plain wheel zooms cursor-centered,
 *   drag pans — React Flow defaults (`zoomOnScroll` + `panOnDrag`, no `panOnScroll`).
 * - 'pan' (Option B): two-finger / plain scroll pans; ⌘/Ctrl+scroll and pinch zoom.
 *
 * Returns a fresh object (and a fresh activation-key array) per call so no two
 * `<ReactFlow>` instances ever share mutable state.
 */
export function interactionFlowProps(mode: InteractionMode): InteractionFlowProps {
  if (mode === 'pan') {
    return {
      zoomOnScroll: false,
      panOnScroll: true,
      zoomOnPinch: true,
      panOnDrag: true,
      zoomActivationKeyCode: [...PAN_ZOOM_ACTIVATION_KEYS],
    };
  }
  return {
    zoomOnScroll: true,
    panOnScroll: false,
    zoomOnPinch: true,
    panOnDrag: true,
  };
}

/**
 * SSR/no-window-safe reader: returns the persisted mode, or the default when
 * `window`/`localStorage` is unavailable, the value is missing/invalid, or the
 * read throws (private mode / disabled storage). Never throws.
 */
export function readStoredMode(): InteractionMode {
  if (typeof window === 'undefined') return DEFAULT_INTERACTION_MODE;
  try {
    const stored = window.localStorage.getItem(INTERACTION_MODE_STORAGE_KEY);
    return isInteractionMode(stored) ? stored : DEFAULT_INTERACTION_MODE;
  } catch {
    return DEFAULT_INTERACTION_MODE;
  }
}

/**
 * Persist the chosen mode. Swallows storage failures (quota / disabled storage)
 * so the UI never throws — persistence is best-effort, the in-memory mode is
 * the source of truth for the session.
 */
export function persistMode(mode: InteractionMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INTERACTION_MODE_STORAGE_KEY, mode);
  } catch {
    // Best-effort: ignore quota / disabled-storage errors.
  }
}
