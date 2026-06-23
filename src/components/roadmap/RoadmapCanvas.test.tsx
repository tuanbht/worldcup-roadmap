// @vitest-environment jsdom
//
// Unit tests for RoadmapCanvas chrome removal (requirement
// 2026-06-23-1231-remove-reactflow-controls-minimap).
//
// Asserts:
//   - <MiniMap> and <Controls> are NOT rendered (no .react-flow__minimap /
//     .react-flow__controls elements in the DOM).
//   - The <Background> dot-grid IS still rendered.
//   - The ReactFlow instance is mounted with zoomOnScroll, panOnDrag, and
//     zoomOnPinch enabled (navigation interactions stay).
//   - fitView is passed to ReactFlow (fit-on-load stays).
//
// Strategy: mock all feature hooks + heavy sibling components so jsdom doesn't
// need a canvas or a real React Flow layout engine.  We assert on the props
// forwarded to the <ReactFlow> mock and on what is/isn't in the DOM.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---- Mock @xyflow/react so jsdom doesn't need a real RF engine -------------
// We capture the props passed to <ReactFlow> to assert on them.
let capturedFlowProps: Record<string, unknown> = {};

vi.mock('@xyflow/react', () => {
  const ReactFlowProvider = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rf-provider">{children}</div>
  );
  const ReactFlow = (props: Record<string, unknown>) => {
    capturedFlowProps = props;
    return (
      <div data-testid="rf-canvas" className="react-flow">
        {props.children as React.ReactNode}
      </div>
    );
  };
  const Background = () => <div data-testid="rf-background" className="react-flow__background" />;
  const Panel = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rf-panel">{children}</div>
  );
  const BackgroundVariant = { Dots: 'dots' };
  return { ReactFlowProvider, ReactFlow, Background, Panel, BackgroundVariant };
});

// ---- Mock feature hooks ----------------------------------------------------
vi.mock('@/features/roadmap/hooks/useTournamentQuery', () => ({
  useTournamentQuery: () => ({ data: null, loading: false }),
}));
vi.mock('@/features/roadmap/hooks/useStageView', () => ({
  useStageView: () => ({ focus: 'all', setFocus: vi.fn() }),
}));
vi.mock('@/features/roadmap/hooks/useRoadmapGraph', () => ({
  useRoadmapGraph: () => ({ nodes: [], edges: [] }),
}));
vi.mock('@/features/roadmap/hooks/useZoomLevel', () => ({
  useZoomLevel: () => ({ lod: 'full' }),
}));
vi.mock('@/features/roadmap/hooks/useFitOnChange', () => ({
  useFitOnChange: () => undefined,
}));
vi.mock('@/features/roadmap/hooks/useFocusCamera', () => ({
  useFocusCamera: () => undefined,
}));
vi.mock('@/features/roadmap/hooks/useFocusMatch', () => ({
  useFocusMatch: () => ({ focusMatch: vi.fn() }),
}));
vi.mock('@/features/roadmap/hooks/useBracketKeyboard', () => ({
  useBracketKeyboard: () => undefined,
}));
vi.mock('@/features/roadmap/hooks/useFocusedTeam', () => ({
  useFocusedTeam: () => ({ teamId: null, setFocusedTeam: vi.fn(), clear: vi.fn() }),
}));
vi.mock('@/features/roadmap/focus-target', () => ({
  pickFocusMatchId: () => null,
}));
vi.mock('@/features/roadmap/apply-nearest-flag', () => ({
  applyNearestFlag: (nodes: unknown[]) => nodes,
}));
vi.mock('@/features/roadmap/team-focus', () => ({
  selectTeamFocus: () => null,
  applyTeamFocus: (nodes: unknown[], edges: unknown[]) => ({ nodes, edges }),
}));

// ---- Mock sibling components -----------------------------------------------
vi.mock('@/components/nodes/node-types', () => ({ nodeTypes: {} }));
vi.mock('@/components/edges/edge-types', () => ({ edgeTypes: {} }));
vi.mock('@/components/panel/MatchDetailPanel', () => ({
  MatchDetailPanel: () => <div data-testid="match-detail-panel" />,
}));
vi.mock('@/components/roadmap/StandingsOverlay', () => ({
  StandingsOverlay: () => <div data-testid="standings-overlay" />,
}));
vi.mock('@/components/roadmap/StageToggle', () => ({
  StageToggle: () => <div data-testid="stage-toggle" />,
}));
vi.mock('@/components/roadmap/FocusMatchButton', () => ({
  FocusMatchButton: () => <div data-testid="focus-match-button" />,
}));

// ---- Import under test (after all mocks are registered) --------------------
// Dynamic import keeps the factory mocks in scope before the module executes.
const { default: RoadmapCanvas } = await import('./RoadmapCanvas');

afterEach(() => {
  cleanup();
  capturedFlowProps = {};
});

// ============================================================================
// Absence of removed chrome
// ============================================================================

describe('RoadmapCanvas — MiniMap and Controls are absent', () => {
  it('does not render a .react-flow__minimap element', () => {
    render(<RoadmapCanvas />);
    expect(document.querySelector('.react-flow__minimap')).toBeNull();
  });

  it('does not render a .react-flow__controls element', () => {
    render(<RoadmapCanvas />);
    expect(document.querySelector('.react-flow__controls')).toBeNull();
  });

  it('does not render any element with text "minimap" (case-insensitive)', () => {
    render(<RoadmapCanvas />);
    // Belt-and-suspenders: no aria-label or role that signals minimap
    expect(document.querySelector('[aria-label*="mini" i], [title*="mini" i]')).toBeNull();
  });
});

// ============================================================================
// Presence of retained chrome
// ============================================================================

describe('RoadmapCanvas — Background dot-grid is still rendered', () => {
  it('renders the <Background> component', () => {
    render(<RoadmapCanvas />);
    expect(screen.getByTestId('rf-background')).toBeInTheDocument();
  });
});

// ============================================================================
// Zoom/Pan mode toggle is removed
// ============================================================================

describe('RoadmapCanvas — Zoom/Pan mode toggle and hint are gone', () => {
  it('does not render the canvas mode radiogroup', () => {
    render(<RoadmapCanvas />);
    expect(screen.queryByRole('radiogroup', { name: /scroll behavior/i })).toBeNull();
  });

  it('does not render the wheel-zoom hint text', () => {
    render(<RoadmapCanvas />);
    expect(screen.queryByText(/scroll to zoom/i)).toBeNull();
  });
});

// ============================================================================
// Navigation interactions stay enabled
// ============================================================================

describe('RoadmapCanvas — wheel-zoom, drag-pan, and pinch-zoom remain active', () => {
  it('passes zoomOnScroll=true to ReactFlow', () => {
    render(<RoadmapCanvas />);
    expect(capturedFlowProps.zoomOnScroll).toBe(true);
  });

  it('passes panOnDrag=true to ReactFlow', () => {
    render(<RoadmapCanvas />);
    expect(capturedFlowProps.panOnDrag).toBe(true);
  });

  it('passes zoomOnPinch=true to ReactFlow', () => {
    render(<RoadmapCanvas />);
    expect(capturedFlowProps.zoomOnPinch).toBe(true);
  });
});

// ============================================================================
// fitView-on-load stays
// ============================================================================

describe('RoadmapCanvas — fitView on load is preserved', () => {
  it('passes fitView=true to ReactFlow', () => {
    render(<RoadmapCanvas />);
    expect(capturedFlowProps.fitView).toBe(true);
  });
});
