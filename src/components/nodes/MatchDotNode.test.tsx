// @vitest-environment jsdom
//
// Component spec for MatchDotNode — the inner-ring KO match dot of the radial
// circle view (requirement 2026-06-30-1104; plan Test Strategy 23 / Acceptance
// #3). The dot exposes its status via `data-status` (live/finished/scheduled →
// the live/decided/undecided color), an accessible label, and `data-focus`.
//
// RED until MatchDotNode is implemented (today the stub renders null), so each
// assertion fails on the MISSING element/attribute, not an import error.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { teamRef } from '@/domain/types';
import type { MatchDotNodeData } from '@/features/roadmap/graph-model';
import { ARG, FRA } from './__test-support__/team-row-fixtures';
import { MatchDotNode } from './MatchDotNode';

function makeData(overrides: Partial<MatchDotNodeData> = {}): MatchDotNodeData {
  return {
    matchId: 'wc2026-r16-1',
    stage: 'ROUND_OF_16',
    roundLabel: 'Round of 16',
    status: 'finished',
    home: teamRef(ARG),
    away: teamRef(FRA),
    ...overrides,
  };
}

function renderDot(data: MatchDotNodeData) {
  return render(
    <ReactFlowProvider>
      <MatchDotNode
        id={data.matchId}
        type="match-dot"
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

describe('MatchDotNode — status + a11y [Test 23]', () => {
  it('exposes data-status reflecting the match status', () => {
    const { container } = renderDot(makeData({ status: 'live' }));
    expect(container.querySelector('[data-status="live"]')).not.toBeNull();
    const { container: fin } = renderDot(makeData({ status: 'finished' }));
    expect(fin.querySelector('[data-status="finished"]')).not.toBeNull();
    const { container: sched } = renderDot(makeData({ status: 'scheduled' }));
    expect(sched.querySelector('[data-status="scheduled"]')).not.toBeNull();
  });

  it('exposes an accessible label naming the matchup', () => {
    const { container } = renderDot(makeData());
    // An accessible name on the dot (aria-label) — present for SR users to reach
    // the match. The exact copy is the GREEN stage's; assert a non-empty label.
    const labelled = container.querySelector('[aria-label]');
    expect(labelled, 'the dot must carry an aria-label').not.toBeNull();
    expect(labelled!.getAttribute('aria-label')).not.toBe('');
  });

  it('reflects focusState via data-focus', () => {
    const { container } = renderDot(makeData({ focusState: 'on' }));
    expect(container.querySelector('[data-focus="on"]')).not.toBeNull();
  });
});
