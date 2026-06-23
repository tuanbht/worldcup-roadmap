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
import { useRoadmapGraph } from '@/features/roadmap/hooks/useRoadmapGraph';
import { useFitOnChange } from '@/features/roadmap/hooks/useFitOnChange';
import { useFocusCamera } from '@/features/roadmap/hooks/useFocusCamera';
import { useFocusMatch } from '@/features/roadmap/hooks/useFocusMatch';
import { useBracketKeyboard } from '@/features/roadmap/hooks/useBracketKeyboard';
import { useZoomLevel } from '@/features/roadmap/hooks/useZoomLevel';
import { pickFocusMatchId } from '@/features/roadmap/focus-target';
import { applyNearestFlag } from '@/features/roadmap/apply-nearest-flag';
import { useFocusedTeam } from '@/features/roadmap/hooks/useFocusedTeam';
import { selectTeamFocus, applyTeamFocus } from '@/features/roadmap/team-focus';
import type { RoadmapEdge, RoadmapNode } from '@/features/roadmap/graph-model';
import { StageToggle } from './StageToggle';
import { FocusMatchButton } from './FocusMatchButton';
import { Legend } from './Legend';

function CanvasInner() {
  const { data: tournament, loading, error, refetch } = useTournamentQuery();
  const { focus, setFocus } = useStageView();
  const { nodes, edges } = useRoadmapGraph(tournament);
  const { lod } = useZoomLevel();
  const [selected, setSelected] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const {
    teamId: focusedTeamId,
    setFocusedTeam,
    clear: clearFocusedTeam,
  } = useFocusedTeam(tournament ?? null);

  // The focused team's match-node + edge id set, re-derived only when the team or
  // the tournament changes. Null when nothing is focused (no dimming).
  const focusSet = useMemo(
    () => (tournament && focusedTeamId ? selectTeamFocus(tournament, focusedTeamId) : null),
    [tournament, focusedTeamId],
  );

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

  useFitOnChange(nodes.length, displayNodes);
  useFocusCamera(focus, displayNodes);
  // Esc clears both the selected match AND the focused team (independent setters).
  // The overlay shields its own Esc with stopPropagation while open.
  const onEscape = useCallback(() => {
    setSelected(null);
    clearFocusedTeam();
  }, [clearFocusedTeam]);
  useBracketKeyboard(onEscape);

  const onNodeClick = useCallback<NodeMouseHandler<RoadmapNode>>((_, node) => {
    if (node.type === 'match') setSelected(node.id);
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
        minZoom={0.2}
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
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(148,163,184,0.10)"
        />
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
