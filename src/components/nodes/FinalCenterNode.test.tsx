// @vitest-environment jsdom
//
// Component spec for FinalCenterNode — the center Final + trophy motif of the
// radial circle view (requirement 2026-06-30-1104; plan Test Strategy 24 /
// Acceptance #1) [L1]. It renders the trophy + the two Final teams and carries
// `data-final="true"` (a STRING, matching the e2e center selector).
//
// RED until FinalCenterNode is implemented (today the stub renders null), so each
// assertion fails on the MISSING element/attribute, not an import error.
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
