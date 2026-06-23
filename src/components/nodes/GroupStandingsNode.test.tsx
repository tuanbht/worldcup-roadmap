// @vitest-environment jsdom
//
// Component spec for GroupStandingsNode — the always-on Google-style standings
// table under each group header (requirement item 2; plan Test Strategy 7 /
// Acceptance #2). It must render:
//   - a row per StandingRow, ORDERED BY `position` (1..N top-to-bottom),
//   - the full column set # / team / MP / W / D / L / GF / GA / GD / Pts, with
//     Pts emphasized,
//   - `qualified` rows visually accented,
//   - each row's flag as a FOCUSABLE button that calls `onFocusTeam(team.id)`
//     (mouse + keyboard).
//
// Counts/values are taken from a small explicit Group fixture so the column
// numbers are unambiguous; the rows are intentionally supplied OUT of position
// order to prove the node sorts by `position` rather than trusting input order.
//
// RED until GroupStandingsNode.tsx is implemented (today the stub throws), so each
// assertion fails as "not implemented" rather than a typo/import error.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { GroupStandingsNodeData } from '@/features/roadmap/graph-model';
import { GroupStandingsNode } from './GroupStandingsNode';
import { FULL_TABLE, GROUP_A, GROUP_A_EMPTY } from './__test-support__/standings-fixtures';

// Shared fixture: 4 teams, column-distinct stats, supplied OUT of position order
// (3,1,4,2) so the node must sort by `position`. Argentina(1) & Poland(2) are
// qualified; Mexico(3) & Saudi Arabia(4) are not.
const TABLE = FULL_TABLE;

function makeData(overrides: Partial<GroupStandingsNodeData> = {}): GroupStandingsNodeData {
  return { group: GROUP_A, ...overrides };
}

