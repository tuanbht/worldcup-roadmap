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
// The row focus-team controls (onFocusTeam) are SEPARATE controls with their own
// `aria-label="Show matches for {team}"` and must `stopPropagation`, so a row
// click sets the focused team WITHOUT also opening the overlay.
//
// NOTE (requirement 2026-06-24-1030, row-as-tap-target pivot): the focus-team
// control is no longer a tiny per-flag <button> inside the Team cell. Each canvas
// standings row's interactive <tr> is the SOLE `position: relative` containing
// block; its STATIC Team <td> holds a real `<button type="button">` that is
// `position: absolute; inset: 0`, so it resolves against the <tr> and spans the
// FULL row width (~94px on-screen at the 0.32 floor → ≥44px tap target with zero
// overlap → no mis-tap). The flag glyph + name + stats are DECORATIVE content
// rendered UNDER that button; there is exactly ONE focus-team control per row.
//
// Asserted directly on GroupTableNode (not the contended RoadmapCanvas.test.tsx),
// per the concurrency guardrail. Counts/values come from a tiny explicit Group
// fixture.
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

  it('does NOT open the overlay when a row focus button is clicked (row fires only onFocusTeam)', async () => {
    const onOpenStandings = vi.fn();
    const onFocusTeam = vi.fn();
    const user = userEvent.setup();
    render(
      <GroupTableNode group={GROUP} onOpenStandings={onOpenStandings} onFocusTeam={onFocusTeam} />,
    );
    // The row-spanning focus button carries its own "Show matches for {team}"
    // label and must stopPropagation so a row tap never bubbles to the header
    // opener (no double action).
    const rowButton = screen.getByRole('button', { name: 'Show matches for Argentina' });
    await user.click(rowButton);
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
// Row-as-tap-target — each canvas standings row's focus-team control is a single
// full-row-spanning <button> (requirement 2026-06-24-1030, AC #1/#2/#3/#5).
// ============================================================================
// The counter-scale-the-flag approach (a 44px-on-screen flag box) was proven to
// mis-tap 3 of 4 rows at the 0.32 zoom floor (rows are ~8.9px apart on-screen, so
// a 44px box overlaps ~3 neighbours). The owner pivoted to ROW-AS-TARGET: each
// interactive <tr> is the SOLE `position: relative` containing block, its STATIC
// Team <td> holds a real `<button type="button" class="absolute inset-0 nopan">`
// that resolves against the <tr> → spans the full ~294px row (~94px on-screen at
// 0.32 ≈ 2.1× the 44px minimum), tiling with zero overlap. The flag glyph + name
// + stats are decorative content under that button. NO counter-scale machinery
// (no hitInverse, no `--hit-inv`, no glyph counter-scale).
//
// jsdom can't measure the post-transform layout (the e2e width assertion does
// that), but it CAN pin the structural DOM contract that produces the full-row
// span: a `relative` interactive <tr> as the sole containing block, a STATIC Team
// <td> (NOT relative — else `inset-0` resolves to the ~12px cell, the H3 bug), and
// a single `absolute inset-0` focus-team <button> per row. RED at the baseline,
// where the focus control is a tiny per-flag <button> (no `absolute`/`inset-0`,
// the <tr> is not `relative`, the glyph is wrapped IN the button).

/** Find the body <tr> whose Team cell names `teamName`. */
function rowForTeam(teamName: string): HTMLTableRowElement {
  const row = screen.getByText(teamName).closest('tr');
  if (!row) throw new Error(`no <tr> found for team "${teamName}"`);
  return row as HTMLTableRowElement;
}

/**
 * Render the canvas path (onFocusTeam supplied) for the given group and return
 * the spy so callers can assert against it. The single place that wires the
 * canvas-path render keeps every row-button spec reading the SAME shape.
 */
function renderCanvasTable(group = GROUP_A_PAIR): { onFocusTeam: ReturnType<typeof vi.fn> } {
  const onFocusTeam = vi.fn();
  render(<GroupTableNode group={group} onFocusTeam={onFocusTeam} />);
  return { onFocusTeam };
}

/** The single full-row focus-team control for `teamName`, by its accessible name. */
function focusButtonFor(teamName: string): HTMLElement {
  return screen.getByRole('button', { name: `Show matches for ${teamName}` });
}

/** The interactive <tr> + its Team <td> that own the focus button for `teamName`. */
function rowControlAnatomy(teamName: string): {
  button: HTMLElement;
  teamCell: HTMLTableCellElement;
  row: HTMLTableRowElement;
} {
  const button = focusButtonFor(teamName);
  const teamCell = button.closest('td');
  const row = button.closest('tr');
  if (!teamCell) throw new Error(`focus button for "${teamName}" is not inside a <td>`);
  if (!row) throw new Error(`focus button for "${teamName}" is not inside a <tr>`);
  return { button, teamCell, row };
}

describe('GroupTableNode — canvas row is a full-row-spanning focus-team button [AC #1/#3/#5]', () => {
  it('exposes EXACTLY ONE "Show matches for {team}" control per row (no double tab stop) [AC #5]', () => {
    // Flag-is-decorative invariant: the only interactive control inside an
    // interactive row is the row-spanning focus button — never a second nested
    // button on the flag. At the baseline the per-flag button still matches the
    // name, so this passes there; the SPAN/containing-block tests below are the
    // ones that fail until the row-spanning button ships. Kept as the AC #5 pin.
    renderCanvasTable();
    for (const teamName of ['Argentina', 'Poland']) {
      const row = rowForTeam(teamName);
      const controls = within(row)
        .getAllByRole('button')
        .filter((b) => /^Show matches for/.test(b.getAttribute('aria-label') ?? ''));
      expect(controls).toHaveLength(1);
    }
  });

  it('renders the focus control as a real <button type="button"> with the team accessible name', () => {
    renderCanvasTable();
    const button = focusButtonFor('Argentina');
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('CSS-stretches the focus button across the full row (absolute inset-0) — the ≥44px-wide mechanism', () => {
    // The full-row span is produced by `position: absolute; inset: 0` resolving
    // against a `position: relative` <tr>. jsdom can't measure the resulting box,
    // but the className IS the layout contract: an `absolute inset-0` button is the
    // ONLY shape that spans the row. The baseline per-flag button is a static
    // inline-flex chip with neither class → RED here.
    renderCanvasTable();
    const button = focusButtonFor('Argentina');
    expect(button.className).toMatch(/(^|\s)absolute(\s|$)/);
    expect(button.className).toMatch(/inset-0/);
  });

  it('makes the interactive <tr> the SOLE positioned containing block (relative <tr>, STATIC Team <td>)', () => {
    // AC #3 / the H3 fix: the <tr> must be `position: relative` so `inset-0`
    // resolves against the full ~294px row; the Team <td> holding the button must
    // stay STATIC (no `relative`) — if it were relative, `inset-0` would resolve to
    // the ~38px cell (~12px on-screen) and fail AC #1. At the baseline the <tr> is
    // not `relative` at all → RED.
    renderCanvasTable();
    const { teamCell, row } = rowControlAnatomy('Argentina');
    // The Team <td> must NOT introduce its own containing block.
    expect(teamCell.className).not.toMatch(/(^|\s)relative(\s|$)/);
    // The <tr> is the sole positioned ancestor that `inset-0` resolves against.
    expect(row.className).toMatch(/(^|\s)relative(\s|$)/);
  });

  it('makes EVERY interactive row the sole relative containing block — not just the top row', () => {
    // The H3 fix must hold for every row, not only Argentina: a per-row absolute
    // button needs its OWN relative <tr>. Pin both rows of the pair so a partial
    // implementation that stretches only the first row is caught. RED at baseline
    // (no <tr> is `relative`).
    renderCanvasTable();
    for (const teamName of ['Argentina', 'Poland']) {
      const { teamCell, row } = rowControlAnatomy(teamName);
      expect(row.className, `${teamName} row must be the relative containing block`).toMatch(
        /(^|\s)relative(\s|$)/,
      );
      expect(
        teamCell.className,
        `${teamName} Team <td> must stay static so inset-0 resolves to the <tr>`,
      ).not.toMatch(/(^|\s)relative(\s|$)/);
    }
  });

  it('keeps `nopan` on the focus button so a row tap never starts a React Flow pan', () => {
    renderCanvasTable();
    expect(focusButtonFor('Argentina').className).toMatch(/(^|\s)nopan(\s|$)/);
  });
});

describe('GroupTableNode — row tap focuses the CORRECT team (no mis-tap) [AC #2]', () => {
  // The full 4-team GROUP_A fixture catches a transposed row→team mapping: the TOP
  // row (Argentina, position 1) and a MIDDLE row (Mexico, position 3) must each
  // focus THEIR OWN team — never a neighbour. Covering a top AND a middle row, on
  // click AND both keyboard activations, is the complete no-mis-tap contract.
  const ROW_CASES = [
    { where: 'top row', teamName: 'Argentina', teamId: 'team-arg' },
    { where: 'middle row', teamName: 'Mexico', teamId: 'team-mex' },
  ] as const;

  it.each(ROW_CASES)(
    'clicking the $where button ($teamName) calls onFocusTeam exactly once with that row team id',
    async ({ teamName, teamId }) => {
      const onFocusTeam = vi.fn();
      const user = userEvent.setup();
      render(<GroupTableNode group={GROUP_A} onFocusTeam={onFocusTeam} />);
      await user.click(focusButtonFor(teamName));
      expect(onFocusTeam).toHaveBeenCalledTimes(1);
      expect(onFocusTeam).toHaveBeenCalledWith(teamId);
      // Negative pin: it focuses THIS team, never a neighbour's id.
      expect(onFocusTeam).not.toHaveBeenCalledWith('team-pol');
      expect(onFocusTeam).not.toHaveBeenCalledWith('team-ksa');
    },
  );

  // Both rows × both native activation keys (Enter AND Space) — a div+onKeyDown
  // shim would miss one; a native <button> fires click on both. This pins the
  // per-row mapping under keyboard, not just mouse.
  it.each(
    ROW_CASES.flatMap(({ where, teamName, teamId }) =>
      ['{Enter}', ' '].map((key) => ({ where, key, teamName, teamId })),
    ),
  )(
    'keyboard $key on the focused $where button ($teamName) calls onFocusTeam(team.id) — native <button> semantics',
    async ({ key, teamName, teamId }) => {
      const onFocusTeam = vi.fn();
      const user = userEvent.setup();
      render(<GroupTableNode group={GROUP_A} onFocusTeam={onFocusTeam} />);
      focusButtonFor(teamName).focus();
      await user.keyboard(key);
      expect(onFocusTeam).toHaveBeenCalledTimes(1);
      expect(onFocusTeam).toHaveBeenCalledWith(teamId);
    },
  );
});

describe('GroupTableNode — the flag glyph stays decorative + 18px under the button [AC #4]', () => {
  it('renders the flag as a decorative aria-hidden glyph that is NOT its own button', () => {
    // The per-flag <button> is removed: the flag is a bare `aria-hidden` span
    // rendered UNDER the row-spanning button. So no interactive control wraps ONLY
    // the glyph — the glyph is decorative content of the row.
    renderCanvasTable();
    const row = rowForTeam('Argentina');
    const glyph = within(row).getByText('ARG'); // the monogram (flagUrl is null)
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph.tagName).toBe('SPAN');
    // The glyph's nearest <button> ancestor (if any) must be the full-row focus
    // control with the team accessible name — never a button that wraps ONLY the
    // glyph. (At baseline the per-flag button matches that name too, so this stays
    // green; the SPAN/relative tests are the ones still RED.)
    const buttonAncestor = glyph.closest('button');
    if (buttonAncestor) {
      expect(buttonAncestor.getAttribute('aria-label')).toMatch(/^Show matches for/);
    }
  });

  it('keeps the 18px flag glyph unchanged (decorative content, visually unaffected) — line-226 guard', () => {
    // The existing line-226 glyph guard, re-pointed to the row-spanning button: the
    // sole `aria-hidden` glyph inside the row still renders at 18px (the <Flag
    // size={18}> inline style), so the decorative flag is visually unchanged by the
    // row-as-target pivot.
    renderCanvasTable();
    const row = rowForTeam('Argentina');
    const glyphs = row.querySelectorAll('[aria-hidden="true"]');
    // Exactly one decorative glyph per row — the flag monogram, no extra hidden
    // affordance smuggled in.
    expect(glyphs).toHaveLength(1);
    expect((glyphs[0] as HTMLElement).style.width).toBe('18px');
  });
});

describe('GroupTableNode — overlay path renders NO focus button (decorative rows) [AC #7]', () => {
  it('renders NO "Show matches for" button when onFocusTeam is absent (overlay path)', () => {
    // The on-demand StandingsOverlay reuses GroupTableNode WITHOUT onFocusTeam, so
    // its rows have NO focus button — byte-identical decorative cells. This stays
    // green at the baseline AND under the new contract (the DOM-overlay invariant).
    render(<GroupTableNode group={GROUP_A_PAIR} />);
    expect(screen.queryByRole('button', { name: /Show matches for/ })).toBeNull();
    // The table + decorative flag glyph still render.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('ARG')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does NOT make the overlay-path <tr> a positioned containing block (no relative row)', () => {
    // No focus button → no `position: relative` <tr> needed; the overlay path rows
    // stay plain static table rows (no layout change vs. today).
    render(<GroupTableNode group={GROUP_A_PAIR} />);
    const row = rowForTeam('Argentina');
    expect(row.className).not.toMatch(/(^|\s)relative(\s|$)/);
  });

  it('keeps the decorative 18px flag glyph in the overlay path too (no per-flag button)', () => {
    // The overlay path must remain byte-identical: the same single decorative
    // 18px glyph, never an interactive control. This is the no-onFocusTeam parity
    // pin and stays green at baseline AND under the new contract.
    render(<GroupTableNode group={GROUP_A_PAIR} />);
    const row = rowForTeam('Argentina');
    const glyphs = row.querySelectorAll('[aria-hidden="true"]');
    expect(glyphs).toHaveLength(1);
    expect((glyphs[0] as HTMLElement).style.width).toBe('18px');
    expect(within(row).queryByRole('button')).toBeNull();
  });
});
