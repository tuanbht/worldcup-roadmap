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
import { useBracketKeyboard } from '@/features/roadmap/hooks/useBracketKeyboard';
import { useZoomLevel } from '@/features/roadmap/hooks/useZoomLevel';
import type { MatchNodeData, RoadmapEdge, RoadmapNode } from '@/features/roadmap/graph-model';
import { StageToggle } from './StageToggle';

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
  const { nodes, edges } = useRoadmapGraph(tournament);
  const { lod } = useZoomLevel();
  const [selected, setSelected] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Inject the standings-overlay opener into each group-header's node data
  // without mutating the memoized graph (immutable display copy).
  const displayNodes = useMemo<RoadmapNode[]>(
    () =>
      nodes.map((node) =>
        node.type === 'group-header'
          ? { ...node, data: { ...node.data, onOpenStandings: setOpenGroup } }
          : node,
      ),
    [nodes],
  );

  const openGroupData = useMemo(
    () => tournament?.groups.find((g) => g.name === openGroup) ?? null,
    [tournament, openGroup],
  );

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

  useFitOnChange(nodes.length);
  useFocusCamera(focus, displayNodes);
  useBracketKeyboard(useCallback(() => setSelected(null), []));

  const onNodeClick = useCallback<NodeMouseHandler<RoadmapNode>>((_, node) => {
    if (node.type === 'match') setSelected(node.id);
  }, []);

  return (
    <div className="pitch-grid relative h-full w-full" data-lod={lod}>
      <ReactFlow<RoadmapNode, RoadmapEdge>
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        maxZoom={1.8}
        nodesConnectable={false}
        edgesFocusable={false}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelected(null)}
        panOnScroll
        proOptions={{ hideAttribution: false }}
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
