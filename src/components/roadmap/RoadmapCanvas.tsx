import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from '@/components/nodes/node-types';
import { edgeTypes } from '@/components/edges/edge-types';
import { MatchDetailPanel } from '@/components/panel/MatchDetailPanel';
import { StandingsOverlay } from '@/components/roadmap/StandingsOverlay';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { ErrorFallback } from '@/components/error/ErrorFallback';
import { useTournamentQuery } from '@/features/roadmap/hooks/useTournamentQuery';
import { useStageView } from '@/features/roadmap/hooks/useStageView';
import { useLayoutMode } from '@/features/roadmap/hooks/useLayoutMode';
import { useRoadmapGraph } from '@/features/roadmap/hooks/useRoadmapGraph';
import { useFitOnChange } from '@/features/roadmap/hooks/useFitOnChange';
import { useFocusCamera } from '@/features/roadmap/hooks/useFocusCamera';
import { useRadialRefit } from '@/features/roadmap/hooks/useRadialRefit';
import { useFocusMatch } from '@/features/roadmap/hooks/useFocusMatch';
import { useBracketKeyboard } from '@/features/roadmap/hooks/useBracketKeyboard';
import { useZoomLevel } from '@/features/roadmap/hooks/useZoomLevel';
import { useMobileViewport } from '@/features/roadmap/hooks/useMobileViewport';
import { DESKTOP_MIN_ZOOM, MOBILE_MIN_ZOOM } from '@/features/roadmap/responsive';
import { pickFocusMatchId } from '@/features/roadmap/focus-target';
import { applyNearestFlag } from '@/features/roadmap/apply-nearest-flag';
import { useFocusedTeam } from '@/features/roadmap/hooks/useFocusedTeam';
import { selectTeamFocus, applyTeamFocus, type TeamFocus } from '@/features/roadmap/team-focus';
import { selectRadialTeamFocus } from '@/features/roadmap/radial-focus';
import type { RoadmapEdge, RoadmapNode } from '@/features/roadmap/graph-model';
import { StageToggle } from './StageToggle';
import { LayoutToggle } from './LayoutToggle';
import { FocusMatchButton } from './FocusMatchButton';
import { Legend } from './Legend';

