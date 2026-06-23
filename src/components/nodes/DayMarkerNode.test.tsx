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
import { DAY_MARKER_H } from '@/features/roadmap/layout/layout-constants';
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

// --- Item 1: vertically center the pill on the card row centerline -----------
//
// THE BUG: the node's top-left y == the cards' top-left y, but a card is NODE_H
// (=DAY_MARKER_H) tall and the pill is ~28px, so a top-anchored pill lands ~40px
// ABOVE the card center. FIX (renderer-only, so build-graph y math is untouched):
// wrap the pill in a DAY_MARKER_H-tall flex box that vertically centers it, so the
// pill sits on `rowY + NODE_H/2` = the card centerline. Plan Test Strategy 2 /
// Acceptance #1. RED until DayMarkerNode renders the centering box.
describe('DayMarkerNode — centered on the card row [Acceptance #1]', () => {
  /** The single element wrapping the <time> pill (the centering box). */
  function wrapper(container: HTMLElement): HTMLElement {
    const time = container.querySelector('time')!;
    return time.parentElement as HTMLElement;
  }

  it('wraps the pill in a DAY_MARKER_H-tall box so it centers on the card row', () => {
    const { container } = renderNode(makeData());
    const box = wrapper(container);
    // The box is exactly one card tall; centering the pill inside it puts the
    // pill on the card centerline (rowY + NODE_H/2), fixing the ~40px offset.
    expect(box.style.height).toBe(`${DAY_MARKER_H}px`);
  });

  it('vertically centers the pill within that box (flex + items-center)', () => {
    const { container } = renderNode(makeData());
    const box = wrapper(container);
    // items-center only centers inside a flex/grid box, so assert BOTH: the layout
    // mode that makes the centering take effect AND the cross-axis centering.
    expect(box.className).toMatch(/(^|\s)flex(\s|$)/);
    expect(box.className).toContain('items-center');
  });

  it('keeps the box exactly one card tall regardless of the day label width', () => {
    // A longer label (e.g. a two-digit day) must not change the centering box
    // height — the pill always centers on the same NODE_H-tall row centerline.
    const { container } = renderNode(makeData({ dayLabel: '30 Jun' }));
    expect(wrapper(container).style.height).toBe(`${DAY_MARKER_H}px`);
  });
});
