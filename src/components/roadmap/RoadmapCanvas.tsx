import { useCallback, useState } from 'react';
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
import { useTournamentQuery } from '@/features/roadmap/hooks/useTournamentQuery';
import { useStageView } from '@/features/roadmap/hooks/useStageView';
import { useRoadmapGraph } from '@/features/roadmap/hooks/useRoadmapGraph';
import { useFitOnChange } from '@/features/roadmap/hooks/useFitOnChange';
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
  return '#2a3547';
}

function Legend({ provider }: { provider: string | null }) {
  const dots: Array<[string, string]> = [
    ['Live', 'bg-live'],
    ['Finished', 'bg-accent'],
    ['Upcoming', 'bg-dim'],
  ];
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-edge bg-surf-1/80 px-3 py-2.5 text-[0.72rem] backdrop-blur">
      <div className="flex items-center gap-3">
        {dots.map(([label, dot]) => (
          <span key={label} className="flex items-center gap-1.5 text-muted">
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
  const { view, setView } = useStageView();
  const { nodes, edges } = useRoadmapGraph(tournament, view);
  const { lod } = useZoomLevel();
  const [selected, setSelected] = useState<string | null>(null);

  useFitOnChange(`${view}:${nodes.length}`);
  useBracketKeyboard(useCallback(() => setSelected(null), []));

  const onNodeClick = useCallback<NodeMouseHandler<RoadmapNode>>((_, node) => {
    if (node.type === 'match') setSelected(node.id);
  }, []);

  return (
    <div className="pitch-grid relative h-full w-full" data-lod={lod}>
      <ReactFlow<RoadmapNode, RoadmapEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.2}
        maxZoom={1.8}
        nodesConnectable={false}
        edgesFocusable={false}
        onlyRenderVisibleElements
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelected(null)}
        panOnScroll
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgba(148,163,184,0.10)" />
        <MiniMap pannable zoomable nodeColor={nodeColor} maskColor="rgba(6,9,16,0.72)" bgColor="#0a0e14" />
        <Controls showInteractive={false} />
        <StageToggle view={view} onChange={setView} />
        <Panel position="top-right">
          <Legend provider={tournament?.meta.provider ?? null} />
        </Panel>
      </ReactFlow>

      <MatchDetailPanel tournament={tournament} matchId={selected} onClose={() => setSelected(null)} />

      {loading && !tournament && (
        <div className="absolute inset-0 grid place-items-center bg-bg/60 backdrop-blur-sm">
          <span className="animate-pulse font-display text-sm uppercase tracking-[0.2em] text-muted">
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
