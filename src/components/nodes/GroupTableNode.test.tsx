// @vitest-environment jsdom
//
// Component spec for GroupTableNode's re-homed overlay opener (C1). When the
// deleted group-header pill went away, its `aria-label="Open Group X standings"`
// button moved onto the always-on table's <header>. The plan (Scope → "Decided
// here") commits to: GroupTableNode renders its <header> as a
// `<button type="button" aria-label="Open Group ${name} standings">` calling
// `onOpenStandings(group.name)` WHEN an `onOpenStandings` handler is supplied,
// and a plain non-interactive <header> when it is absent (the overlay path).
//
// The row flag buttons (onFocusTeam) are SEPARATE controls with their own
// `aria-label="Show matches for {team}"` and must `stopPropagation`, so a flag
// click sets the focused team WITHOUT also opening the overlay.
//
// Asserted directly on GroupTableNode (not the contended RoadmapCanvas.test.tsx),
// per the concurrency guardrail. RED until GroupTableNode renders the header
// button. Counts/values come from a tiny explicit Group fixture.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupTableNode } from './GroupTableNode';
import { GROUP_A, GROUP_A_PAIR } from './__test-support__/standings-fixtures';
import {
  COMPACT_DROPPED_LABELS,
  COMPACT_HEADER_LABELS,
  FULL_HEADER_LABELS,
  getStatHeaderLabels,
} from './__test-support__/standings-dom';
import { expectCoarseHitArea } from '@/components/__test-support__/touch-target';

// Argentina(1) + Poland(2), both qualified — the minimal two-row fixture; the
// full column matrix is exercised by GroupStandingsNode.test.tsx.
const GROUP = GROUP_A_PAIR;

