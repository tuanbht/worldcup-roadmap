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
import type { Group, StandingRow, Team } from '@/domain/types';
import type { GroupStandingsNodeData } from '@/features/roadmap/graph-model';
import { GroupStandingsNode } from './GroupStandingsNode';

const ARG: Team = { id: 'team-arg', name: 'Argentina', code: 'ARG', flagUrl: null };
const POL: Team = { id: 'team-pol', name: 'Poland', code: 'POL', flagUrl: null };
const MEX: Team = { id: 'team-mex', name: 'Mexico', code: 'MEX', flagUrl: null };
const KSA: Team = { id: 'team-ksa', name: 'Saudi Arabia', code: 'KSA', flagUrl: null };

function row(team: Team, overrides: Partial<StandingRow>): StandingRow {
  return {
    position: 1,
    team,
    played: 3,
    won: 0,
    draw: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: [],
    qualified: false,
    ...overrides,
  };
}

// Distinct, unambiguous numbers per column so a mislabeled column is caught.
// Supplied OUT of order (pos 3,1,4,2) to prove the node sorts by `position`.
const TABLE: StandingRow[] = [
  row(MEX, {
    position: 3,
    won: 1,
    draw: 1,
    lost: 1,
    goalsFor: 4,
    goalsAgainst: 5,
    goalDifference: -1,
    points: 4,
    qualified: false,
  }),
  row(ARG, {
    position: 1,
    won: 3,
    draw: 0,
    lost: 0,
    goalsFor: 7,
    goalsAgainst: 1,
    goalDifference: 6,
    points: 9,
    qualified: true,
  }),
  row(KSA, {
    position: 4,
    won: 0,
    draw: 1,
    lost: 2,
    goalsFor: 2,
    goalsAgainst: 8,
    goalDifference: -6,
    points: 1,
    qualified: false,
  }),
  row(POL, {
    position: 2,
    won: 2,
    draw: 0,
    lost: 1,
    goalsFor: 5,
    goalsAgainst: 3,
    goalDifference: 2,
    points: 6,
    qualified: true,
  }),
];

const GROUP: Group = { name: 'A', table: TABLE };

function makeData(overrides: Partial<GroupStandingsNodeData> = {}): GroupStandingsNodeData {
  return { group: GROUP, ...overrides };
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

describe('GroupStandingsNode — empty / placeholder group (boundary)', () => {
  it('renders the labelled table header with no body rows when standings are empty', () => {
    // Early in the tournament a group can have an empty `table` (no results yet).
    // The node must still render its labelled standings shell + header row — never
    // throw or collapse — so the always-on column reads as "Group X, no rows yet".
    const empty: Group = { name: 'A', table: [] };
    renderNode(makeData({ group: empty }));

    // The standings section is present and labelled (the e2e/overlay hook).
    expect(screen.getByRole('table')).toBeInTheDocument();
    // Only the header row exists — zero team rows, zero focus buttons.
    expect(screen.getAllByRole('row')).toHaveLength(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // The Pts column header still renders so the layout is stable across states.
    expect(within(screen.getAllByRole('row')[0]).getByText('Pts')).toBeInTheDocument();
  });
});
