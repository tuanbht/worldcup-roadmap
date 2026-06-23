import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
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
import { useTournamentQuery } from '@/features/roadmap/hooks/useTournamentQuery';
import { useStageView } from '@/features/roadmap/hooks/useStageView';
import { useRoadmapGraph } from '@/features/roadmap/hooks/useRoadmapGraph';
import { useFitOnChange } from '@/features/roadmap/hooks/useFitOnChange';
import { useFocusCamera } from '@/features/roadmap/hooks/useFocusCamera';
import { useFocusMatch } from '@/features/roadmap/hooks/useFocusMatch';
import { useBracketKeyboard } from '@/features/roadmap/hooks/useBracketKeyboard';
import { useZoomLevel } from '@/features/roadmap/hooks/useZoomLevel';
import { useInteractionMode } from '@/features/roadmap/hooks/useInteractionMode';
import { interactionFlowProps } from '@/features/roadmap/interaction-mode';
import { pickFocusMatchId } from '@/features/roadmap/focus-target';
import { applyNearestFlag } from '@/features/roadmap/apply-nearest-flag';
import { useFocusedTeam } from '@/features/roadmap/hooks/useFocusedTeam';
import { selectTeamFocus, applyTeamFocus } from '@/features/roadmap/team-focus';
import type { MatchNodeData, RoadmapEdge, RoadmapNode } from '@/features/roadmap/graph-model';
import { StageToggle } from './StageToggle';
import { InteractionModeToggle } from './InteractionModeToggle';
import { FocusMatchButton } from './FocusMatchButton';

const STATUS_COLOR: Record<string, string> = {
  live: '#ff4d5e',
  finished: '#3ddc97',
  scheduled: '#5c6779',
};

function nodeColor(node: RoadmapNode): string {
  if (node.type === 'match') return STATUS_COLOR[(node.data as MatchNodeData).status] ?? '#5c6779';
  if (node.type === 'group-header') return '#3b82f6';
  return '#2a3547';
}

function Legend({ provider }: { provider: string | null }) {
  const dots: Array<[string, string]> = [
    ['Live', 'bg-live'],
    ['Finished', 'bg-accent'],
    ['Upcoming', 'bg-dim'],
  ];
  return (
    <div className="border-edge bg-surf-1/80 flex flex-col gap-2 rounded-xl border px-3 py-2.5 text-[0.72rem] backdrop-blur">
      <div className="flex items-center gap-3">
        {dots.map(([label, dot]) => (
          <span key={label} className="text-muted flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {label}
          </span>
        ))}
      </div>
      {provider && (
        <span className="text-dim">
          {provider === 'fifa' ? 'Live data · FIFA' : 'Demo data · offline fixture'}
        </span>
      )}
    </div>
  );
}

function CanvasInner() {
  const { data: tournament, loading } = useTournamentQuery();
  const { focus, setFocus } = useStageView();
  const { mode, setMode } = useInteractionMode();
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
      if (node.type === 'group-header') {
        return { ...node, data: { ...node.data, onOpenStandings: setOpenGroup } };
      }
      if (node.type === 'match') {
        return { ...node, data: { ...node.data, onFocusTeam: setFocusedTeam } };
      }
      if (node.type === 'group-standings') {
        return { ...node, data: { ...node.data, onFocusTeam: setFocusedTeam } };
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

  const flowInteraction = useMemo(() => interactionFlowProps(mode), [mode]);

  const onNodeClick = useCallback<NodeMouseHandler<RoadmapNode>>((_, node) => {
    if (node.type === 'match') setSelected(node.id);
  }, []);

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
        onNodeClick={onNodeClick}
        onPaneClick={() => {
          setSelected(null);
          clearFocusedTeam();
        }}
        proOptions={{ hideAttribution: false }}
        {...flowInteraction}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(148,163,184,0.10)"
        />
        <MiniMap
          pannable
          zoomable
          nodeColor={nodeColor}
          maskColor="rgba(6,9,16,0.72)"
          bgColor="#0a0e14"
        />
        <Controls showInteractive={false} />
        <StageToggle focus={focus} onChange={setFocus} />
        <InteractionModeToggle mode={mode} onChange={setMode} />
        <FocusMatchButton
          targetMatchId={focusTarget.id}
          isLive={focusTarget.isLive}
          onActivate={onFocusCurrentMatch}
        />
        <Panel position="top-right">
          <Legend provider={tournament?.meta.provider ?? null} />
        </Panel>
      </ReactFlow>

      <MatchDetailPanel
        tournament={tournament}
        matchId={selected}
        onClose={() => setSelected(null)}
      />

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
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