describe('GroupTableNode — header opens the standings overlay [C1 / Acceptance #12]', () => {
  it('renders the header as a button labelled "Open Group A standings" when onOpenStandings is supplied', () => {
    render(<GroupTableNode group={GROUP} onOpenStandings={vi.fn()} />);
    const opener = screen.getByRole('button', { name: 'Open Group A standings' });
    expect(opener).toBeInTheDocument();
    // It is a real button (Enter/Space native), not a div with a click handler.
    expect(opener.tagName).toBe('BUTTON');
    expect(opener).toHaveAttribute('type', 'button');
  });

  it('calls onOpenStandings(group.name) when the header button is clicked', async () => {
    const onOpenStandings = vi.fn();
    const user = userEvent.setup();
    render(<GroupTableNode group={GROUP} onOpenStandings={onOpenStandings} />);
    await user.click(screen.getByRole('button', { name: 'Open Group A standings' }));
    expect(onOpenStandings).toHaveBeenCalledTimes(1);
    expect(onOpenStandings).toHaveBeenCalledWith('A');
  });

  it.each(['{Enter}', ' '])(
    'activates the header button by keyboard (%s) for accessibility — native <button> semantics',
    async (key) => {
      // A native <button> fires its click on BOTH Enter and Space; a div+onClick
      // would not. Parametrising both keys pins that the opener is a real button.
      const onOpenStandings = vi.fn();
      const user = userEvent.setup();
      render(<GroupTableNode group={GROUP} onOpenStandings={onOpenStandings} />);
      screen.getByRole('button', { name: 'Open Group A standings' }).focus();
      await user.keyboard(key);
      expect(onOpenStandings).toHaveBeenCalledWith('A');
    },
  );

  it('does NOT open the overlay when a row flag is clicked (flag fires only onFocusTeam)', async () => {
    const onOpenStandings = vi.fn();
    const onFocusTeam = vi.fn();
    const user = userEvent.setup();
    render(
      <GroupTableNode group={GROUP} onOpenStandings={onOpenStandings} onFocusTeam={onFocusTeam} />,
    );
    // The flag button carries its own "Show matches for {team}" label and must
    // stopPropagation so the click never bubbles to the header opener.
    const flag = screen.getByRole('button', { name: 'Show matches for Argentina' });
    await user.click(flag);
    expect(onFocusTeam).toHaveBeenCalledTimes(1);
    expect(onFocusTeam).toHaveBeenCalledWith('team-arg');
    expect(onOpenStandings).not.toHaveBeenCalled();
  });

  it('exposes the opener and the flags as SIBLING controls (the opener fires no onFocusTeam)', async () => {
    // The header button and the row flags are independent siblings inside the
    // table, never nested: activating the opener must NOT also set a focused team.
    const onOpenStandings = vi.fn();
    const onFocusTeam = vi.fn();
    const user = userEvent.setup();
    render(
      <GroupTableNode group={GROUP} onOpenStandings={onOpenStandings} onFocusTeam={onFocusTeam} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open Group A standings' }));
    expect(onOpenStandings).toHaveBeenCalledWith('A');
    expect(onFocusTeam).not.toHaveBeenCalled();
  });
});

describe('GroupTableNode — overlay path renders a non-interactive header [C1]', () => {
  it('renders NO "Open Group … standings" button when onOpenStandings is absent', () => {
    // The on-demand StandingsOverlay reuses GroupTableNode WITHOUT an opener, so
    // its header stays a plain non-interactive <header> (no nested open button).
    render(<GroupTableNode group={GROUP} />);
    expect(screen.queryByRole('button', { name: /Open Group .* standings/ })).toBeNull();
    // The labelled section + title still render (the table's accessible name).
    expect(screen.getByRole('table')).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Group A standings' });
    expect(within(section).getByText('Group A')).toBeInTheDocument();
  });
});

// ============================================================================
// Compact column set @ 320px overlay (requirement 1336, scope #4 / AC #4).
// ============================================================================
// On a 320px viewport the overlay renders GroupTableNode in its `compact` form:
// the variable middle stat columns collapse to MP + GD only, so the visible
// matrix is `# / Team / MP / GD / Pts` (5 columns). The always-on canvas node
// (no `compact` prop) keeps the full 7-stat-column matrix. The stat-column
// labels are uppercased in the DOM (`uppercase` on the header row) but the
// source labels are already uppercase ("MP", "GD"), so we match on text.
//
// RED until GroupTableNode accepts `compact` and reads its column set from
// `pickStandingsColumns(compact ? 'compact' : 'full')`.
describe('GroupTableNode — compact column set (mobile overlay) [Acceptance #4]', () => {
  it('renders exactly # / Team / MP / GD / Pts when compact', () => {
    render(<GroupTableNode group={GROUP_A} compact />);
    expect(getStatHeaderLabels()).toEqual([...COMPACT_HEADER_LABELS]);
  });

  it('OMITS the W/D/L/GF/GA stat headers when compact (they do not fit 320px)', () => {
    render(<GroupTableNode group={GROUP_A} compact />);
    const labels = getStatHeaderLabels();
    for (const dropped of COMPACT_DROPPED_LABELS) {
      expect(labels).not.toContain(dropped);
    }
  });

  it('still renders MP + GD body cells for each row when compact', () => {
    render(<GroupTableNode group={GROUP_A} compact />);
    // Argentina (position 1): played 3, GD +6 in the FULL_TABLE fixture.
    expect(screen.getByText('+6')).toBeInTheDocument();
    // "3" (played / matches) appears per row; at least one MP cell renders it.
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('renders the FULL 7-stat matrix by default (no compact prop) — regression guard', () => {
    render(<GroupTableNode group={GROUP_A} />);
    expect(getStatHeaderLabels()).toEqual([...FULL_HEADER_LABELS]);
  });

  it('renders the FULL matrix when compact={false} is explicit (default-path parity)', () => {
    render(<GroupTableNode group={GROUP_A} compact={false} />);
    const labels = getStatHeaderLabels();
    expect(labels).toContain('GF');
    expect(labels).toContain('GA');
  });
});

// ============================================================================
// LOD `data-lod-detail` regression (requirement 1336, M3 / AC #6).
// ============================================================================
// `STAT_COLUMNS` (with its per-column `detail` flag) moves out of this file into
// `responsive.ts`. The always-on node's overview-zoom fade keys off
// `data-lod-detail`, emitted on the secondary stat cells (mp/w/d/l/gf/ga, all
// `detail:true`) but NOT on GD (`detail:false`), nor on #/Team/Pts. These cases
// prove the relocated `detail` flag survives the move so the fade is unchanged.
describe('GroupTableNode — LOD data-lod-detail survives the STAT_COLUMNS move [Acceptance #6]', () => {
  /** All header <th> elements carrying the LOD-detail marker. */
  function detailHeaderLabels(): string[] {
    const table = screen.getByRole('table');
    return Array.from(table.querySelectorAll('thead [data-lod-detail]')).map(
      (el) => el.textContent?.trim() ?? '',
    );
  }

  it('marks MP/W/D/L/GF/GA header cells with data-lod-detail (full set)', () => {
    render(<GroupTableNode group={GROUP_A} />);
    expect(new Set(detailHeaderLabels())).toEqual(new Set(['MP', 'W', 'D', 'L', 'GF', 'GA']));
  });

  it('does NOT mark GD / Pts / # / Team with data-lod-detail (detail:false stays unfaded)', () => {
    render(<GroupTableNode group={GROUP_A} />);
    const marked = detailHeaderLabels();
    for (const stable of ['GD', 'Pts', '#', 'Team']) {
      expect(marked).not.toContain(stable);
    }
  });

  it('emits data-lod-detail on the body stat cells too (not just the header)', () => {
    render(<GroupTableNode group={GROUP_A} />);
    const table = screen.getByRole('table');
    // 6 detail stat columns × 4 rows = 24 marked <td>; assert the body carries them.
    const bodyMarked = table.querySelectorAll('tbody td[data-lod-detail]');
    expect(bodyMarked.length).toBe(24);
  });
});

// ============================================================================
// Touch target — the row flag button is ≥44px hit area on coarse pointers
// (requirement 1336, scope #5 / AC #5).
// ============================================================================
// The flag <button> (onFocusTeam) must grow its tap area to ≥44px under
// `pointer: coarse` WITHOUT changing its accessible name, role, or stopPropagation
// semantics, and without inflating the 18px flag icon. We can't measure real
// layout in jsdom, so we assert the CONTRACT: the button keeps its button
// semantics + label, and carries a coarse-pointer sizing hook (a `pointer-coarse:`
// utility, a min-h/min-w token, or a hit-slop class). RED until GroupTableNode
// adds the coarse-pointer hit area.
describe('GroupTableNode — flag button is a ≥44px touch target on coarse pointers [Acceptance #5]', () => {
  it('keeps the flag a <button> with its "Show matches for {team}" label (semantics unchanged)', () => {
    render(<GroupTableNode group={GROUP_A_PAIR} onFocusTeam={vi.fn()} />);
    const flag = screen.getByRole('button', { name: 'Show matches for Argentina' });
    expect(flag.tagName).toBe('BUTTON');
    expect(flag).toHaveAttribute('type', 'button');
  });

  it('carries a coarse-pointer hit-area class (≥44px tap target) on the flag button', () => {
    render(<GroupTableNode group={GROUP_A_PAIR} onFocusTeam={vi.fn()} />);
    const flag = screen.getByRole('button', { name: 'Show matches for Argentina' });
    // Any of the standard non-destructive techniques (pointer-coarse variant,
    // min-h/min-w token, named hit-slop class) satisfies the shared contract; the
    // desktop visual size stays compact and the 18px flag icon is unchanged.
    expectCoarseHitArea(flag);
  });

  it('keeps the 18px flag glyph unchanged while growing only the hit area', () => {
    // The hit-area growth must come from the BUTTON (padding / min-h), never from
    // inflating the glyph: the `<Flag size={18}>` monogram (flagUrl is null in the
    // fixtures) must still render at width:18px so the desktop visual density is
    // untouched. Pins the icon is NOT how the ≥44px target is achieved.
    render(<GroupTableNode group={GROUP_A_PAIR} onFocusTeam={vi.fn()} />);
    const flag = screen.getByRole('button', { name: 'Show matches for Argentina' });
    const glyph = flag.querySelector('[aria-hidden="true"]') as HTMLElement | null;
    expect(glyph).not.toBeNull();
    expect(glyph!.style.width).toBe('18px');
  });
});
