// @vitest-environment jsdom
//
// Component spec for RadialEdge — the radial connector of the circle view
// (requirement 2026-06-30-1104; plan Test Strategy 25 / Acceptance #3) [M1]. It
// renders `path.radial-edge.radial-edge--{state}`, appends
// `radial-edge--focus-{on,dim}` when `focusState` is set, and curves toward the
// `(cx,cy)` carried on `RadialEdgeData` (so the rendered path is NOT a straight
// line between the endpoints).
//
// The edge is rendered inside an <svg> + ReactFlowProvider (BaseEdge needs the RF
// context); we read the rendered <path>'s class + `d`. RED until RadialEdge is
// implemented (today the stub renders null), so each assertion fails on the
// MISSING `path.radial-edge`, not an import error.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider, Position } from '@xyflow/react';
import type { RadialEdgeData } from '@/features/roadmap/graph-model';
import { RadialEdge } from './RadialEdge';

function renderEdge(data: RadialEdgeData) {
  const { container } = render(
    <ReactFlowProvider>
      <svg>
        <RadialEdge
          id="radial-wc2026-r32-1-wc2026-r16-1"
          source="wc2026-r32-1"
          target="wc2026-r16-1"
          sourceX={100}
          sourceY={0}
          targetX={0}
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
          sourceHandleId="s"
          targetHandleId="t"
          pathOptions={undefined}
        />
      </svg>
    </ReactFlowProvider>,
  );
  return container.querySelector('path.radial-edge') as SVGPathElement | null;
}

const CENTER: Pick<RadialEdgeData, 'cx' | 'cy'> = { cx: 50, cy: 50 };

describe('RadialEdge — base state class [Test 25]', () => {
  it('renders the base radial-edge path with the state modifier', () => {
    const path = renderEdge({ state: 'decided', ...CENTER });
    expect(path).not.toBeNull();
    const cls = path!.getAttribute('class') ?? '';
    expect(cls).toContain('radial-edge');
    expect(cls).toContain('radial-edge--decided');
  });

  it('maps each status to its modifier (live / undecided)', () => {
    expect(renderEdge({ state: 'live', ...CENTER })!.getAttribute('class')).toContain(
      'radial-edge--live',
    );
    expect(renderEdge({ state: 'undecided', ...CENTER })!.getAttribute('class')).toContain(
      'radial-edge--undecided',
    );
  });
});

describe('RadialEdge — team-focus class [Test 25 / Acceptance #7]', () => {
  it('appends radial-edge--focus-on when focusState is "on", keeping the state class', () => {
    const cls =
      renderEdge({ state: 'live', focusState: 'on', ...CENTER })!.getAttribute('class') ?? '';
    expect(cls).toContain('radial-edge--live');
    expect(cls).toContain('radial-edge--focus-on');
    expect(cls).not.toContain('radial-edge--focus-dim');
  });

  it('appends radial-edge--focus-dim when focusState is "dim"', () => {
    const cls =
      renderEdge({ state: 'undecided', focusState: 'dim', ...CENTER })!.getAttribute('class') ?? '';
    expect(cls).toContain('radial-edge--focus-dim');
    expect(cls).not.toContain('radial-edge--focus-on');
  });

  it('adds no focus class when focusState is absent', () => {
    const cls = renderEdge({ state: 'decided', ...CENTER })!.getAttribute('class') ?? '';
    expect(cls).not.toContain('radial-edge--focus-on');
    expect(cls).not.toContain('radial-edge--focus-dim');
  });
});

describe('RadialEdge — converges to center [Test 25 / M1]', () => {
  it('uses cx,cy from data so the path is curved (not the straight endpoint line)', () => {
    const path = renderEdge({ state: 'decided', ...CENTER });
    const d = path!.getAttribute('d') ?? '';
    // A converge-to-center path is a curve (C/Q/A command), not a bare line.
    expect(d).not.toBe('');
    expect(/[CQAcqa]/.test(d), `radial path should curve toward center: ${d}`).toBe(true);
  });
});
