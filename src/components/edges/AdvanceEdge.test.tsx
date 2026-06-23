// @vitest-environment jsdom
//
// Component spec for AdvanceEdge — the dashed feeder/advance connector. Two
// concerns:
//   1. Already-green contract: it renders the base `advance-edge` path with the
//      state modifier (`advance-edge--decided|undecided|live`).
//   2. RED team-focus contract (requirement item 3; plan Acceptance #5, #6): when
//      `data.focusState` is set it appends `advance-edge--focus-on` /
//      `advance-edge--focus-dim` ALONGSIDE the existing state class, so the edge
//      can be highlighted/dimmed via CSS without changing its geometry.
//
// The edge is rendered inside an <svg> + ReactFlowProvider (BaseEdge needs the RF
// context); we read the rendered <path>'s className. RED until AdvanceEdge reads
// data.focusState.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider, Position } from '@xyflow/react';
import type { AdvanceEdgeData } from '@/features/roadmap/graph-model';
import { AdvanceEdge } from './AdvanceEdge';

function renderEdge(data: AdvanceEdgeData) {
  const { container } = render(
    <ReactFlowProvider>
      <svg>
        <AdvanceEdge
          id="adv-a-b"
          source="a"
          target="b"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={100}
          sourcePosition={Position.Bottom}
          targetPosition={Position.Top}
          data={data}
          selected={false}
          animated={false}
          markerEnd=""
          markerStart=""
          interactionWidth={0}
          label={undefined}
          labelStyle={undefined}
          labelShowBg={false}
          labelBgStyle={undefined}
          labelBgPadding={[0, 0]}
          labelBgBorderRadius={0}
          style={undefined}
          sourceHandleId="b"
          targetHandleId="t"
          pathOptions={undefined}
        />
      </svg>
    </ReactFlowProvider>,
  );
  return container.querySelector('path.advance-edge') as SVGPathElement;
}

describe('AdvanceEdge — base state class (already green)', () => {
  it('renders the base advance-edge path with the state modifier', () => {
    const path = renderEdge({ state: 'decided' });
    expect(path).not.toBeNull();
    expect(path.getAttribute('class')).toContain('advance-edge');
    expect(path.getAttribute('class')).toContain('advance-edge--decided');
  });
});

describe('AdvanceEdge — team-focus class [Acceptance #5, #6]', () => {
  it('appends advance-edge--focus-on when focusState is "on", keeping the state class', () => {
    const path = renderEdge({ state: 'live', focusState: 'on' });
    const cls = path.getAttribute('class') ?? '';
    expect(cls).toContain('advance-edge--live'); // state class preserved
    expect(cls).toContain('advance-edge--focus-on');
    expect(cls).not.toContain('advance-edge--focus-dim');
  });

  it('appends advance-edge--focus-dim when focusState is "dim"', () => {
    const path = renderEdge({ state: 'undecided', focusState: 'dim' });
    const cls = path.getAttribute('class') ?? '';
    expect(cls).toContain('advance-edge--undecided');
    expect(cls).toContain('advance-edge--focus-dim');
    expect(cls).not.toContain('advance-edge--focus-on');
  });

  it('adds no focus class when focusState is absent (no team focused)', () => {
    const path = renderEdge({ state: 'decided' });
    const cls = path.getAttribute('class') ?? '';
    expect(cls).not.toContain('advance-edge--focus-on');
    expect(cls).not.toContain('advance-edge--focus-dim');
  });
});
