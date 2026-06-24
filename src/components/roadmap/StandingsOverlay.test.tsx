// @vitest-environment jsdom
//
// Component spec for StandingsOverlay's 320px-fit hardening (requirement
// 2026-06-23-1336-mobile-friendly-small-screens, scope #4/#5, AC #3/#4/#5).
//
// On a narrow viewport the overlay must:
//   - render the compact column set (`# / Team / MP / GD / Pts`, stat keys
//     ['mp','gd']) so the table fits a 320px screen — driven by useMobileViewport,
//   - keep the dialog within the viewport (a `max-w-[calc(100vw-2rem)]` bound)
//     and reposition the close button INSIDE the card edge so neither the card
//     nor the `-top-3 -right-3` bleed exceeds 320px,
//   - present a ≥44px close-button hit area on coarse pointers.
//
// The overlay reads viewport size via useMobileViewport (the same hook the canvas
// uses); we mock it per-test (default desktop) so jsdom's absent matchMedia is
// never touched here. jsdom can't measure real layout, so the viewport-bound /
// hit-area assertions check the CONTRACT (the bounding class / coarse-pointer
// sizing hook). RED until StandingsOverlay wires compact + the viewport bound.
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StandingsOverlay } from './StandingsOverlay';
import { GROUP_A, GROUP_A_EMPTY } from '@/components/nodes/__test-support__/standings-fixtures';
import {
  COMPACT_DROPPED_LABELS,
  COMPACT_HEADER_LABELS,
  FULL_HEADER_LABELS,
  getStatHeaderLabels,
} from '@/components/nodes/__test-support__/standings-dom';
import { expectCoarseHitArea } from '@/components/__test-support__/touch-target';

// Mock useMobileViewport so the overlay's mobile branch is driven deterministically
// without jsdom's (absent) matchMedia. Default desktop; toggled per describe.
let mockMobileViewport: { isMobile: boolean } = { isMobile: false };
vi.mock('@/features/roadmap/hooks/useMobileViewport', () => ({
  useMobileViewport: () => mockMobileViewport,
}));

afterEach(() => {
  mockMobileViewport = { isMobile: false };
});

/** Render the overlay with the mobile branch forced on (isMobile:true). */
function renderMobileOverlay() {
  mockMobileViewport = { isMobile: true };
  render(<StandingsOverlay group={GROUP_A} onClose={vi.fn()} />);
}

describe('StandingsOverlay — closed', () => {
  it('renders nothing when group is null', () => {
    const { container } = render(<StandingsOverlay group={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('StandingsOverlay — mobile renders the compact column set [Acceptance #4]', () => {
  it('shows exactly # / Team / MP / GD / Pts on a narrow viewport', () => {
    renderMobileOverlay();
    expect(getStatHeaderLabels()).toEqual([...COMPACT_HEADER_LABELS]);
  });

  it('does NOT show W/D/L/GF/GA on a narrow viewport', () => {
    renderMobileOverlay();
    const labels = getStatHeaderLabels();
    for (const dropped of COMPACT_DROPPED_LABELS) {
      expect(labels).not.toContain(dropped);
    }
  });
});

describe('StandingsOverlay — desktop keeps the full column matrix (regression)', () => {
  it('shows the full 7-stat matrix on a desktop viewport', () => {
    // Default mock is desktop; the overlay must not compact the table here.
    render(<StandingsOverlay group={GROUP_A} onClose={vi.fn()} />);
    expect(getStatHeaderLabels()).toEqual([...FULL_HEADER_LABELS]);
  });

  it('keys the column set off useMobileViewport, NOT off the row count (4-team group stays full on desktop)', () => {
    // GROUP_A is a full four-team table. On desktop it must STILL render the full
    // matrix — proving compaction is driven by the viewport hook, never by how
    // many rows the group happens to have.
    render(<StandingsOverlay group={GROUP_A} onClose={vi.fn()} />);
    const labels = getStatHeaderLabels();
    expect(labels).toContain('GF');
    expect(labels).toContain('GA');
  });
});

describe('StandingsOverlay — dialog stays within a 320px viewport [Acceptance #3]', () => {
  it('bounds the dialog width so it never exceeds the viewport', () => {
    render(<StandingsOverlay group={GROUP_A} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Group A standings' });
    // A viewport-relative max-width keeps the 296px card + its margins inside a
    // 320px screen (max-w-[calc(100vw-2rem)] or an equivalent vw/max-w bound).
    expect(dialog.className).toMatch(/max-w-\[|max-w-screen|w-\[min\(/);
  });
});

describe('StandingsOverlay — close button is reachable + a ≥44px touch target [Acceptance #5]', () => {
  it('keeps the close button labelled and a real <button>', () => {
    render(<StandingsOverlay group={GROUP_A} onClose={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close standings' });
    expect(close.tagName).toBe('BUTTON');
    expect(close).toHaveAttribute('type', 'button');
  });

  it('presents a ≥44px hit area on coarse pointers', () => {
    render(<StandingsOverlay group={GROUP_A} onClose={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close standings' });
    expectCoarseHitArea(close);
  });
});

describe('StandingsOverlay — empty group boundary (no results yet)', () => {
  it('still renders the bounded dialog + close button for an empty table on a narrow viewport', () => {
    // Early-tournament group with zero rows: the overlay must still mount its
    // dialog and a reachable, hit-area-grown close button (no crash on []).
    mockMobileViewport = { isMobile: true };
    render(<StandingsOverlay group={GROUP_A_EMPTY} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Group A standings' });
    expect(dialog.className).toMatch(/max-w-\[|max-w-screen|w-\[min\(/);

    const close = screen.getByRole('button', { name: 'Close standings' });
    expect(close.tagName).toBe('BUTTON');
    expectCoarseHitArea(close);
  });
});

// ============================================================================
// requirement 1031 — compact density: the 640 seam wiring (behavior 6).
// ============================================================================
// Pins the exact `compact={isMobile}` boundary (StandingsOverlay.tsx line 72)
// that the 1031 plan's rev2 misread: a render BELOW the 640 seam
// (isMobile === true) yields the COMPACT set, and a render ABOVE it
// (isMobile === false) yields the FULL set. This is a thin seam assertion — the
// compact density CONTRACT itself is asserted in GroupTableNode.test.tsx, not
// duplicated here. Reuses the existing `mockMobileViewport` matchMedia harness.
//
// Both assertions pass at the baseline (the seam already routes compact ←
// isMobile), so this block is GREEN today — it is a regression pin guarding the
// seam against a future refactor that decouples compact from isMobile.
describe('StandingsOverlay — 640 seam routes compact ← isMobile [requirement 1031]', () => {
  it('below the seam (isMobile === true) → the inner table is the COMPACT set', () => {
    mockMobileViewport = { isMobile: true };
    render(<StandingsOverlay group={GROUP_A} onClose={vi.fn()} />);
    expect(getStatHeaderLabels()).toEqual([...COMPACT_HEADER_LABELS]);
  });

  it('above the seam (isMobile === false) → the inner table is the FULL set', () => {
    mockMobileViewport = { isMobile: false };
    render(<StandingsOverlay group={GROUP_A} onClose={vi.fn()} />);
    expect(getStatHeaderLabels()).toEqual([...FULL_HEADER_LABELS]);
  });
});