function renderNode(data: GroupStandingsNodeData) {
  return render(
    <ReactFlowProvider>
      <GroupStandingsNode
        id={`group-standings-${data.group.name}`}
        type="group-standings"
        data={data}
        dragging={false}
        isConnectable={false}
        selected={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        deletable
        selectable
        draggable
      />
    </ReactFlowProvider>,
  );
}

describe('GroupStandingsNode — one row per team, ordered by position', () => {
  it('renders a body row per StandingRow (4 teams)', () => {
    renderNode(makeData());
    const rows = screen.getAllByRole('row');
    // 4 team rows + 1 header row.
    expect(rows.length).toBe(TABLE.length + 1);
    for (const r of TABLE) {
      expect(screen.getByText(r.team.name)).toBeInTheDocument();
    }
  });

  it('orders the team rows by position (1=Argentina .. 4=Saudi Arabia), not input order', () => {
    renderNode(makeData());
    const names = screen
      .getAllByRole('row')
      .slice(1) // drop the header row
      .map((tr) => within(tr).getByText(/Argentina|Poland|Mexico|Saudi Arabia/).textContent);
    expect(names).toEqual(['Argentina', 'Poland', 'Mexico', 'Saudi Arabia']);
  });
});

describe('GroupStandingsNode — full column set incl. Pts [Acceptance #2]', () => {
  it('renders the # / Team / MP / W / D / L / GF / GA / GD / Pts headers in Google order', () => {
    renderNode(makeData());
    const headerRow = screen.getAllByRole('row')[0];
    const headers = within(headerRow)
      .getAllByRole('columnheader')
      .map((th) => (th.textContent ?? '').trim());
    // The full Google-style column set in the spec's ORDER (not just presence):
    // a transposed/missing column is caught, with Pts as the final emphasized stat.
    expect(headers).toEqual(['#', 'Team', 'MP', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts']);
  });

  it("renders Argentina's full stat line (MP 3 / W 3 / D 0 / L 0 / GF 7 / GA 1 / GD +6 / Pts 9)", () => {
    renderNode(makeData());
    const argRow = screen.getByText('Argentina').closest('tr')!;
    const cells = within(argRow)
      .getAllByRole('cell')
      .map((td) => (td.textContent ?? '').trim());
    // Every numeric stat appears in Argentina's row.
    expect(cells).toEqual(expect.arrayContaining(['3', '7', '1', '+6', '9']));
    expect(cells).toContain('0'); // W/D/L zeros present
  });

  it('emphasizes Pts: the points cell is bold/strong relative to the secondary columns', () => {
    renderNode(makeData());
    const argRow = screen.getByText('Argentina').closest('tr')!;
    // The Pts value (9) lives in a cell carrying a bold/strong class — the
    // emphasized column the spec calls out.
    const ptsCell = within(argRow)
      .getAllByRole('cell')
      .find((td) => (td.textContent ?? '').trim() === '9')!;
    expect(ptsCell.className).toMatch(/font-bold|font-extrabold|font-semibold/);
  });
});

describe('GroupStandingsNode — qualified accent [Acceptance #2]', () => {
  it('accents the qualified rows (top two) and not the rest', () => {
    renderNode(makeData());
    const qualifiedRow = screen.getByText('Argentina').closest('tr')!;
    const eliminatedRow = screen.getByText('Saudi Arabia').closest('tr')!;
    // The qualified row carries an accent class the eliminated row lacks.
    expect(qualifiedRow.className).toMatch(/accent/);
    expect(eliminatedRow.className).not.toMatch(/accent/);
  });
});

describe('GroupStandingsNode — flag focus button [Acceptance #5]', () => {
  it("makes a row's flag a focusable button that calls onFocusTeam(team.id) on click", async () => {
    const onFocusTeam = vi.fn();
    const user = userEvent.setup();
    renderNode(makeData({ onFocusTeam }));

    const argRow = screen.getByText('Argentina').closest('tr')!;
    const button = within(argRow).getByRole('button');
    await user.click(button);

    expect(onFocusTeam).toHaveBeenCalledWith('team-arg');
  });

  it('activates the flag by keyboard (Enter/Space) for accessibility [Acceptance #8]', async () => {
    const onFocusTeam = vi.fn();
    const user = userEvent.setup();
    renderNode(makeData({ onFocusTeam }));

    const argRow = screen.getByText('Argentina').closest('tr')!;
    const button = within(argRow).getByRole('button');
    button.focus();
    await user.keyboard('{Enter}');

    expect(onFocusTeam).toHaveBeenCalledWith('team-arg');
  });
});

describe('GroupStandingsNode — membership source handle [Acceptance #7]', () => {
  it('exposes exactly one bottom source handle (id="b") and no top handle', () => {
    // The deleted group-header pill held the bottom `id="b"` source handle that
    // edges originate from; it moves here so the dashed membership edges fan out
    // of the standings table. No top handle — nothing routes INTO the table.
    const { container } = renderNode(makeData());
    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(1);
    expect(container.querySelectorAll('.react-flow__handle-bottom')).toHaveLength(1);
    expect(container.querySelectorAll('.react-flow__handle-top')).toHaveLength(0);
  });
});

describe('GroupStandingsNode — overlay opener threading [C1 / Acceptance #12]', () => {
  it('threads onOpenStandings into the table header button (calls it with the group name)', async () => {
    const onOpenStandings = vi.fn();
    const user = userEvent.setup();
    renderNode(makeData({ onOpenStandings }));
    // The table header becomes the "Open Group A standings" button when the node
    // data carries an opener; activating it opens the overlay for THIS group.
    const opener = screen.getByRole('button', { name: 'Open Group A standings' });
    await user.click(opener);
    expect(onOpenStandings).toHaveBeenCalledTimes(1);
    expect(onOpenStandings).toHaveBeenCalledWith('A');
  });

  it('activates the threaded opener by keyboard (Enter) for accessibility [Acceptance #8]', async () => {
    // The opener is the re-homed pill button; keyboard users must reach the
    // overlay through the standings node exactly as the deleted pill allowed.
    const onOpenStandings = vi.fn();
    const user = userEvent.setup();
    renderNode(makeData({ onOpenStandings }));
    screen.getByRole('button', { name: 'Open Group A standings' }).focus();
    await user.keyboard('{Enter}');
    expect(onOpenStandings).toHaveBeenCalledWith('A');
  });

  it('a row flag click sets the focused team WITHOUT opening the overlay (stopPropagation)', async () => {
    const onOpenStandings = vi.fn();
    const onFocusTeam = vi.fn();
    const user = userEvent.setup();
    renderNode(makeData({ onOpenStandings, onFocusTeam }));

    const argRow = screen.getByText('Argentina').closest('tr')!;
    const flag = within(argRow).getByRole('button', { name: 'Show matches for Argentina' });
    await user.click(flag);

    expect(onFocusTeam).toHaveBeenCalledWith('team-arg');
    expect(onOpenStandings).not.toHaveBeenCalled();
  });

  it('renders no header opener button when onOpenStandings is absent', () => {
    renderNode(makeData());
    expect(screen.queryByRole('button', { name: /Open Group .* standings/ })).toBeNull();
  });
});

describe('GroupStandingsNode — empty / placeholder group (boundary)', () => {
  it('renders the labelled table header with no body rows when standings are empty', () => {
    // Early in the tournament a group can have an empty `table` (no results yet).
    // The node must still render its labelled standings shell + header row — never
    // throw or collapse — so the always-on column reads as "Group X, no rows yet".
    renderNode(makeData({ group: GROUP_A_EMPTY }));

    // The standings section is present and labelled (the e2e/overlay hook).
    expect(screen.getByRole('table')).toBeInTheDocument();
    // Only the header row exists — zero team rows, zero focus buttons.
    expect(screen.getAllByRole('row')).toHaveLength(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // The Pts column header still renders so the layout is stable across states.
    expect(within(screen.getAllByRole('row')[0]).getByText('Pts')).toBeInTheDocument();
  });
});
