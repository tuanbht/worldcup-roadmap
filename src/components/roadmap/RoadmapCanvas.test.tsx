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
import userEvent from '@testing-library/user-event';
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
  const Panel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="rf-panel" className={className ?? ''}>
      {children}
    </div>
  );
  const BackgroundVariant = { Dots: 'dots' };
  // `useRadialRefit` (the layout-mode re-fit effect, 2026-06-30-1104) calls
  // `useReactFlow().fitView`; stub it so the effect is a harmless no-op here.
  const useReactFlow = () => ({ fitView: () => Promise.resolve(true) });
  return { ReactFlowProvider, ReactFlow, Background, Panel, BackgroundVariant, useReactFlow };
});

// ---- Mock feature hooks ----------------------------------------------------
// The tournament-query result is now configurable per-test so the fetch-error
// state (R1: error && !tournament → visible alert + Retry) can be driven without
// real network. `refetch` is a spy so the Retry-click assertion can verify it is
// invoked. Default mirrors the original `{ data: null, loading: false }` shape
// (extended with `error: null` + `refetch`) so every pre-existing case stays green.
interface MockTournamentQueryResult {
  data: unknown;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
const refetchSpy = vi.fn();
const DEFAULT_QUERY_RESULT: MockTournamentQueryResult = {
  data: null,
  loading: false,
  error: null,
  refetch: refetchSpy,
};
let tournamentQueryResult: MockTournamentQueryResult = { ...DEFAULT_QUERY_RESULT };
vi.mock('@/features/roadmap/hooks/useTournamentQuery', () => ({
  useTournamentQuery: () => tournamentQueryResult,
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
// ---- Mock useMobileViewport (H1, mandatory regression guard) ----------------
// requirement 2026-06-23-1336-mobile-friendly-small-screens. CanvasInner now
// calls useMobileViewport() (which reads window.matchMedia) to drive the mobile
// minZoom floor. jsdom does NOT provide matchMedia, so without this mock the real
// hook would run and could crash ALL ~20 pre-existing cases in this file — not
// just the new ones. The mock is per-test configurable and DEFAULTS to
// { isMobile: false } so every existing case behaves exactly as before; the new
// mobile cases toggle it to { isMobile: true } and afterEach resets it.
let mockMobileViewport: { isMobile: boolean } = { isMobile: false };
vi.mock('@/features/roadmap/hooks/useMobileViewport', () => ({
  useMobileViewport: () => mockMobileViewport,
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
// The MatchDetailPanel mock can be told to throw during render (per-test flag) so
// the detail-panel ErrorBoundary wrapping (AC 2) can be exercised deterministically
// — a thrown panel must surface its fallback, NOT blank the whole canvas.
let detailPanelShouldThrow = false;
const DETAIL_PANEL_CRASH = 'detail panel render exploded';
vi.mock('@/components/nodes/node-types', () => ({ nodeTypes: {} }));
vi.mock('@/components/edges/edge-types', () => ({ edgeTypes: {} }));
vi.mock('@/components/panel/MatchDetailPanel', () => ({
  MatchDetailPanel: () => {
    if (detailPanelShouldThrow) throw new Error(DETAIL_PANEL_CRASH);
    return <div data-testid="match-detail-panel" />;
  },
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

// The shared mobile/desktop minZoom floors (requirement 1336). These literals
// mirror `responsive.ts`'s pinned constants; the AUTHORITATIVE source-of-truth
// assertions for those exact values live in responsive.test.ts. They are kept as
// local literals HERE (not a static import of the not-yet-created responsive.ts)
// so this file still COLLECTS and the ~20 pre-existing cases stay green — the new
// cases below are RED because RoadmapCanvas.tsx doesn't yet wire the
// useMobileViewport-driven minZoom / preventScrolling, NOT because of a missing
// import that would take the whole suite down.
const DESKTOP_MIN_ZOOM = 0.2;
const MOBILE_MIN_ZOOM = 0.32;

afterEach(() => {
  cleanup();
  capturedFlowProps = {};
  // Reset the per-test query result + the refetch spy so cases stay isolated.
  tournamentQueryResult = { ...DEFAULT_QUERY_RESULT };
  refetchSpy.mockReset();
  // Reset the detail-panel throw flag so a boundary case can't leak into others.
  detailPanelShouldThrow = false;
  // Reset the mobile-viewport mock to its desktop default so the next case is
  // isolated (the ~20 pre-existing cases all assume isMobile:false).
  mockMobileViewport = { isMobile: false };
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
// Mobile touch-nav hardening + zoom floor (requirement 1336, scope #2 / AC #2)
// ============================================================================
// The page must never scroll behind a canvas pan (explicit `preventScrolling`,
// belt-and-suspenders with the pane's built-in touch-action:none), and the
// minZoom floor must come from the shared `responsive.ts` constants via the
// mocked useMobileViewport: MOBILE_MIN_ZOOM on a phone, DESKTOP_MIN_ZOOM on a
// desktop. RED until RoadmapCanvas wires `preventScrolling` + the
// useMobileViewport-driven `minZoom`.
describe('RoadmapCanvas — page never scrolls behind a canvas pan (preventScrolling)', () => {
  it('passes preventScrolling=true to ReactFlow', () => {
    render(<RoadmapCanvas />);
    expect(capturedFlowProps.preventScrolling).toBe(true);
  });
});

describe('RoadmapCanvas — minZoom floor follows useMobileViewport', () => {
  it('uses MOBILE_MIN_ZOOM when the viewport is mobile (<=640px)', () => {
    mockMobileViewport = { isMobile: true };
    render(<RoadmapCanvas />);
    expect(capturedFlowProps.minZoom).toBe(MOBILE_MIN_ZOOM);
  });

  it('uses DESKTOP_MIN_ZOOM when the viewport is desktop (default)', () => {
    // Default mock is { isMobile: false } — the desktop floor must be unchanged.
    render(<RoadmapCanvas />);
    expect(capturedFlowProps.minZoom).toBe(DESKTOP_MIN_ZOOM);
  });

  it('raises the mobile floor strictly above the desktop floor (legible-on-open)', () => {
    // Guards a future silent revert of the mobile floor back to the desktop 0.2.
    expect(MOBILE_MIN_ZOOM).toBeGreaterThan(DESKTOP_MIN_ZOOM);
  });
});

// ============================================================================
// Virtualization — onlyRenderVisibleElements (requirement 1044, §1)
// ============================================================================
// With 64-100+ nodes, React Flow must only render the elements inside the
// viewport so pan/zoom paint cost (esp. on mobile) stays bounded. RED until
// RoadmapCanvas.tsx adds `onlyRenderVisibleElements` to the <ReactFlow> props.
describe('RoadmapCanvas — virtualizes offscreen nodes (onlyRenderVisibleElements)', () => {
  it('passes onlyRenderVisibleElements=true to ReactFlow', () => {
    render(<RoadmapCanvas />);
    expect(capturedFlowProps.onlyRenderVisibleElements).toBe(true);
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

// ============================================================================
// Legend placement — desktop-only floating Panel
// ============================================================================

describe('RoadmapCanvas — Legend is desktop-only in the floating Panel', () => {
  it('renders the legend panel with a sm:block class (hidden on mobile)', () => {
    render(<RoadmapCanvas />);
    // The Panel wrapping the Legend must carry "hidden sm:block" so it is
    // invisible on small screens (the legend is relocated to App.tsx header).
    const panels = screen.getAllByTestId('rf-panel');
    const legendPanel = panels.find((el) => el.className.includes('hidden'));
    expect(legendPanel).toBeDefined();
    expect(legendPanel?.className).toContain('sm:block');
  });

  it('renders the legend chip labels (Live, Finished, Upcoming) inside the canvas panel', () => {
    render(<RoadmapCanvas />);
    // Labels must still be in the DOM (just hidden via CSS on mobile)
    expect(screen.getAllByText('Live').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Finished').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Upcoming').length).toBeGreaterThan(0);
  });
});

// ============================================================================
// R1 · fetch-error UI (AC 7) — surface useTournamentQuery's swallowed error
// ============================================================================
// When the query returns a non-null `error` and there is no cached tournament,
// RoadmapCanvas must render a visible error state (role="alert") with the
// message and a Retry button that calls the query's `refetch` — never a silent
// empty canvas. These cases are RED until stage 4 consumes `error`/`refetch`.

describe('RoadmapCanvas — fetch-error state surfaces (no silent empty canvas)', () => {
  const FETCH_ERROR = 'Upstream rate limit reached';

  /** Drive the configurable query mock into the error-and-no-cache state, then render. */
  function renderWithError(error: string = FETCH_ERROR) {
    tournamentQueryResult = { data: null, loading: false, error, refetch: refetchSpy };
    render(<RoadmapCanvas />);
  }

  it('renders a role="alert" error region carrying the exact error message', () => {
    renderWithError();
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(FETCH_ERROR);
  });

  it('renders a Retry button that calls refetch exactly once per click', async () => {
    const user = userEvent.setup();
    renderWithError();

    const retry = screen.getByRole('button', { name: /retry|try again/i });
    await user.click(retry);

    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces the message verbatim for a different error (not a hardcoded string)', () => {
    // Guards against the implementation rendering a fixed banner that ignores the
    // hook's actual error — the message shown must be the one the hook reported.
    renderWithError('FIFA upstream returned 503');
    expect(screen.getByRole('alert')).toHaveTextContent('FIFA upstream returned 503');
  });

  it('renders NO error alert on a successful (error: null) load', () => {
    // Default mock result has error: null — the success path must not show an alert.
    render(<RoadmapCanvas />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ============================================================================
// R1 · detail-panel ErrorBoundary isolation (AC 2) — a thrown MatchDetailPanel
// degrades to a fallback WITHOUT blanking the whole canvas.
// ============================================================================
// The MatchDetailPanel is wrapped by an <ErrorBoundary>; a render throw inside it
// must surface a role="alert" fallback while the surrounding canvas chrome (the
// ReactFlow surface, Background, StageToggle) stays mounted. RED until stage 4
// wraps the panel in RoadmapCanvas.tsx.
describe('RoadmapCanvas — a thrown detail panel is isolated by an ErrorBoundary', () => {
  it('shows a fallback alert and keeps the canvas mounted (no cascading blank page)', () => {
    // React logs the caught render error to console.error; scope-spy it so a
    // genuinely unexpected error would still be the only thing surfaced.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      detailPanelShouldThrow = true;
      render(<RoadmapCanvas />);

      // The boundary catches the throw and renders a user-facing fallback…
      expect(screen.getByRole('alert')).toBeInTheDocument();
      // …while the surrounding canvas chrome survives (not a blank unmount).
      expect(screen.getByTestId('rf-canvas')).toBeInTheDocument();
      expect(screen.getByTestId('rf-background')).toBeInTheDocument();
      // The crashing panel itself is replaced by the fallback, so its testid is gone.
      expect(screen.queryByTestId('match-detail-panel')).toBeNull();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
