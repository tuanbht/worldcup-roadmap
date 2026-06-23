// @vitest-environment jsdom
//
// Component spec for MemberEdge — the dashed "membership" connector from a
// group's standings table to each of its group-stage matches (requirement
// item 2; plan Acceptance #8). Two concerns:
//   1. Base contract: it renders an SVG `path.member-edge` with NO arrow
//      markerEnd (a grouping line, not advancement).
//   2. Team-focus contract (item 3; plan Acceptance #9, #10): when
//      `data.focusState` is set it appends `member-edge--focus-on` /
//      `member-edge--focus-dim`, and appends NEITHER when it is absent, so the
//      link can be highlighted/dimmed via CSS without changing its geometry.
//
// The edge is rendered inside an <svg> + ReactFlowProvider (BaseEdge needs the RF
// context); we read the rendered <path>'s className + markerEnd. RED until
// MemberEdge is implemented (today its impl throws "not implemented"), so each
// assertion fails for the right (missing-logic) reason rather than a typo.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider, Position } from '@xyflow/react';
import type { MemberEdgeData } from '@/features/roadmap/graph-model';
import { MemberEdge } from './MemberEdge';

/**
 * Render MemberEdge inside the required <svg> + ReactFlowProvider and return the
 * rendered <path>. The full EdgeProps shape is supplied once here (BaseEdge reads
 * geometry off it) so each spec only states the `data` under test.
 */
function renderEdge(data: MemberEdgeData): SVGPathElement | null {
  const { container } = render(
    <ReactFlowProvider>
      <svg>
        <MemberEdge
          id="member-A-wc2026-gA-1-1"
          source="group-standings-A"
          target="wc2026-gA-1-1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={200}
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
  return container.querySelector('path.member-edge') as SVGPathElement | null;
}

/** The whitespace-split class tokens of the rendered path (exact-token matching,
 *  so a stray `member-edge-foo` can never satisfy a `member-edge` assertion). */
function classTokens(data: MemberEdgeData): string[] {
  const path = renderEdge(data);
  expect(path, 'MemberEdge must render an SVG path.member-edge').not.toBeNull();
  return (path!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

describe('MemberEdge — base membership class [Acceptance #8]', () => {
  it('renders an SVG path carrying the exact "member-edge" class token', () => {
    expect(classTokens({ group: 'A' })).toContain('member-edge');
  });

  it('renders NO arrow markerEnd (a grouping line, not an advancement arrow)', () => {
    const path = renderEdge({ group: 'A' });
    expect(path).not.toBeNull();
    // BaseEdge stamps the marker via the SVG `marker-end` attribute / style.
    // A membership line carries none, so it never resolves to a url(#...) marker.
    const markerAttr = path!.getAttribute('marker-end');
    expect(markerAttr === null || markerAttr === '' || markerAttr === 'none').toBe(true);
    expect(path!.style.markerEnd === '' || path!.style.markerEnd === 'none').toBe(true);
  });
});

describe('MemberEdge — team-focus class [Acceptance #9, #10]', () => {
  // Table-driven: each focusState maps to EXACTLY one modifier token (or none),
  // and the base `member-edge` token is always retained so geometry/style holds.
  it.each([
    {
      focusState: 'on' as const,
      present: 'member-edge--focus-on',
      absent: 'member-edge--focus-dim',
    },
    {
      focusState: 'dim' as const,
      present: 'member-edge--focus-dim',
      absent: 'member-edge--focus-on',
    },
  ])(
    'appends $present (and never $absent) when focusState is "$focusState"',
    ({ focusState, present, absent }) => {
      const tokens = classTokens({ group: 'A', focusState });
      expect(tokens).toContain('member-edge');
      expect(tokens).toContain(present);
      expect(tokens).not.toContain(absent);
    },
  );

  it('adds NEITHER focus modifier when focusState is absent (no team focused)', () => {
    const tokens = classTokens({ group: 'A' });
    expect(tokens).toContain('member-edge'); // base class still present
    expect(tokens).not.toContain('member-edge--focus-on');
    expect(tokens).not.toContain('member-edge--focus-dim');
  });

  it('ignores the group letter when toggling the focus class (group is not a CSS concern)', () => {
    // The dashed look + focus modifier are driven by focusState alone; the group
    // letter is carried for the data model, never leaked into the class list.
    const tokensB = classTokens({ group: 'B', focusState: 'on' });
    expect(tokensB).toContain('member-edge--focus-on');
    expect(tokensB.some((t) => t.includes('-B'))).toBe(false);
  });
});
