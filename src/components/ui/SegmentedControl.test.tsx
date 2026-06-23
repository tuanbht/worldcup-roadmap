// @vitest-environment jsdom
//
// Component spec for SegmentedControl's coarse-pointer touch-target growth
// (requirement 2026-06-23-1336-mobile-friendly-small-screens, scope #5 / AC #5).
//
// SegmentedControl backs BOTH the canvas view-toggle (StageToggle) AND the
// match-detail tab row (MatchDetailTabs) — so growing its tab hit area to ≥44px
// on `pointer: coarse` satisfies the requirement's "tabs tappable on small
// screens" sub-clause in one place. Today the tabs are ~30px tall
// (`px-3.5 py-1.5 text-[0.82rem]`), below the 44px WCAG 2.5.5 target.
//
// jsdom can't measure real layout, so we assert the CONTRACT: each tab keeps its
// role/label semantics and carries a coarse-pointer sizing hook (a `pointer-coarse:`
// utility / `min-h` token / hit-area class) that does NOT alter the desktop pill.
// RED until SegmentedControl adds the coarse-pointer hit-area class.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';
import { expectCoarseHitArea } from '@/components/__test-support__/touch-target';

const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'groups', label: 'Groups' },
  { value: 'knockout', label: 'Knockout' },
] as const;

function renderControl(value: (typeof OPTIONS)[number]['value'] = 'all') {
  render(
    <SegmentedControl
      options={OPTIONS}
      value={value}
      onChange={vi.fn()}
      ariaLabel="Focus the roadmap on a phase"
    />,
  );
}

describe('SegmentedControl — tabs keep their semantics', () => {
  it('renders a role="tablist" with one role="tab" button per option', () => {
    renderControl();
    expect(
      screen.getByRole('tablist', { name: 'Focus the roadmap on a phase' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(OPTIONS.length);
  });
});

describe('SegmentedControl — tabs are ≥44px touch targets on coarse pointers [Acceptance #5]', () => {
  it('grows every tab hit area via a coarse-pointer sizing hook', () => {
    renderControl();
    // Every tab — not just the active one — must carry a non-destructive
    // coarse-pointer hit-area hook (pointer-coarse: variant / min-h token / named
    // touch-target class). The desktop pill padding stays compact (no class
    // removed); the coarse-pointer media query supplies the ≥44px target.
    for (const tab of screen.getAllByRole('tab')) {
      expectCoarseHitArea(tab);
    }
  });

  it('keeps the desktop pill padding compact (the coarse-pointer growth is additive, not a swap)', () => {
    // The fix must NOT remove the existing desktop padding (`px-3.5 py-1.5`) — it
    // adds a coarse-pointer-only enlargement, so the ≥1024 snapshots stay
    // byte-identical. Pins that the desktop visual density is preserved.
    renderControl();
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toContain('px-3.5');
      expect(tab.className).toContain('py-1.5');
    }
  });

  it('keeps the active tab visually selected (does not drop aria-selected on resize)', () => {
    renderControl('groups');
    const selected = screen.getByRole('tab', { selected: true });
    expect(selected).toHaveTextContent('Groups');
  });
});
