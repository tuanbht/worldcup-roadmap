// @vitest-environment jsdom
//
// Per-file jsdom pragma (matches MatchNode.test.tsx). DayMarkerNode is the left
// date-rail guide: a single calendar day's label, NOT connected to any edge.
// Plan Test Strategy 24 / Acceptance #5.
//
// RED until DayMarkerNode exists.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { DayMarkerNodeData } from '@/features/roadmap/graph-model';
import { DayMarkerNode } from './DayMarkerNode';

function makeData(overrides: Partial<DayMarkerNodeData> = {}): DayMarkerNodeData {
  return { dayKey: '2026-06-11', dayLabel: '11 Jun', dayIndex: 0, ...overrides };
}

function renderNode(data: DayMarkerNodeData) {
  return render(
    <ReactFlowProvider>
      <DayMarkerNode
        id={`day-marker-${data.dayKey}`}
        type="day-marker"
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

describe('DayMarkerNode', () => {
  it('renders the human-readable day label', () => {
    renderNode(makeData({ dayLabel: '11 Jun' }));
    expect(screen.getByText('11 Jun')).toBeInTheDocument();
  });

  it('exposes NO React Flow handle (it is a guide, not an edge endpoint)', () => {
    const { container } = renderNode(makeData());
    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(0);
  });
});
