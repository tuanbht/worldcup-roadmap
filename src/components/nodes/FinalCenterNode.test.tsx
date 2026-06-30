// @vitest-environment jsdom
//
// Component spec for FinalCenterNode — the center Final + trophy motif of the
// radial circle view (requirement 2026-06-30-1104 base + 2026-06-30-1416 champion)
// [L1]. It renders the trophy + the two Final teams and carries `data-final="true"`
// (a STRING, matching the e2e center selector).
//
// The base motif (trophy / teams / data-final / focus) is already GREEN — those
// assertions stay passing. The 2026-06-30-1416 block is RED: the current component
// has NO champion-flag render path, so the decided-Final champion-roundel assertion
// fails on the MISSING `.rounded-full` (an unbuilt render branch), not an import
// error. The live-Final negative case (no champion flag) is the regression guard.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { teamRef } from '@/domain/types';
import type { FinalCenterNodeData } from '@/features/roadmap/graph-model';
import { ARG, FRA } from './__test-support__/team-row-fixtures';
import { FinalCenterNode } from './FinalCenterNode';

function makeData(overrides: Partial<FinalCenterNodeData> = {}): FinalCenterNodeData {
  return {
    matchId: 'wc2026-f-1',
    status: 'live',
    home: teamRef(ARG),
    away: teamRef(FRA),
    // Default: the LIVE Final is undecided → no champion (TBD). Decided override per test.
    winner: null,
    winnerCode: null,
    winnerFlagUrl: null,
    ...overrides,
  };
}

function renderCenter(data: FinalCenterNodeData) {
  return render(
    <ReactFlowProvider>
      <FinalCenterNode
        id={data.matchId}
        type="final-center"
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

describe('FinalCenterNode — center motif [Test 24 / L1]', () => {
  it('carries data-final="true" (string, matching the e2e selector)', () => {
    const { container } = renderCenter(makeData());
    const final = container.querySelector('[data-final="true"]');
    expect(final).not.toBeNull();
    expect(final!.getAttribute('data-final')).toBe('true');
  });

  it('renders the two Final teams', () => {
    renderCenter(makeData());
    expect(screen.getByText(ARG.name)).toBeInTheDocument();
    expect(screen.getByText(FRA.name)).toBeInTheDocument();
  });

  it('renders a trophy glyph (lucide Trophy svg)', () => {
    const { container } = renderCenter(makeData());
    // lucide-react renders an inline <svg>; the trophy is the center's focal motif.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('reflects focusState via data-focus', () => {
    const { container } = renderCenter(makeData({ focusState: 'on' }));
    expect(container.querySelector('[data-focus="on"]')).not.toBeNull();
  });
});

describe('FinalCenterNode — champion flag vs TBD [Test 17 / Acceptance #1, #2, #4] (2026-06-30-1416)', () => {
  it('a DECIDED Final renders the champion round flag (.rounded-full) beside the trophy', () => {
    const { container } = renderCenter(
      makeData({
        status: 'finished',
        winner: teamRef(ARG),
        winnerCode: 'ARG',
        winnerFlagUrl: null,
      }),
    );
    // Champion rendered via Flag shape="round" → a `.rounded-full` roundel (ARG
    // monogram fallback when flagUrl null).
    const roundel = container.querySelector('.rounded-full');
    expect(roundel, 'a decided Final must render the champion round flag').not.toBeNull();
    expect(roundel!.textContent, 'the roundel shows the champion code monogram').toContain('ARG');
    // The trophy svg is still present beside the champion.
    expect(container.querySelector('svg'), 'trophy svg stays').not.toBeNull();
    // Decision 1: the center never carries a score caption, even when decided.
    expect(container.querySelector('.radial-dot__score')).toBeNull();
  });

  it('the default LIVE Final renders trophy + teams but NO champion flag and NO score (TBD)', () => {
    const { container } = renderCenter(makeData());
    // Trophy + the two teams stay (existing motif).
    expect(container.querySelector('svg')).not.toBeNull();
    // But the live/undecided Final shows no champion roundel and no score caption.
    expect(
      container.querySelector('.rounded-full'),
      'a live Final must NOT render a champion flag',
    ).toBeNull();
    expect(container.querySelector('.radial-dot__score')).toBeNull();
  });
});
