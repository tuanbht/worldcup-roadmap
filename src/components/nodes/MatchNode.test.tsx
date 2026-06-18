// @vitest-environment jsdom
//
// Per-file jsdom pragma (matches MatchDetailPanel.test.tsx / useTournamentQuery
// .test.tsx). Reinforces the build-graph handle/payload contract (#14/#16) at the
// component boundary: a group card must render its "Group A · MD1" label and the
// new vertical handles (one top target, one bottom source); a KO card must not.
//
// RED until MatchNode is migrated: today it renders left/right handles (tl/tr/
// sl/sr) and no group/matchday label.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider, Position } from '@xyflow/react';
import { teamRef, EMPTY_SCORE } from '@/domain/types';
import type { Team } from '@/domain/types';
import type { MatchNodeData } from '@/features/roadmap/graph-model';
import { MatchNode } from './MatchNode';

const ARG: Team = { id: 'team-arg', name: 'Argentina', code: 'ARG', flagUrl: null };
const FRA: Team = { id: 'team-fra', name: 'France', code: 'FRA', flagUrl: null };

function makeData(overrides: Partial<MatchNodeData>): MatchNodeData {
  return {
    matchId: 'm1',
    stage: 'GROUP_STAGE',
    roundLabel: 'Group Stage',
    group: 'A',
    matchday: 1,
    home: teamRef(ARG),
    away: teamRef(FRA),
    score: EMPTY_SCORE,
    status: 'scheduled',
    kickoff: '2026-06-02T14:30:00.000Z',
    minute: null,
    venue: { name: null, city: null },
    isFinal: false,
    isThirdPlace: false,
    ...overrides,
  };
}

/** Render a MatchNode inside the RF provider context Handle requires. */
function renderNode(data: MatchNodeData) {
  return render(
    <ReactFlowProvider>
      <MatchNode
        id={data.matchId}
        type="match"
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

describe('MatchNode — group label', () => {
  it('renders "Group A · MD1" for a group card', () => {
    renderNode(makeData({ group: 'A', matchday: 1 }));
    expect(screen.getByText(/Group A.*MD1/)).toBeInTheDocument();
  });

  it('falls back to "Group A" (no MD) when matchday is null, never the stage label', () => {
    // FIFA supplies GroupName but not MatchDay for WC-2026 group matches, so
    // matchday arrives null. The card must still read by group, not "Group Stage".
    renderNode(makeData({ group: 'A', matchday: null, roundLabel: 'Group Stage' }));
    expect(screen.getByText('Group A')).toBeInTheDocument();
    expect(screen.queryByText('Group Stage')).not.toBeInTheDocument();
  });

  it('renders no group label for a knockout card', () => {
    renderNode(makeData({ stage: 'FINAL', roundLabel: 'Final', group: null, matchday: null }));
    expect(screen.queryByText(/Group [A-L].*MD\d/)).not.toBeInTheDocument();
  });
});

describe('MatchNode — vertical handles', () => {
  it('exposes exactly one top target and one bottom source handle', () => {
    const { container } = renderNode(makeData({}));
    const handles = container.querySelectorAll('.react-flow__handle');
    const targets = container.querySelectorAll('.react-flow__handle-top');
    const sources = container.querySelectorAll('.react-flow__handle-bottom');
    expect(handles).toHaveLength(2);
    expect(targets).toHaveLength(1);
    expect(sources).toHaveLength(1);
  });

  it('uses no left/right handle positions', () => {
    const { container } = renderNode(makeData({}));
    expect(container.querySelectorAll('.react-flow__handle-left')).toHaveLength(0);
    expect(container.querySelectorAll('.react-flow__handle-right')).toHaveLength(0);
    // Sanity: Position enum imported so the test fails loudly if RF drops it.
    expect(Position.Top).toBeDefined();
    expect(Position.Bottom).toBeDefined();
  });
});