function CanvasInner() {
  const { data: tournament, loading, error, refetch } = useTournamentQuery();
  const { focus, setFocus } = useStageView();
  const { mode, setMode } = useLayoutMode();
  const isCircle = mode === 'circle';
  // Grid-only chrome (StageToggle / FocusMatchButton / Legend) and the LayoutToggle
  // offset are timeline concepts. Both `circle` AND `matrix` swap the whole graph,
  // so they hide the chrome and drop the LayoutToggle offset (M1) — one predicate
  // drives BOTH so the toggle never floats alone above nothing.
  const showGridChrome = mode === 'grid';
  const { nodes, edges } = useRoadmapGraph(tournament, mode);
  const { lod } = useZoomLevel();
  // A single matchMedia read drives the mobile minZoom floor so a 296px standings
  // card opens legibly on a phone instead of clamping to the desktop 0.2 floor.
  const { isMobile } = useMobileViewport();
  const minZoom = isMobile ? MOBILE_MIN_ZOOM : DESKTOP_MIN_ZOOM;
  const [selected, setSelected] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const {
    teamId: focusedTeamId,
    setFocusedTeam,
    clear: clearFocusedTeam,
  } = useFocusedTeam(tournament ?? null);

  // The focused team's node + edge id set, re-derived only when the team, the
  // tournament, or the layout mode changes. Null when nothing is focused (no
  // dimming). Circle mode uses the radial inward-path selector (badge → R32 dot →
  // ancestor dots → Final + the `radial-` edges); grid uses the timeline selector.
  // Both are adapted to the `TeamFocus` shape `applyTeamFocus` stamps from.
  const focusSet = useMemo<TeamFocus | null>(() => {
    if (!tournament || !focusedTeamId) return null;
    if (isCircle) {
      const radial = selectRadialTeamFocus(tournament, focusedTeamId);
      return {
        teamId: focusedTeamId,
        matchNodeIds: radial.nodeIds,
        edgeIds: radial.edgeIds,
      };
    }
    return selectTeamFocus(tournament, focusedTeamId);
  }, [tournament, focusedTeamId, isCircle]);

  // The focused team's display name for the aria-live announcement.
  const focusedTeamName = useMemo(
    () => tournament?.teams.find((t) => t.id === focusedTeamId)?.name ?? null,
    [tournament, focusedTeamId],
  );

  // Resolve the "current" match (live if any, else nearest upcoming) at render
  // time from a fresh `Date.now()`. TanStack Query refetches every 45s, so a
  // re-render re-evaluates the target; null disables the button (all ended).
  const focusTarget = useMemo(() => {
    const matches = tournament?.matches ?? [];
    const id = pickFocusMatchId(matches, Date.now());
    const isLive = id !== null && matches.some((m) => m.id === id && m.status === 'live');
    return { id, isLive };
  }, [tournament]);

  // Build the display graph from the pure memoized graph in one composed pass:
  //   opener injection -> onFocusTeam injection (match + group-standings) ->
  //   applyNearestFlag -> applyTeamFocus (dim).
  // All immutable display copies; the memoized graph is never mutated. Team-focus
  // dimming runs LAST so a focused-but-dimmed card keeps its nearest/selected
  // affordances underneath. Positions are untouched (no relayout).
  const displayNodes = useMemo<RoadmapNode[]>(() => {
    const withHandlers = nodes.map<RoadmapNode>((node) => {
      if (node.type === 'match') {
        return { ...node, data: { ...node.data, onFocusTeam: setFocusedTeam } };
      }
      if (node.type === 'team-badge') {
        return { ...node, data: { ...node.data, onFocusTeam: setFocusedTeam } };
      }
      if (node.type === 'group-standings') {
        return {
          ...node,
          data: { ...node.data, onFocusTeam: setFocusedTeam, onOpenStandings: setOpenGroup },
        };
      }
      return node;
    });
    const withNearest = applyNearestFlag(withHandlers, focusTarget.id);
    return applyTeamFocus(withNearest, [], focusSet).nodes;
  }, [nodes, focusTarget.id, focusSet, setFocusedTeam]);

  // Sibling display copy of the edges: dim those off the focused team's path.
  const displayEdges = useMemo<RoadmapEdge[]>(
    () => applyTeamFocus([], edges, focusSet).edges,
    [edges, focusSet],
  );

  const openGroupData = useMemo(
    () => tournament?.groups.find((g) => g.name === openGroup) ?? null,
    [tournament, openGroup],
  );

  const { focusMatch } = useFocusMatch({ onFocused: setSelected });

  const onFocusCurrentMatch = useCallback((matchId: string) => focusMatch(matchId), [focusMatch]);

  const closeStandings = useCallback(() => {
    setOpenGroup((current) => {
      if (current) {
        document
          .querySelector<HTMLButtonElement>(`[aria-label="Open Group ${current} standings"]`)
          ?.focus();
      }
      return null;
    });
  }, []);

  // Frame off the RAW graph for BOTH the trigger key and the geometry: the key
  // (`nodes.length`) and the framing source must come from the same array so they
  // can never diverge. `displayNodes` re-stamps focus/flag data over the same
  // nodes WITHOUT moving any of them, so raw `nodes` yields identical bounds while
  // keeping the one-time-frame trigger and its geometry in lockstep.
  useFitOnChange(nodes.length, nodes);
  // Frame off the RAW graph (stable positions), NOT `displayNodes`: opening the
  // standings overlay, focusing a team, or the nearest-flag pass all mint a new
  // `displayNodes` identity WITHOUT changing any node position. Keying the camera
  // on `displayNodes` re-ran the 500ms re-frame on every such display-only change
  // (a visible canvas pan behind the overlay — and a snapshot flake). `nodes` only
  // changes on a real layout/data change, so the camera moves on `focus` alone.
  useFocusCamera(focus, nodes);
  // Re-fit the camera when the LAYOUT MODE flips (grid <-> circle) so switching
  // INTO circle snaps to frame the whole ring. Guarded on `mode` (skips first
  // run, never re-fires on a refetch) so it never fights the cold-load fitter.
  useRadialRefit(mode);
  // Esc clears both the selected match AND the focused team (independent setters).
  // The overlay shields its own Esc with stopPropagation while open.
  const onEscape = useCallback(() => {
    setSelected(null);
    clearFocusedTeam();
  }, [clearFocusedTeam]);
  useBracketKeyboard(onEscape);

  const onNodeClick = useCallback<NodeMouseHandler<RoadmapNode>>((_, node) => {
    // Grid `match` and radial `match-dot`/`final-center` carry their matchId AS the
    // node id; a radial `team-badge`'s id is `badge-…`, so resolve its R32 match via
    // `data.matchId`. The panel resolves any real matchId (findMatch/placeholder).
    if (
      node.type === 'match' ||
      node.type === 'match-dot' ||
      node.type === 'final-center' ||
      node.type === 'matrix-match'
    ) {
      setSelected(node.id);
    } else if (node.type === 'team-badge') {
      setSelected(node.data.matchId);
    }
  }, []);

  // R1c: a failed load with no cached tournament must surface a visible error +
  // Retry, never a silent empty canvas. With `auto`→mock fallback this is rare,
  // but a forced-`fifa` failure (or a mock builder throw) reaches here.
  if (error && !tournament) {
    return (
      <div className="pitch-grid h-full w-full">
        <ErrorFallback
          title="Couldn’t load the roadmap"
          error={new Error(error)}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="pitch-grid relative h-full w-full" data-lod={lod}>
      <ReactFlow<RoadmapNode, RoadmapEdge>
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={minZoom}
        maxZoom={1.8}
        nodesConnectable={false}
        edgesFocusable={false}
        onlyRenderVisibleElements={true}
        onNodeClick={onNodeClick}
        onPaneClick={() => {
          setSelected(null);
          clearFocusedTeam();
        }}
        proOptions={{ hideAttribution: false }}
        zoomOnScroll
        panOnDrag
        zoomOnPinch
        // Explicit page-scroll guard (belt-and-suspenders with the pane's built-in
        // touch-action:none): the document never scrolls behind a wheel/touch pan.
        preventScrolling={true}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(148,163,184,0.10)"
        />
        {/* Layout-mode switch (Grid / Circle / Matrix) — top-left. In grid mode it
            is nudged BELOW the unmoved StageToggle (grid snapshots stay stable);
            circle AND matrix modes show it alone at the top (no offset). */}
        <LayoutToggle mode={mode} onChange={setMode} offset={showGridChrome} />
        {/* Grid-only chrome: the stage (camera) toggle, the focus-current-match
            button, and the legend are timeline concepts. Circle AND matrix modes
            swap the whole graph (no group zone / nearest funnel), so they show only
            the LayoutToggle and always frame the whole graph. The StageToggle's own
            top-left Panel is nudged down so the two pills never overlap. */}
        {showGridChrome && (
          <>
            <StageToggle focus={focus} onChange={setFocus} />
            <FocusMatchButton
              targetMatchId={focusTarget.id}
              isLive={focusTarget.isLive}
              onActivate={onFocusCurrentMatch}
            />
            {/* Desktop-only floating legend — hidden on small screens (legend lives in App header below sm) */}
            <Panel position="top-right" className="hidden sm:block">
              <Legend provider={tournament?.meta.provider ?? null} />
            </Panel>
          </>
        )}
      </ReactFlow>

      {/* A malformed match datum or a renderer null-deref in the detail panel
          must not blank the whole canvas — isolate it behind its own boundary
          with a panel-scoped fallback (R1a). */}
      <ErrorBoundary title="This match panel hit a snag">
        <MatchDetailPanel
          tournament={tournament}
          matchId={selected}
          onClose={() => setSelected(null)}
        />
      </ErrorBoundary>

      <StandingsOverlay group={openGroupData} onClose={closeStandings} />

      <div className="sr-only" role="status" aria-live="polite">
        {focusedTeamName ? `Showing matches for ${focusedTeamName}` : ''}
      </div>

      {loading && !tournament && (
        <div className="bg-bg/60 absolute inset-0 grid place-items-center backdrop-blur-sm">
          <span className="font-display text-muted animate-pulse text-sm tracking-[0.2em] uppercase">
            Loading the roadmap…
          </span>
        </div>
      )}
    </div>
  );
}

export default function RoadmapCanvas() {
  return (
    <ErrorBoundary title="The roadmap couldn’t be displayed">
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}
