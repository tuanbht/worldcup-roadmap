// Unit tests for the pure interaction-mode module (node environment — no DOM).
//
// These assert the contract the plan pins down (Test Strategy: "Unit —
// interaction-mode.test.ts"): the mode → React Flow interaction-props mapping
// and the `isInteractionMode` guard. The mapping is the seam between the toggle
// and `<ReactFlow>`; asserting it here keeps the React Flow wiring declarative
// and lets the (jsdom-hostile) d3-zoom behaviour be proven in e2e instead.
//
// RED until `src/features/roadmap/interaction-mode.ts` exists.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTERACTION_MODE,
  INTERACTION_MODES,
  INTERACTION_MODE_STORAGE_KEY,
  type InteractionMode,
  interactionFlowProps,
  isInteractionMode,
  readStoredMode,
} from './interaction-mode';

describe('interaction-mode constants', () => {
  it('defaults to wheel-zoom (honors the zoomable-roadmap-graph hard requirement)', () => {
    expect(DEFAULT_INTERACTION_MODE).toBe('zoom');
  });

  it('exposes exactly the two supported modes', () => {
    expect(INTERACTION_MODES).toEqual(['zoom', 'pan']);
  });

  it('namespaces the persistence key under the app', () => {
    expect(INTERACTION_MODE_STORAGE_KEY).toBe('wc-roadmap:interaction-mode');
  });
});

describe('isInteractionMode guard', () => {
  it('accepts the two valid modes', () => {
    expect(isInteractionMode('zoom')).toBe(true);
    expect(isInteractionMode('pan')).toBe(true);
  });

  it.each([['other'], [''], ['ZOOM'], [null], [undefined], [42], [{}], [['zoom']]])(
    'rejects invalid value %p',
    (value) => {
      expect(isInteractionMode(value)).toBe(false);
    },
  );
});

// NOTE: call `interactionFlowProps` INSIDE each test, never in the describe body.
// In the RED phase the stub throws; calling it at collection time would crash the
// whole file with one error and hide which assertions are actually being checked.
// Per-test calls make every expectation report its own RED individually.
describe('interactionFlowProps("zoom") — Option A: wheel zooms, drag pans', () => {
  it('turns wheel-zoom ON and pan-on-scroll OFF', () => {
    const props = interactionFlowProps('zoom');
    expect(props.zoomOnScroll).toBe(true);
    expect(props.panOnScroll).toBe(false);
  });

  it('keeps drag-to-pan and pinch-to-zoom on', () => {
    const props = interactionFlowProps('zoom');
    expect(props.panOnDrag).toBe(true);
    expect(props.zoomOnPinch).toBe(true);
  });

  it('does not pin a zoom activation key (plain wheel already zooms)', () => {
    const props = interactionFlowProps('zoom');
    expect(props.zoomActivationKeyCode).toBeUndefined();
  });
});

describe('interactionFlowProps("pan") — Option B: scroll pans, ⌘/Ctrl+scroll zooms', () => {
  it('turns pan-on-scroll ON and wheel-zoom OFF', () => {
    const props = interactionFlowProps('pan');
    expect(props.panOnScroll).toBe(true);
    expect(props.zoomOnScroll).toBe(false);
  });

  it('keeps drag-to-pan and pinch-to-zoom on', () => {
    const props = interactionFlowProps('pan');
    expect(props.panOnDrag).toBe(true);
    expect(props.zoomOnPinch).toBe(true);
  });

  it('routes wheel-zoom behind both ⌘ (Meta) and Ctrl for cross-platform', () => {
    const props = interactionFlowProps('pan');
    expect(props.zoomActivationKeyCode).toEqual(expect.arrayContaining(['Meta', 'Control']));
  });

  it('lists exactly Meta and Control as the activation keys (no stray entries)', () => {
    // arrayContaining above tolerates extras; pin the exact set so a regression
    // that adds a third (e.g. a stale key) is caught. Order-insensitive.
    const props = interactionFlowProps('pan');
    expect([...(props.zoomActivationKeyCode ?? [])].sort()).toEqual(['Control', 'Meta']);
  });
});

describe('interactionFlowProps — full prop surface (no missing/undefined flags)', () => {
  it.each([['zoom'], ['pan']] as const)(
    'mode %s returns concrete booleans for every interaction flag',
    (mode) => {
      const props = interactionFlowProps(mode);
      expect(typeof props.zoomOnScroll).toBe('boolean');
      expect(typeof props.panOnScroll).toBe('boolean');
      expect(typeof props.panOnDrag).toBe('boolean');
      expect(typeof props.zoomOnPinch).toBe('boolean');
    },
  );
});

describe('readStoredMode — SSR / no-window safety (node env: window is undefined)', () => {
  it('returns the default without touching globals when there is no window', () => {
    // This file runs in the global `node` environment, so `window` is genuinely
    // undefined here — the real SSR/no-window branch, not a stub.
    expect(typeof window).toBe('undefined');
    expect(readStoredMode()).toBe(DEFAULT_INTERACTION_MODE);
  });

  it('never throws when no storage is available', () => {
    expect(() => readStoredMode()).not.toThrow();
  });
});

describe('interactionFlowProps purity', () => {
  it('returns a fresh object per call (no shared mutable state)', () => {
    const a = interactionFlowProps('zoom');
    const b = interactionFlowProps('zoom');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('returns a fresh activation-key array per call for "pan" (no shared array)', () => {
    // A module-level constant array would be shared across every <ReactFlow>;
    // mutating one would silently affect the other. Require a fresh array.
    const a = interactionFlowProps('pan');
    const b = interactionFlowProps('pan');
    expect(a.zoomActivationKeyCode).not.toBe(b.zoomActivationKeyCode);
    expect(a.zoomActivationKeyCode).toEqual(b.zoomActivationKeyCode);
  });

  it('produces opposite scroll behaviours for the two modes', () => {
    const modes: InteractionMode[] = ['zoom', 'pan'];
    const [zoom, pan] = modes.map(interactionFlowProps);
    expect(zoom.zoomOnScroll).not.toBe(pan.zoomOnScroll);
    expect(zoom.panOnScroll).not.toBe(pan.panOnScroll);
  });
});
